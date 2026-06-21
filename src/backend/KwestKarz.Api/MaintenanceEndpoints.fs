namespace KwestKarz.Api

open System
open System.IO
open System.Threading.Tasks
open KwestKarz.Domain
open KwestKarz.Infrastructure
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http

module MaintenanceEndpoints =
    let private receiptReadPrompt = "Read this maintenance receipt or invoice. Extract: vendor/shop name, total cost, service date, odometer if visible, maintenance type or service description, and any warranty notes. Return a concise plain-text summary."

    let private toScheduleResponse (s: ServiceSchedule) : ServiceScheduleResponse =
        { EventType = s.EventType
          MileInterval = s.MileInterval
          DayInterval = s.DayInterval
          WarnMilesOut = s.WarnMilesOut
          WarnDaysOut = s.WarnDaysOut }

    let mapMaintenanceEndpoints (app: WebApplication) =
        app.MapGet(
            "/api/maintenance/service-schedules",
            Func<IResult>(fun () ->
                MaintenanceLogic.defaultServiceSchedules
                |> List.map toScheduleResponse
                |> List.toArray
                |> Results.Ok)
        )
        |> ignore

        let group = app.MapGroup("/api/vehicles/{vehicleId:guid}/maintenance")

        group.MapGet(
            "/",
            Func<Guid, IMaintenanceRepository, HttpContext, Task<IResult>>(fun vehicleId repository httpContext ->
                task {
                    let! records = repository.ListForVehicleAsync(vehicleId, httpContext.RequestAborted)
                    return records |> List.map MaintenanceRecordResponse.fromDomain |> List.toArray |> Results.Ok
                })
        )
        |> ignore

        group.MapPost(
            "/",
            Func<Guid, CreateMaintenanceRecordRequest, IMaintenanceRepository, HttpContext, Task<IResult>>(fun vehicleId request repository httpContext ->
                task {
                    if String.IsNullOrWhiteSpace(request.EventType) then
                        return Results.BadRequest("eventType is required.")
                    else
                        let! record = repository.CreateAsync(CreateMaintenanceRecordRequest.toDomain vehicleId request, httpContext.RequestAborted)
                        return Results.Created($"/api/vehicles/{vehicleId}/maintenance/{record.Id}", MaintenanceRecordResponse.fromDomain record)
                })
        )
        |> ignore

        group.MapGet(
            "/{recordId:guid}/documents",
            Func<Guid, Guid, IDocumentRepository, HttpContext, Task<IResult>>(fun _vehicleId recordId documents httpContext ->
                task {
                    let! docs = documents.ListForOwnerAsync(DocumentOwnerType.MaintenanceRecord, recordId, httpContext.RequestAborted)
                    return docs |> List.map DocumentResponse.fromDomain |> List.toArray |> Results.Ok
                })
        )
        |> ignore

        group.MapPost(
            "/{recordId:guid}/receipt",
            Func<Guid, Guid, OpenAIResponsesConnection, IDocumentRepository, HttpContext, Task<IResult>>(fun _vehicleId recordId ai documents httpContext ->
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
                              UserMessage = receiptReadPrompt }

                        let! aiResponse = ai.CompleteWithImageAsync(aiRequest, file.ContentType, imageBase64, httpContext.RequestAborted)

                        let newDocument =
                            { OwnerType = DocumentOwnerType.MaintenanceRecord
                              OwnerId = recordId
                              Kind = DocumentKind.Receipt
                              OriginalFileName = file.FileName
                              ContentType = if String.IsNullOrWhiteSpace(file.ContentType) then "image/jpeg" else file.ContentType
                              StoragePath = ""
                              SizeBytes = int64 contentBytes.Length
                              Description = Some aiResponse.Text
                              ContentBytes = Some contentBytes }

                        let! document = documents.CreateAsync(newDocument, httpContext.RequestAborted)

                        return Results.Ok({ Document = DocumentResponse.fromDomain document; AiText = aiResponse.Text })
                })
        )
        |> ignore

        app
