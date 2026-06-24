namespace KwestKarz.Api

open System
open System.IO
open System.Net.Http
open System.Text
open System.Text.Json
open System.Threading.Tasks
open KwestKarz.Domain
open KwestKarz.Infrastructure
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Npgsql
open NpgsqlTypes
open UglyToad.PdfPig

module WorkflowEndpoints =
    let private workflowTypes =
        set [ "AddVehicle"; "RentalInspection"; "MaintenanceIntake"; "DamageReview"; "ComplianceRenewal"; "TechnicalCheck" ]

    let private inspectionKinds = set [ "Pre"; "Post"; "Both" ]

    let private workflowStatuses = set [ "Draft"; "InProgress"; "Waiting"; "Complete"; "Canceled" ]
    let private stepStatuses = set [ "NotStarted"; "InProgress"; "NeedsReview"; "Complete"; "Skipped"; "Problem" ]

    let private optionOrDbNull value =
        match value with
        | Some value -> box value
        | None -> box DBNull.Value

    let private defaultTitle workflowType =
        match workflowType with
        | "AddVehicle" -> "Add Vehicle to Inventory"
        | "RentalInspection" -> "Rental Inspection"
        | "MaintenanceIntake" -> "Maintenance Intake"
        | "DamageReview" -> "Damage Review"
        | "ComplianceRenewal" -> "Compliance Renewal"
        | "TechnicalCheck" -> "Technical Check"
        | _ -> workflowType

    let private defaultSteps workflowType =
        match workflowType with
        | "AddVehicle" ->
            [| ("vin", "VIN")
               ("vehicleBasics", "Vehicle Basics")
               ("licensePlate", "License Plate")
               ("registration", "Registration")
               ("insurance", "Insurance")
               ("lockBox", "Lock Box")
               ("photosOdometer", "Photos / Odometer")
               ("review", "Review") |]
        | "RentalInspection" ->
            [| ("vehicle", "Vehicle")
               ("inspectionKind", "Inspection Kind")
               ("odometerFuel", "Odometer / Fuel")
               ("photos", "Photos")
               ("tires", "Tires")
               ("damage", "Damage")
               ("review", "Review") |]
        | "MaintenanceIntake" ->
            [| ("vehicle", "Vehicle")
               ("service", "Service")
               ("receipt", "Receipt")
               ("followUp", "Follow Up")
               ("review", "Review") |]
        | "DamageReview" ->
            [| ("vehicle", "Vehicle")
               ("photos", "Photos")
               ("estimate", "Estimate")
               ("repair", "Repair")
               ("review", "Review") |]
        | "ComplianceRenewal" ->
            [| ("vehicle", "Vehicle")
               ("registration", "Registration")
               ("insurance", "Insurance")
               ("plate", "Plate")
               ("review", "Review") |]
        | "TechnicalCheck" ->
            [| ("returnIntake", "Return Intake")
               ("underHood", "Under Hood")
               ("fluids", "Fluids")
               ("batteryCharging", "Battery / Charging")
               ("obd2Scan", "OBD2 Scan Report")
               ("idleRoadCheck", "Idle / Road Check")
               ("issues", "Issues")
               ("review", "Review") |]
        | _ -> [| ("start", "Start"); ("review", "Review") |]

    let private jsonOrEmpty (value: JsonElement option) =
        match value with
        | Some json -> json.GetRawText()
        | None -> "{}"

    let private truncate maxLength (value: string) =
        if String.IsNullOrWhiteSpace(value) then
            ""
        elif value.Length <= maxLength then
            value
        else
            value.Substring(0, maxLength)

    let private updateStepDataAsync (connection: NpgsqlConnection) workflowId stepKey status data cancellationToken =
        task {
            use command =
                new NpgsqlCommand(
                    """
                    update kwestkarzbusinessdata.workflow_steps
                    set status = @status,
                        data = @data::jsonb,
                        updated_at = @updated_at
                    where workflow_id = @workflow_id and step_key = @step_key
                    """,
                    connection
                )

            let now = DateTimeOffset.UtcNow
            command.Parameters.AddWithValue("workflow_id", NpgsqlDbType.Uuid, workflowId) |> ignore
            command.Parameters.AddWithValue("step_key", NpgsqlDbType.Text, stepKey) |> ignore
            command.Parameters.AddWithValue("status", NpgsqlDbType.Text, status) |> ignore
            command.Parameters.AddWithValue("data", NpgsqlDbType.Text, data) |> ignore
            command.Parameters.AddWithValue("updated_at", NpgsqlDbType.TimestampTz, now) |> ignore
            let! rows = command.ExecuteNonQueryAsync(cancellationToken)

            if rows > 0 then
                use workflowCommand =
                    new NpgsqlCommand(
                        """
                        update kwestkarzbusinessdata.workflow_instances
                        set status = case when status = 'Draft' then 'InProgress' else status end,
                            current_step_key = @step_key,
                            updated_at = @updated_at
                        where id = @workflow_id
                        """,
                        connection
                    )

                workflowCommand.Parameters.AddWithValue("workflow_id", NpgsqlDbType.Uuid, workflowId) |> ignore
                workflowCommand.Parameters.AddWithValue("step_key", NpgsqlDbType.Text, stepKey) |> ignore
                workflowCommand.Parameters.AddWithValue("updated_at", NpgsqlDbType.TimestampTz, now) |> ignore
                let! _ = workflowCommand.ExecuteNonQueryAsync(cancellationToken)
                ()

            return rows
        }

    let private readOptionalGuid (reader: NpgsqlDataReader) name =
        let ordinal = reader.GetOrdinal(name)
        if reader.IsDBNull(ordinal) then None else Some(reader.GetGuid(ordinal))

    let private readOptionalDateTimeOffset (reader: NpgsqlDataReader) name =
        let ordinal = reader.GetOrdinal(name)
        if reader.IsDBNull(ordinal) then None else Some(reader.GetFieldValue<DateTimeOffset>(ordinal))

    let private readJson (reader: NpgsqlDataReader) name =
        use document = JsonDocument.Parse(reader.GetString(reader.GetOrdinal(name)))
        document.RootElement.Clone()

    let private mapStep (reader: NpgsqlDataReader) =
        { Id = reader.GetGuid(reader.GetOrdinal("step_id"))
          WorkflowId = reader.GetGuid(reader.GetOrdinal("workflow_id"))
          StepKey = reader.GetString(reader.GetOrdinal("step_key"))
          Title = reader.GetString(reader.GetOrdinal("step_title"))
          Status = reader.GetString(reader.GetOrdinal("step_status"))
          SortOrder = reader.GetInt32(reader.GetOrdinal("sort_order"))
          Data = readJson reader "step_data"
          CreatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("step_created_at"))
          UpdatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("step_updated_at")) }

    let private fetchWorkflowAsync (dataSource: NpgsqlDataSource) workflowId cancellationToken =
        task {
            use! connection = dataSource.OpenConnectionAsync(cancellationToken)
            use command =
                new NpgsqlCommand(
                    """
                    select
                        wi.id, wi.workflow_type, wi.title, wi.status, wi.vehicle_id, wi.current_step_key,
                        wi.created_at, wi.updated_at, wi.completed_at, wi.canceled_at,
                        ws.id as step_id, ws.workflow_id, ws.step_key, ws.title as step_title,
                        ws.status as step_status, ws.sort_order, ws.data::text as step_data,
                        ws.created_at as step_created_at, ws.updated_at as step_updated_at
                    from kwestkarzbusinessdata.workflow_instances wi
                    left join kwestkarzbusinessdata.workflow_steps ws on ws.workflow_id = wi.id
                    where wi.id = @id
                    order by ws.sort_order
                    """,
                    connection
                )

            command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, workflowId) |> ignore
            use! reader = command.ExecuteReaderAsync(cancellationToken)
            let steps = ResizeArray<WorkflowStepResponse>()
            let mutable instance: WorkflowInstanceResponse option = None
            let mutable keepReading = true

            while keepReading do
                let! hasRow = reader.ReadAsync(cancellationToken)
                if hasRow then
                    if instance.IsNone then
                        instance <-
                            Some
                                { Id = reader.GetGuid(reader.GetOrdinal("id"))
                                  WorkflowType = reader.GetString(reader.GetOrdinal("workflow_type"))
                                  Title = reader.GetString(reader.GetOrdinal("title"))
                                  Status = reader.GetString(reader.GetOrdinal("status"))
                                  VehicleId = readOptionalGuid reader "vehicle_id"
                                  CurrentStepKey = reader.GetString(reader.GetOrdinal("current_step_key"))
                                  CreatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("created_at"))
                                  UpdatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("updated_at"))
                                  CompletedAt = readOptionalDateTimeOffset reader "completed_at"
                                  CanceledAt = readOptionalDateTimeOffset reader "canceled_at"
                                  Steps = Array.empty }

                    if not (reader.IsDBNull(reader.GetOrdinal("step_id"))) then
                        steps.Add(mapStep reader)
                else
                    keepReading <- false

            return instance |> Option.map (fun workflow -> { workflow with Steps = steps.ToArray() })
        }

    let private listWorkflowsAsync (dataSource: NpgsqlDataSource) includeCompleted cancellationToken =
        task {
            use! connection = dataSource.OpenConnectionAsync(cancellationToken)
            use command =
                new NpgsqlCommand(
                    """
                    select id
                    from kwestkarzbusinessdata.workflow_instances
                    where @include_completed or status not in ('Complete', 'Canceled')
                    order by updated_at desc
                    limit 100
                    """,
                    connection
                )

            command.Parameters.AddWithValue("include_completed", NpgsqlDbType.Boolean, includeCompleted) |> ignore
            use! reader = command.ExecuteReaderAsync(cancellationToken)
            let ids = ResizeArray<Guid>()
            let mutable keepReading = true

            while keepReading do
                let! hasRow = reader.ReadAsync(cancellationToken)
                if hasRow then ids.Add(reader.GetGuid(0)) else keepReading <- false

            let results = ResizeArray<WorkflowInstanceResponse>()
            for id in ids do
                let! workflow = fetchWorkflowAsync dataSource id cancellationToken
                workflow |> Option.iter results.Add

            return results.ToArray()
        }

    let private insertEventAsync (connection: NpgsqlConnection) workflowId stepKey eventType message data createdBy cancellationToken =
        task {
            use command =
                new NpgsqlCommand(
                    """
                    insert into kwestkarzbusinessdata.workflow_events (
                        id, workflow_id, step_key, event_type, message, data, created_by, created_at
                    )
                    values (@id, @workflow_id, @step_key, @event_type, @message, @data::jsonb, @created_by, @created_at)
                    """,
                    connection
                )

            command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, Guid.NewGuid()) |> ignore
            command.Parameters.AddWithValue("workflow_id", NpgsqlDbType.Uuid, workflowId) |> ignore
            command.Parameters.AddWithValue("step_key", NpgsqlDbType.Text, optionOrDbNull stepKey) |> ignore
            command.Parameters.AddWithValue("event_type", NpgsqlDbType.Text, eventType) |> ignore
            command.Parameters.AddWithValue("message", NpgsqlDbType.Text, optionOrDbNull message) |> ignore
            command.Parameters.AddWithValue("data", NpgsqlDbType.Text, data) |> ignore
            command.Parameters.AddWithValue("created_by", NpgsqlDbType.Text, optionOrDbNull createdBy) |> ignore
            command.Parameters.AddWithValue("created_at", NpgsqlDbType.TimestampTz, DateTimeOffset.UtcNow) |> ignore
            let! _ = command.ExecuteNonQueryAsync(cancellationToken)
            return ()
        }

    let mapWorkflowEndpoints (app: WebApplication) =
        let group = app.MapGroup("/api/workflows")

        group.MapGet(
            "/",
            Func<bool, NpgsqlDataSource, HttpContext, Task<IResult>>(fun includeCompleted dataSource httpContext ->
                task {
                    let! workflows = listWorkflowsAsync dataSource includeCompleted httpContext.RequestAborted
                    return Results.Ok(workflows)
                })
        )
        |> ignore

        group.MapPost(
            "/",
            Func<CreateWorkflowRequest, NpgsqlDataSource, HttpContext, Task<IResult>>(fun request dataSource httpContext ->
                task {
                    if not (workflowTypes.Contains request.WorkflowType) then
                        return Results.BadRequest("Unsupported workflow type.")
                    elif request.WorkflowType = "RentalInspection"
                         && request.InspectionKind.IsSome
                         && not (inspectionKinds.Contains request.InspectionKind.Value) then
                        return Results.BadRequest("inspectionKind must be Pre, Post, or Both.")
                    else
                        let workflowId = Guid.NewGuid()
                        let now = DateTimeOffset.UtcNow
                        let steps = defaultSteps request.WorkflowType
                        let currentStepKey = steps |> Array.head |> fst
                        let inspectionKind = request.InspectionKind |> Option.defaultValue "Pre"
                        let defaultWorkflowTitle =
                            if request.WorkflowType = "RentalInspection" then
                                $"Rental Inspection ({inspectionKind})"
                            else
                                defaultTitle request.WorkflowType
                        let title = request.Title |> Option.filter (String.IsNullOrWhiteSpace >> not) |> Option.defaultValue defaultWorkflowTitle

                        use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                        use! transaction = connection.BeginTransactionAsync(httpContext.RequestAborted)

                        use insertWorkflow =
                            new NpgsqlCommand(
                                """
                                insert into kwestkarzbusinessdata.workflow_instances (
                                    id, workflow_type, title, status, vehicle_id, current_step_key,
                                    created_at, updated_at, completed_at, canceled_at
                                )
                                values (
                                    @id, @workflow_type, @title, 'Draft', @vehicle_id, @current_step_key,
                                    @created_at, @updated_at, null, null
                                )
                                """,
                                connection,
                                transaction
                            )

                        insertWorkflow.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, workflowId) |> ignore
                        insertWorkflow.Parameters.AddWithValue("workflow_type", NpgsqlDbType.Text, request.WorkflowType) |> ignore
                        insertWorkflow.Parameters.AddWithValue("title", NpgsqlDbType.Text, title) |> ignore
                        insertWorkflow.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, optionOrDbNull request.VehicleId) |> ignore
                        insertWorkflow.Parameters.AddWithValue("current_step_key", NpgsqlDbType.Text, currentStepKey) |> ignore
                        insertWorkflow.Parameters.AddWithValue("created_at", NpgsqlDbType.TimestampTz, now) |> ignore
                        insertWorkflow.Parameters.AddWithValue("updated_at", NpgsqlDbType.TimestampTz, now) |> ignore
                        let! _ = insertWorkflow.ExecuteNonQueryAsync(httpContext.RequestAborted)

                        for index, (stepKey, stepTitle) in steps |> Array.indexed do
                            use insertStep =
                                new NpgsqlCommand(
                                    """
                                    insert into kwestkarzbusinessdata.workflow_steps (
                                        id, workflow_id, step_key, title, status, sort_order, data, created_at, updated_at
                                    )
                                    values (@id, @workflow_id, @step_key, @title, @status, @sort_order, @data::jsonb, @created_at, @updated_at)
                                    """,
                                    connection,
                                    transaction
                                )

                            insertStep.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, Guid.NewGuid()) |> ignore
                            insertStep.Parameters.AddWithValue("workflow_id", NpgsqlDbType.Uuid, workflowId) |> ignore
                            insertStep.Parameters.AddWithValue("step_key", NpgsqlDbType.Text, stepKey) |> ignore
                            insertStep.Parameters.AddWithValue("title", NpgsqlDbType.Text, stepTitle) |> ignore
                            insertStep.Parameters.AddWithValue("status", NpgsqlDbType.Text, if index = 0 then "InProgress" else "NotStarted") |> ignore
                            insertStep.Parameters.AddWithValue("sort_order", NpgsqlDbType.Integer, index) |> ignore
                            let data =
                                if request.WorkflowType = "RentalInspection" && stepKey = "inspectionKind" then
                                    JsonSerializer.Serialize {| inspectionKind = inspectionKind |}
                                else
                                    "{}"
                            insertStep.Parameters.AddWithValue("data", NpgsqlDbType.Jsonb, data) |> ignore
                            insertStep.Parameters.AddWithValue("created_at", NpgsqlDbType.TimestampTz, now) |> ignore
                            insertStep.Parameters.AddWithValue("updated_at", NpgsqlDbType.TimestampTz, now) |> ignore
                            let! _ = insertStep.ExecuteNonQueryAsync(httpContext.RequestAborted)
                            ()

                        let operator = httpContext.Request.Headers.TryGetValue("X-Operator") |> (fun (ok, v) -> if ok then Some(v.ToString()) else None)
                        do! insertEventAsync connection workflowId None "Created" (Some title) "{}" operator httpContext.RequestAborted
                        do! transaction.CommitAsync(httpContext.RequestAborted)

                        let! workflow = fetchWorkflowAsync dataSource workflowId httpContext.RequestAborted
                        return Results.Created($"/api/workflows/{workflowId}", workflow.Value)
                })
        )
        |> ignore

        group.MapGet(
            "/{workflowId:guid}",
            Func<Guid, NpgsqlDataSource, HttpContext, Task<IResult>>(fun workflowId dataSource httpContext ->
                task {
                    let! workflow = fetchWorkflowAsync dataSource workflowId httpContext.RequestAborted
                    return
                        match workflow with
                        | Some item -> Results.Ok(item)
                        | None -> Results.NotFound()
                })
        )
        |> ignore

        group.MapPut(
            "/{workflowId:guid}/steps/{stepKey}",
            Func<Guid, string, UpdateWorkflowStepRequest, NpgsqlDataSource, HttpContext, Task<IResult>>(fun workflowId stepKey request dataSource httpContext ->
                task {
                    if not (stepStatuses.Contains request.Status) then
                        return Results.BadRequest("Unsupported step status.")
                    else
                        use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                        use command =
                            new NpgsqlCommand(
                                """
                                update kwestkarzbusinessdata.workflow_steps
                                set status = @status,
                                    data = @data::jsonb,
                                    updated_at = @updated_at
                                where workflow_id = @workflow_id and step_key = @step_key
                                """,
                                connection
                            )

                        let now = DateTimeOffset.UtcNow
                        command.Parameters.AddWithValue("workflow_id", NpgsqlDbType.Uuid, workflowId) |> ignore
                        command.Parameters.AddWithValue("step_key", NpgsqlDbType.Text, stepKey) |> ignore
                        command.Parameters.AddWithValue("status", NpgsqlDbType.Text, request.Status) |> ignore
                        command.Parameters.AddWithValue("data", NpgsqlDbType.Text, jsonOrEmpty request.Data) |> ignore
                        command.Parameters.AddWithValue("updated_at", NpgsqlDbType.TimestampTz, now) |> ignore
                        let! rows = command.ExecuteNonQueryAsync(httpContext.RequestAborted)

                        if rows = 0 then
                            return Results.NotFound()
                        else
                            use workflowCommand =
                                new NpgsqlCommand(
                                    """
                                    update kwestkarzbusinessdata.workflow_instances
                                    set status = case when status = 'Draft' then 'InProgress' else status end,
                                        current_step_key = case when @make_current then @step_key else current_step_key end,
                                        updated_at = @updated_at
                                    where id = @workflow_id
                                    """,
                                    connection
                                )

                            workflowCommand.Parameters.AddWithValue("workflow_id", NpgsqlDbType.Uuid, workflowId) |> ignore
                            workflowCommand.Parameters.AddWithValue("step_key", NpgsqlDbType.Text, stepKey) |> ignore
                            workflowCommand.Parameters.AddWithValue("make_current", NpgsqlDbType.Boolean, request.MakeCurrent |> Option.defaultValue true) |> ignore
                            workflowCommand.Parameters.AddWithValue("updated_at", NpgsqlDbType.TimestampTz, now) |> ignore
                            let! _ = workflowCommand.ExecuteNonQueryAsync(httpContext.RequestAborted)
                            let operator = httpContext.Request.Headers.TryGetValue("X-Operator") |> (fun (ok, v) -> if ok then Some(v.ToString()) else None)
                            do! insertEventAsync connection workflowId (Some stepKey) "StepSaved" (Some request.Status) (jsonOrEmpty request.Data) operator httpContext.RequestAborted
                            let! workflow = fetchWorkflowAsync dataSource workflowId httpContext.RequestAborted
                            return Results.Ok(workflow.Value)
                })
        )
        |> ignore

        group.MapPost(
            "/{workflowId:guid}/steps/{stepKey}/obd2-report",
            Func<Guid, string, IDocumentRepository, IAIConnection, IDiagnosticReportRepository, NpgsqlDataSource, HttpContext, Task<IResult>>(fun workflowId stepKey documents ai diagnosticReports dataSource httpContext ->
                task {
                    if stepKey <> "obd2Scan" then
                        return Results.BadRequest("OBD2 reports can only be uploaded to the obd2Scan step.")
                    else
                        let! form = httpContext.Request.ReadFormAsync(httpContext.RequestAborted)
                        let file = form.Files.GetFile("file")

                        if isNull file || file.Length = 0L then
                            return Results.BadRequest("A multipart form PDF named 'file' is required.")
                        elif not (file.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase) || file.ContentType.Contains("pdf", StringComparison.OrdinalIgnoreCase)) then
                            return Results.BadRequest("Upload the RepairSolutions2/Innova report as a PDF.")
                        else
                            use memory = new MemoryStream()
                            use stream = file.OpenReadStream()
                            do! stream.CopyToAsync(memory, httpContext.RequestAborted)
                            let contentBytes = memory.ToArray()
                            let pdfText = MaintenanceLogic.extractPdfText contentBytes

                            let operator = httpContext.Request.Headers.TryGetValue("X-Operator") |> (fun (ok, v) -> if ok then Some(v.ToString()) else None)
                            let newDocument =
                                { OwnerType = DocumentOwnerType.DiagnosticReport
                                  OwnerId = workflowId
                                  Kind = DocumentKind.Obd2Report
                                  OriginalFileName = file.FileName
                                  ContentType = if String.IsNullOrWhiteSpace(file.ContentType) then "application/pdf" else file.ContentType
                                  StoragePath = ""
                                  SizeBytes = int64 contentBytes.Length
                                  Description = Some "OBD2 diagnostic scan report"
                                  CreatedBy = operator
                                  ContentBytes = Some contentBytes }

                            let! document = documents.CreateAsync(newDocument, httpContext.RequestAborted)

                            let! aiResponse =
                                ai.CompleteAsync(
                                    { SystemInstructions = Some "You extract structured fleet maintenance facts from OBD2 diagnostic reports. Return JSON only. Be conservative and do not invent facts."
                                      UserMessage = MaintenanceLogic.obd2Prompt file.FileName pdfText },
                                    httpContext.RequestAborted
                                )

                            let data =
                                JsonSerializer.Serialize(
                                    {| documentId = document.Id
                                       fileName = document.OriginalFileName
                                       contentType = document.ContentType
                                       uploadedAt = document.CreatedAt
                                       extractedTextPreview = truncate 4000 pdfText
                                       aiText = aiResponse.Text |}
                                )

                            use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                            let! rows = updateStepDataAsync connection workflowId stepKey "NeedsReview" data httpContext.RequestAborted

                            if rows = 0 then
                                return Results.NotFound()
                            else
                                do! insertEventAsync connection workflowId (Some stepKey) "Obd2ReportUploaded" (Some document.OriginalFileName) data operator httpContext.RequestAborted
                                let! workflow = fetchWorkflowAsync dataSource workflowId httpContext.RequestAborted
                                match workflow.Value.VehicleId with
                                | Some vehicleId ->
                                    let! _ =
                                        diagnosticReports.CreateAsync(
                                            { VehicleId = vehicleId
                                              WorkflowId = Some workflowId
                                              DocumentId = Some document.Id
                                              ReportedAt = DateTimeOffset.UtcNow
                                              FileName = document.OriginalFileName
                                              AiSummary = aiResponse.Text },
                                            httpContext.RequestAborted
                                        )
                                    ()
                                | None -> ()
                                return
                                    Results.Ok(
                                        { Workflow = workflow.Value
                                          DocumentId = document.Id
                                          AiText = aiResponse.Text
                                          ExtractedText = truncate 12000 pdfText }
                                    )
                })
        )
        |> ignore

        group.MapPost(
            "/{workflowId:guid}/steps/{stepKey}/obd2-report-url",
            Func<Guid, string, Obd2ReportUrlRequest, IDocumentRepository, IAIConnection, IDiagnosticReportRepository, NpgsqlDataSource, IHttpClientFactory, HttpContext, Task<IResult>>(fun workflowId stepKey request documents ai diagnosticReports dataSource httpClientFactory httpContext ->
                task {
                    if stepKey <> "obd2Scan" then
                        return Results.BadRequest("OBD2 reports can only be uploaded to the obd2Scan step.")
                    elif String.IsNullOrWhiteSpace(request.Url) then
                        return Results.BadRequest("A 'url' field is required.")
                    else
                        let mutable parsedUri: Uri = null
                        let validUrl =
                            Uri.TryCreate(request.Url, UriKind.Absolute, &parsedUri) &&
                            (parsedUri.Scheme = "http" || parsedUri.Scheme = "https")
                        if not validUrl then
                            return Results.BadRequest("URL must be an absolute http or https URL.")
                        else
                            try
                                let client = httpClientFactory.CreateClient()
                                client.Timeout <- TimeSpan.FromSeconds(60.0)
                                use! response = client.GetAsync(request.Url, httpContext.RequestAborted)
                                if not response.IsSuccessStatusCode then
                                    return Results.BadRequest($"Could not download report: HTTP {int response.StatusCode}.")
                                else
                                    let contentType =
                                        let ct = response.Content.Headers.ContentType
                                        if isNull ct || isNull ct.MediaType then "application/pdf" else ct.MediaType
                                    let fileName =
                                        let last = parsedUri.Segments |> Array.last
                                        let decoded = Uri.UnescapeDataString(last).Split('?').[0]
                                        if decoded.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase) then decoded
                                        else "obd2-report.pdf"
                                    if not (contentType.Contains("pdf", StringComparison.OrdinalIgnoreCase) ||
                                            fileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase)) then
                                        return Results.BadRequest("The URL does not appear to point to a PDF file.")
                                    else
                                        let! contentBytes = response.Content.ReadAsByteArrayAsync(httpContext.RequestAborted)
                                        let pdfText = MaintenanceLogic.extractPdfText contentBytes
                                        let operator = httpContext.Request.Headers.TryGetValue("X-Operator") |> (fun (ok, v) -> if ok then Some(v.ToString()) else None)
                                        let newDocument =
                                            { OwnerType = DocumentOwnerType.DiagnosticReport
                                              OwnerId = workflowId
                                              Kind = DocumentKind.Obd2Report
                                              OriginalFileName = fileName
                                              ContentType = contentType
                                              StoragePath = ""
                                              SizeBytes = int64 contentBytes.Length
                                              Description = Some "OBD2 diagnostic scan report"
                                              CreatedBy = operator
                                              ContentBytes = Some contentBytes }
                                        let! document = documents.CreateAsync(newDocument, httpContext.RequestAborted)
                                        let! aiResponse =
                                            ai.CompleteAsync(
                                                { SystemInstructions = Some "You extract structured fleet maintenance facts from OBD2 diagnostic reports. Return JSON only. Be conservative and do not invent facts."
                                                  UserMessage = MaintenanceLogic.obd2Prompt fileName pdfText },
                                                httpContext.RequestAborted
                                            )
                                        let data =
                                            JsonSerializer.Serialize(
                                                {| documentId = document.Id
                                                   fileName = document.OriginalFileName
                                                   contentType = document.ContentType
                                                   uploadedAt = document.CreatedAt
                                                   extractedTextPreview = truncate 4000 pdfText
                                                   aiText = aiResponse.Text |}
                                            )
                                        use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                                        let! rows = updateStepDataAsync connection workflowId stepKey "NeedsReview" data httpContext.RequestAborted
                                        if rows = 0 then
                                            return Results.NotFound()
                                        else
                                            do! insertEventAsync connection workflowId (Some stepKey) "Obd2ReportUploaded" (Some fileName) data operator httpContext.RequestAborted
                                            let! workflow = fetchWorkflowAsync dataSource workflowId httpContext.RequestAborted
                                            match workflow.Value.VehicleId with
                                            | Some vehicleId ->
                                                let! _ =
                                                    diagnosticReports.CreateAsync(
                                                        { VehicleId = vehicleId
                                                          WorkflowId = Some workflowId
                                                          DocumentId = Some document.Id
                                                          ReportedAt = DateTimeOffset.UtcNow
                                                          FileName = fileName
                                                          AiSummary = aiResponse.Text },
                                                        httpContext.RequestAborted
                                                    )
                                                ()
                                            | None -> ()
                                            return
                                                Results.Ok(
                                                    { Workflow = workflow.Value
                                                      DocumentId = document.Id
                                                      AiText = aiResponse.Text
                                                      ExtractedText = truncate 12000 pdfText }
                                                )
                            with ex ->
                                return Results.Problem($"Failed to download PDF: {ex.Message}")
                })
        )
        |> ignore

        group.MapPut(
            "/{workflowId:guid}/status",
            Func<Guid, UpdateWorkflowStatusRequest, NpgsqlDataSource, HttpContext, Task<IResult>>(fun workflowId request dataSource httpContext ->
                task {
                    if not (workflowStatuses.Contains request.Status) then
                        return Results.BadRequest("Unsupported workflow status.")
                    else
                        use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                        use command =
                            new NpgsqlCommand(
                                """
                                update kwestkarzbusinessdata.workflow_instances
                                set status = @status,
                                    current_step_key = coalesce(@current_step_key, current_step_key),
                                    completed_at = case when @status = 'Complete' then @updated_at else completed_at end,
                                    canceled_at = case when @status = 'Canceled' then @updated_at else canceled_at end,
                                    updated_at = @updated_at
                                where id = @workflow_id
                                """,
                                connection
                            )

                        let now = DateTimeOffset.UtcNow
                        command.Parameters.AddWithValue("workflow_id", NpgsqlDbType.Uuid, workflowId) |> ignore
                        command.Parameters.AddWithValue("status", NpgsqlDbType.Text, request.Status) |> ignore
                        command.Parameters.AddWithValue("current_step_key", NpgsqlDbType.Text, optionOrDbNull request.CurrentStepKey) |> ignore
                        command.Parameters.AddWithValue("updated_at", NpgsqlDbType.TimestampTz, now) |> ignore
                        let! rows = command.ExecuteNonQueryAsync(httpContext.RequestAborted)

                        if rows = 0 then
                            return Results.NotFound()
                        else
                            let operator = httpContext.Request.Headers.TryGetValue("X-Operator") |> (fun (ok, v) -> if ok then Some(v.ToString()) else None)
                            do! insertEventAsync connection workflowId None "StatusChanged" (Some request.Status) "{}" operator httpContext.RequestAborted
                            let! workflow = fetchWorkflowAsync dataSource workflowId httpContext.RequestAborted
                            return Results.Ok(workflow.Value)
                })
        )
        |> ignore

        group.MapGet(
            "/{workflowId:guid}/events",
            Func<Guid, NpgsqlDataSource, HttpContext, Task<IResult>>(fun workflowId dataSource httpContext ->
                task {
                    use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                    use command =
                        new NpgsqlCommand(
                            """
                            select id, step_key, event_type, message, data, created_by, created_at
                            from kwestkarzbusinessdata.workflow_events
                            where workflow_id = @workflow_id
                            order by created_at asc
                            """,
                            connection
                        )

                    command.Parameters.AddWithValue("workflow_id", NpgsqlDbType.Uuid, workflowId) |> ignore
                    use! reader = command.ExecuteReaderAsync(httpContext.RequestAborted)
                    let results = System.Collections.Generic.List<{| Id: Guid; StepKey: string option; EventType: string; Message: string option; CreatedBy: string option; CreatedAt: DateTimeOffset |}>()

                    while! reader.ReadAsync(httpContext.RequestAborted) do
                        results.Add(
                            {| Id = reader.GetGuid(0)
                               StepKey = if reader.IsDBNull(1) then None else Some(reader.GetString(1))
                               EventType = reader.GetString(2)
                               Message = if reader.IsDBNull(3) then None else Some(reader.GetString(3))
                               CreatedBy = if reader.IsDBNull(5) then None else Some(reader.GetString(5))
                               CreatedAt = reader.GetFieldValue<DateTimeOffset>(6) |})

                    return Results.Ok(results.ToArray())
                })
        )
        |> ignore

        app
