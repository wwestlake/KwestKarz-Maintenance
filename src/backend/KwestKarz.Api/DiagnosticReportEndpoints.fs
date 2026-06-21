namespace KwestKarz.Api

open System
open System.IO
open KwestKarz.Domain
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http

module DiagnosticReportEndpoints =

    let private toResponse (report: DiagnosticReport) : DiagnosticReportResponse =
        { Id = report.Id
          VehicleId = report.VehicleId
          WorkflowId = report.WorkflowId
          DocumentId = report.DocumentId
          ReportedAt = report.ReportedAt
          FileName = report.FileName
          AiSummary = report.AiSummary
          CreatedAt = report.CreatedAt }

    let mapDiagnosticReportEndpoints (app: WebApplication) =
        let group = app.MapGroup("/api/vehicles/{vehicleId:guid}/diagnostic-reports")

        group.MapGet(
            "/",
            Func<Guid, IDiagnosticReportRepository, HttpContext, _>(fun vehicleId repo httpContext ->
                task {
                    let! reports = repo.ListForVehicleAsync(vehicleId, httpContext.RequestAborted)
                    return Results.Ok(reports |> List.map toResponse)
                })
        )
        |> ignore

        group.MapPost(
            "/upload",
            Func<Guid, IDocumentRepository, IAIConnection, IDiagnosticReportRepository, HttpContext, _>(fun vehicleId documents ai diagnosticReports httpContext ->
                task {
                    let! form = httpContext.Request.ReadFormAsync(httpContext.RequestAborted)
                    let file = form.Files.GetFile("file")

                    if isNull file || file.Length = 0L then
                        return Results.BadRequest("A multipart form PDF named 'file' is required.")
                    elif not (file.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase) || file.ContentType.Contains("pdf", StringComparison.OrdinalIgnoreCase)) then
                        return Results.BadRequest("Only PDF files are accepted.")
                    else
                        use memory = new MemoryStream()
                        use stream = file.OpenReadStream()
                        do! stream.CopyToAsync(memory, httpContext.RequestAborted)
                        let contentBytes = memory.ToArray()
                        let pdfText = MaintenanceLogic.extractPdfText contentBytes

                        let newDocument =
                            { OwnerType = DocumentOwnerType.DiagnosticReport
                              OwnerId = vehicleId
                              Kind = DocumentKind.Obd2Report
                              OriginalFileName = file.FileName
                              ContentType = if String.IsNullOrWhiteSpace(file.ContentType) then "application/pdf" else file.ContentType
                              StoragePath = ""
                              SizeBytes = int64 contentBytes.Length
                              Description = Some "OBD2 diagnostic scan report"
                              ContentBytes = Some contentBytes }

                        let! document = documents.CreateAsync(newDocument, httpContext.RequestAborted)

                        let! aiResponse =
                            ai.CompleteAsync(
                                { SystemInstructions = Some "You extract structured fleet maintenance facts from OBD2 diagnostic reports. Return JSON only. Be conservative and do not invent facts."
                                  UserMessage = MaintenanceLogic.obd2Prompt file.FileName pdfText },
                                httpContext.RequestAborted
                            )

                        let! report =
                            diagnosticReports.CreateAsync(
                                { VehicleId = vehicleId
                                  WorkflowId = None
                                  DocumentId = Some document.Id
                                  ReportedAt = DateTimeOffset.UtcNow
                                  FileName = document.OriginalFileName
                                  AiSummary = aiResponse.Text },
                                httpContext.RequestAborted
                            )

                        return Results.Ok(toResponse report)
                })
        )
        |> ignore

        app
