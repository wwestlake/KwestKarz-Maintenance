namespace KwestKarz.Api

open System
open System.IO
open System.Threading.Tasks
open KwestKarz.Domain
open KwestKarz.Infrastructure
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Npgsql

module MaintenanceEndpoints =
    let private toScheduleResponse (s: ServiceSchedule) : ServiceScheduleResponse =
        { EventType = s.EventType
          MileInterval = s.MileInterval
          DayInterval = s.DayInterval
          WarnMilesOut = s.WarnMilesOut
          WarnDaysOut = s.WarnDaysOut }

    let mapMaintenanceEndpoints (app: WebApplication) =
        app.MapGet(
            "/api/maintenance/fleet-summary",
            Func<IVehicleRepository, IMaintenanceRepository, HttpContext, Task<IResult>>(fun vehicles maintenance httpContext ->
                task {
                    let today = DateOnly.FromDateTime(DateTime.UtcNow)
                    let! allVehicles = vehicles.ListAsync(httpContext.RequestAborted)

                    let! summaries =
                        allVehicles
                        |> List.map (fun vehicle ->
                            task {
                                let! records = maintenance.ListForVehicleAsync(vehicle.Id, httpContext.RequestAborted)

                                let withDue = records |> List.filter (fun r -> r.NextDueDate.IsSome || r.NextDueOdometer.IsSome)
                                let statuses = withDue |> List.map (MaintenanceLogic.dueStatus today vehicle.CurrentOdometer)
                                let overdueCount = statuses |> List.filter ((=) MaintenanceDueStatus.Overdue) |> List.length
                                let dueSoonCount = statuses |> List.filter ((=) MaintenanceDueStatus.DueSoon) |> List.length

                                let nextDueItem = MaintenanceLogic.nextDue today vehicle.CurrentOdometer records
                                let lastMaint = records |> List.tryHead

                                let label =
                                    [ vehicle.Year |> Option.map string; vehicle.Make; vehicle.Model ]
                                    |> List.choose id
                                    |> String.concat " "
                                let label = if label.Trim() = "" then vehicle.Vin else label

                                return {|
                                    vehicleId = vehicle.Id
                                    vin = vehicle.Vin
                                    label = label
                                    status = VehicleStatus.toStorageValue vehicle.Status
                                    currentOdometer = vehicle.CurrentOdometer
                                    fleetPositionNumber = vehicle.FleetPositionNumber
                                    overdueCount = overdueCount
                                    dueSoonCount = dueSoonCount
                                    nextDue =
                                        nextDueItem |> Option.map (fun nd ->
                                            {| eventType = nd.Record.EventType
                                               dueStatus = MaintenanceDueStatus.toStorageValue nd.DueStatus
                                               nextDueDate = nd.Record.NextDueDate |> Option.map (fun d -> d.ToString("yyyy-MM-dd"))
                                               nextDueOdometer = nd.Record.NextDueOdometer |})
                                    lastMaintenanceDate =
                                        lastMaint |> Option.map (fun r -> r.DatePerformed.ToString("yyyy-MM-dd"))
                                |}
                            })
                        |> List.toArray
                        |> Task.WhenAll

                    return summaries |> Results.Ok
                })
        )
        |> ignore

        // Keep old endpoint for backward compat — now reads from DB
        app.MapGet(
            "/api/maintenance/service-schedules",
            Func<NpgsqlDataSource, HttpContext, Task<IResult>>(fun dataSource httpContext ->
                task {
                    let! schedules = MaintenanceTemplateEndpoints.loadSchedulesAsync dataSource httpContext.RequestAborted
                    return schedules |> List.map toScheduleResponse |> List.toArray |> Results.Ok
                })
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
                        let operator = httpContext.Request.Headers.TryGetValue("X-Operator") |> (fun (ok, v) -> if ok then Some(v.ToString()) else None)
                        let! record = repository.CreateAsync(CreateMaintenanceRecordRequest.toDomain vehicleId operator request, httpContext.RequestAborted)
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
                              UserMessage = MaintenanceLogic.receiptReadPrompt }

                        let! aiResponse = ai.CompleteWithImageAsync(aiRequest, file.ContentType, imageBase64, httpContext.RequestAborted)

                        let operator = httpContext.Request.Headers.TryGetValue("X-Operator") |> (fun (ok, v) -> if ok then Some(v.ToString()) else None)
                        let newDocument =
                            { OwnerType = DocumentOwnerType.MaintenanceRecord
                              OwnerId = recordId
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

        app
