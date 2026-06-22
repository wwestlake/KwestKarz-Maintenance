namespace KwestKarz.Api

open System
open KwestKarz.Domain
open KwestKarz.Infrastructure
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Npgsql

module AIEndpoints =
    let private systemInstructions =
        """
        You are the KwestKarz fleet maintenance assistant. You have access to detailed vehicle records
        including maintenance history, OBD2 diagnostic results, and attached documents.
        Be practical and direct. Answer based on the supplied data. If interpreting a camera image,
        extract visible labels such as VIN, tire pressure, paint code, emissions labels, part labels,
        receipt totals, and dates. State uncertainty when the image is unclear.
        Do not invent values that are not visible or present in the supplied data.
        """

    let mapAIEndpoints (app: WebApplication) =
        let group = app.MapGroup("/api/ai")

        group.MapPost(
            "/chat",
            Func<AIChatRequest, IAIConnection, IVehicleRepository, IMaintenanceRepository, IDiagnosticReportRepository, IDocumentRepository, NpgsqlDataSource, HttpContext, Threading.Tasks.Task<IResult>>(fun request ai vehicles maintenance diagnosticReports documents dataSource httpContext ->
                task {
                    let! vehicle =
                        match request.VehicleVin with
                        | Some vin when not (String.IsNullOrWhiteSpace vin) -> vehicles.FindByVinAsync(vin, httpContext.RequestAborted)
                        | _ -> Threading.Tasks.Task.FromResult(None)

                    let context =
                        match vehicle with
                        | None -> "No specific vehicle context was provided."
                        | Some vehicle ->
                            let maintenanceTask = maintenance.ListForVehicleAsync(vehicle.Id, httpContext.RequestAborted)
                            let documentsTask = documents.ListForOwnerAsync(DocumentOwnerType.Vehicle, vehicle.Id, httpContext.RequestAborted)
                            let diagnosticsTask = diagnosticReports.ListForVehicleAsync(vehicle.Id, httpContext.RequestAborted)
                            let complianceTask = ComplianceEndpoints.listLatestAsync dataSource vehicle.Id httpContext.RequestAborted
                            Threading.Tasks.Task.WaitAll([| maintenanceTask :> Threading.Tasks.Task; documentsTask :> Threading.Tasks.Task; diagnosticsTask :> Threading.Tasks.Task; complianceTask :> Threading.Tasks.Task |])

                            let allMaintenance = maintenanceTask.Result
                            let vehicleDocuments = documentsTask.Result
                            let reports = diagnosticsTask.Result
                            let complianceRecords = complianceTask.Result |> Array.toList
                            let today = DateOnly.FromDateTime(DateTime.UtcNow)
                            let nextDue = MaintenanceLogic.nextDue today vehicle.CurrentOdometer allMaintenance

                            MaintenanceLogic.richAiContext vehicle allMaintenance nextDue reports vehicleDocuments complianceRecords

                    let aiRequest =
                        { SystemInstructions = Some systemInstructions
                          UserMessage = $"{context}{Environment.NewLine}{Environment.NewLine}User question: {request.Message}" }

                    let! response = ai.CompleteAsync(aiRequest, httpContext.RequestAborted)
                    return Results.Ok({ Text = response.Text; Model = response.Model })
                })
        )
        |> ignore

        group.MapPost(
            "/interpret-image",
            Func<OpenAIResponsesConnection, IVehicleRepository, IMaintenanceRepository, IDiagnosticReportRepository, IDocumentRepository, NpgsqlDataSource, HttpContext, Threading.Tasks.Task<IResult>>(fun ai vehicles maintenance diagnosticReports documents dataSource httpContext ->
                task {
                    let! form = httpContext.Request.ReadFormAsync(httpContext.RequestAborted)
                    let file = form.Files.GetFile("file")
                    let prompt = form["prompt"].ToString()
                    let vehicleVin = form["vehicleVin"].ToString()

                    if isNull file || file.Length = 0L then
                        return Results.BadRequest("A multipart form image named 'file' is required.")
                    else
                        let! vehicle =
                            if String.IsNullOrWhiteSpace(vehicleVin) then
                                Threading.Tasks.Task.FromResult(None)
                            else
                                vehicles.FindByVinAsync(vehicleVin, httpContext.RequestAborted)

                        let context =
                            match vehicle with
                            | None -> "No specific vehicle context was provided."
                            | Some vehicle ->
                                let maintenanceTask = maintenance.ListForVehicleAsync(vehicle.Id, httpContext.RequestAborted)
                                let documentsTask = documents.ListForOwnerAsync(DocumentOwnerType.Vehicle, vehicle.Id, httpContext.RequestAborted)
                                let diagnosticsTask = diagnosticReports.ListForVehicleAsync(vehicle.Id, httpContext.RequestAborted)
                                let complianceTask = ComplianceEndpoints.listLatestAsync dataSource vehicle.Id httpContext.RequestAborted
                                Threading.Tasks.Task.WaitAll([| maintenanceTask :> Threading.Tasks.Task; documentsTask :> Threading.Tasks.Task; diagnosticsTask :> Threading.Tasks.Task; complianceTask :> Threading.Tasks.Task |])

                                let allMaintenance = maintenanceTask.Result
                                let vehicleDocuments = documentsTask.Result
                                let reports = diagnosticsTask.Result
                                let complianceRecords = complianceTask.Result |> Array.toList
                                let today = DateOnly.FromDateTime(DateTime.UtcNow)
                                let nextDue = MaintenanceLogic.nextDue today vehicle.CurrentOdometer allMaintenance

                                MaintenanceLogic.richAiContext vehicle allMaintenance nextDue reports vehicleDocuments complianceRecords

                        use stream = file.OpenReadStream()
                        use memory = new IO.MemoryStream()
                        do! stream.CopyToAsync(memory, httpContext.RequestAborted)
                        let imageBase64 = Convert.ToBase64String(memory.ToArray())
                        let userPrompt =
                            if String.IsNullOrWhiteSpace(prompt) then
                                "Read this vehicle-related image and extract useful maintenance data."
                            else
                                prompt

                        let aiRequest =
                            { SystemInstructions = Some systemInstructions
                              UserMessage = $"{context}{Environment.NewLine}{Environment.NewLine}Task: {userPrompt}" }

                        let! response = ai.CompleteWithImageAsync(aiRequest, file.ContentType, imageBase64, httpContext.RequestAborted)
                        return Results.Ok({ Text = response.Text; Model = response.Model })
                })
        )
        |> ignore

        app
