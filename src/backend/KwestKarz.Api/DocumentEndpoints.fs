namespace KwestKarz.Api

open System
open System.IO
open KwestKarz.Domain
open KwestKarz.Infrastructure
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http

module DocumentEndpoints =
    let private parseKind value =
        if String.IsNullOrWhiteSpace(value) then
            DocumentKind.Other
        else
            DocumentKind.fromStorageValue value

    let mapDocumentEndpoints (app: WebApplication) =
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

                        let newDocument =
                            { OwnerType = DocumentOwnerType.Vehicle
                              OwnerId = vehicleId
                              Kind = kind
                              OriginalFileName = file.FileName
                              ContentType = if String.IsNullOrWhiteSpace(file.ContentType) then "application/octet-stream" else file.ContentType
                              StoragePath = ""
                              SizeBytes = int64 contentBytes.Length
                              Description = if String.IsNullOrWhiteSpace(description) then None else Some description
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
