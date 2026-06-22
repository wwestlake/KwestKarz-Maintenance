namespace KwestKarz.Api

open System
open System.IO
open KwestKarz.Domain
open KwestKarz.Infrastructure
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Npgsql
open NpgsqlTypes

module DocumentEndpoints =
    let private parseKind value =
        if String.IsNullOrWhiteSpace(value) then
            DocumentKind.Other
        else
            DocumentKind.fromStorageValue value

    let mapDocumentEndpoints (app: WebApplication) =
        // All documents for a vehicle across every owner type
        app.MapGet(
            "/api/vehicles/{vehicleId:guid}/documents/all",
            Func<Guid, NpgsqlDataSource, HttpContext, Threading.Tasks.Task<IResult>>(fun vehicleId dataSource httpContext ->
                task {
                    let cols = "id, owner_type, owner_id, kind, original_file_name, content_type, storage_path, size_bytes, description, created_by, created_at"
                    use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                    use command =
                        new NpgsqlCommand(
                            $"""
                            select {cols} from kwestkarzbusinessdata.documents
                            where owner_type = 'Vehicle' and owner_id = @vid
                            union all
                            select d.{cols} from kwestkarzbusinessdata.documents d
                            join kwestkarzbusinessdata.maintenance_records m on d.owner_id = m.id
                            where d.owner_type = 'MaintenanceRecord' and m.vehicle_id = @vid
                            union all
                            select {cols} from kwestkarzbusinessdata.documents
                            where owner_type = 'DiagnosticReport' and owner_id = @vid
                            order by created_at desc
                            """,
                            connection
                        )
                    command.Parameters.AddWithValue("vid", NpgsqlDbType.Uuid, vehicleId) |> ignore
                    use! reader = command.ExecuteReaderAsync(httpContext.RequestAborted)
                    let getOption name getter =
                        let ord = reader.GetOrdinal(name)
                        if reader.IsDBNull(ord) then None else Some(getter ord)
                    let docs = ResizeArray()
                    let mutable keep = true
                    while keep do
                        let! hasRow = reader.ReadAsync(httpContext.RequestAborted)
                        if hasRow then
                            docs.Add(
                                {| id = reader.GetGuid(reader.GetOrdinal("id"))
                                   ownerType = reader.GetString(reader.GetOrdinal("owner_type"))
                                   ownerId = reader.GetGuid(reader.GetOrdinal("owner_id"))
                                   kind = reader.GetString(reader.GetOrdinal("kind"))
                                   originalFileName = reader.GetString(reader.GetOrdinal("original_file_name"))
                                   contentType = reader.GetString(reader.GetOrdinal("content_type"))
                                   sizeBytes = reader.GetInt64(reader.GetOrdinal("size_bytes"))
                                   description = getOption "description" reader.GetString
                                   createdBy = getOption "created_by" reader.GetString
                                   createdAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("created_at")) |})
                        else keep <- false
                    return docs |> Seq.toArray |> Results.Ok
                })
        )
        |> ignore

        let vehicleDocuments = app.MapGroup("/api/vehicles/{vehicleId:guid}/documents")

        vehicleDocuments.MapGet(
            "/",
            Func<Guid, IDocumentRepository, HttpContext, Threading.Tasks.Task<IResult>>(fun vehicleId repository httpContext ->
                task {
                    let! documents = repository.ListForOwnerAsync(DocumentOwnerType.Vehicle, vehicleId, httpContext.RequestAborted)
                    return documents |> List.map DocumentResponse.fromDomain |> List.toArray |> Results.Ok
                })
        )
        |> ignore

        vehicleDocuments.MapPost(
            "/receipt",
            Func<Guid, OpenAIResponsesConnection, IDocumentRepository, HttpContext, Threading.Tasks.Task<IResult>>(fun vehicleId ai documents httpContext ->
                task {
                    let! form = httpContext.Request.ReadFormAsync(httpContext.RequestAborted)
                    let file = form.Files.GetFile("file")

                    if isNull file || file.Length = 0L then
                        return Results.BadRequest("A multipart form image named 'file' is required.")
                    else
                        use stream = file.OpenReadStream()
                        use memory = new MemoryStream()
                        do! stream.CopyToAsync(memory, httpContext.RequestAborted)
                        let contentBytes = memory.ToArray()
                        let imageBase64 = Convert.ToBase64String(contentBytes)

                        let aiRequest =
                            { SystemInstructions = Some "You are a fleet maintenance assistant reading receipts and invoices for a car rental operation."
                              UserMessage = MaintenanceLogic.receiptReadPrompt }

                        let! aiResponse = ai.CompleteWithImageAsync(aiRequest, file.ContentType, imageBase64, httpContext.RequestAborted)

                        let operator = httpContext.Request.Headers.TryGetValue("X-Operator") |> (fun (ok, v) -> if ok then Some(v.ToString()) else None)
                        let newDocument =
                            { OwnerType = DocumentOwnerType.Vehicle
                              OwnerId = vehicleId
                              Kind = DocumentKind.Receipt
                              OriginalFileName = file.FileName
                              ContentType = if String.IsNullOrWhiteSpace(file.ContentType) then "image/jpeg" else file.ContentType
                              StoragePath = ""
                              SizeBytes = int64 contentBytes.Length
                              Description = Some aiResponse.Text
                              CreatedBy = operator
                              ContentBytes = Some contentBytes }

                        let! document = documents.CreateAsync(newDocument, httpContext.RequestAborted)
                        return Results.Ok({ Document = DocumentResponse.fromDomain document; AiText = aiResponse.Text })
                })
        )
        |> ignore

        vehicleDocuments.MapPost(
            "/",
            Func<Guid, IDocumentRepository, HttpContext, Threading.Tasks.Task<IResult>>(fun vehicleId repository httpContext ->
                task {
                    let! form = httpContext.Request.ReadFormAsync(httpContext.RequestAborted)
                    let file = form.Files.GetFile("file")

                    if isNull file || file.Length = 0L then
                        return Results.BadRequest("A multipart form file named 'file' is required.")
                    else
                        let kind = form["kind"].ToString() |> parseKind
                        let description = form["description"].ToString()
                        use memory = new MemoryStream()
                        use stream = file.OpenReadStream()
                        do! stream.CopyToAsync(memory, httpContext.RequestAborted)
                        let contentBytes = memory.ToArray()

                        let operator = httpContext.Request.Headers.TryGetValue("X-Operator") |> (fun (ok, v) -> if ok then Some(v.ToString()) else None)
                        let newDocument =
                            { OwnerType = DocumentOwnerType.Vehicle
                              OwnerId = vehicleId
                              Kind = kind
                              OriginalFileName = file.FileName
                              ContentType = if String.IsNullOrWhiteSpace(file.ContentType) then "application/octet-stream" else file.ContentType
                              StoragePath = ""
                              SizeBytes = int64 contentBytes.Length
                              Description = if String.IsNullOrWhiteSpace(description) then None else Some description
                              CreatedBy = operator
                              ContentBytes = Some contentBytes }

                        let! document = repository.CreateAsync(newDocument, httpContext.RequestAborted)
                        return Results.Created($"/api/documents/{document.Id}", DocumentResponse.fromDomain document)
                })
        )
        |> ignore

        app.MapGet(
            "/api/documents/{documentId:guid}/content",
            Func<Guid, IDocumentRepository, FileStorage, HttpContext, Threading.Tasks.Task<IResult>>(fun documentId repository storage httpContext ->
                task {
                    let! documentContent = repository.FindContentAsync(documentId, httpContext.RequestAborted)

                    return
                        match documentContent with
                        | None -> Results.NotFound()
                        | Some { Document = document; ContentBytes = Some contentBytes } ->
                            Results.File(contentBytes, document.ContentType, document.OriginalFileName)
                        | Some { Document = document; ContentBytes = None } when not (storage.Exists(document.StoragePath)) ->
                            Results.NotFound("Stored file is missing.")
                        | Some { Document = document; ContentBytes = None } ->
                            let stream = storage.OpenRead(document.StoragePath)
                            Results.File(stream, document.ContentType, document.OriginalFileName)
                })
        )
        |> ignore

        app
