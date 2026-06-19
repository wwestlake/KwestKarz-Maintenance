namespace KwestKarz.Api

open System
open System.Text.Json
open System.Threading.Tasks
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Npgsql
open NpgsqlTypes

module WorkflowEndpoints =
    let private workflowTypes =
        set [ "AddVehicle"; "PreRentalInspection"; "PostRentalInspection"; "MaintenanceIntake"; "DamageReview"; "ComplianceRenewal"; "TechnicalCheck" ]

    let private workflowStatuses = set [ "Draft"; "InProgress"; "Waiting"; "Complete"; "Canceled" ]
    let private stepStatuses = set [ "NotStarted"; "InProgress"; "NeedsReview"; "Complete"; "Skipped"; "Problem" ]

    let private optionOrDbNull value =
        match value with
        | Some value -> box value
        | None -> box DBNull.Value

    let private defaultTitle workflowType =
        match workflowType with
        | "AddVehicle" -> "Add Vehicle to Inventory"
        | "PreRentalInspection" -> "Pre-Rental Inspection"
        | "PostRentalInspection" -> "Post-Rental Inspection"
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
        | "PreRentalInspection" ->
            [| ("vehicle", "Vehicle")
               ("odometerFuel", "Odometer / Fuel")
               ("photos", "Photos")
               ("tires", "Tires")
               ("damage", "Damage")
               ("review", "Review") |]
        | "PostRentalInspection" ->
            [| ("vehicle", "Vehicle")
               ("returnState", "Return State")
               ("photos", "Photos")
               ("issues", "Issues")
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

    let private insertEventAsync (connection: NpgsqlConnection) workflowId stepKey eventType message data cancellationToken =
        task {
            use command =
                new NpgsqlCommand(
                    """
                    insert into kwestkarzbusinessdata.workflow_events (
                        id, workflow_id, step_key, event_type, message, data, created_at
                    )
                    values (@id, @workflow_id, @step_key, @event_type, @message, @data::jsonb, @created_at)
                    """,
                    connection
                )

            command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, Guid.NewGuid()) |> ignore
            command.Parameters.AddWithValue("workflow_id", NpgsqlDbType.Uuid, workflowId) |> ignore
            command.Parameters.AddWithValue("step_key", NpgsqlDbType.Text, optionOrDbNull stepKey) |> ignore
            command.Parameters.AddWithValue("event_type", NpgsqlDbType.Text, eventType) |> ignore
            command.Parameters.AddWithValue("message", NpgsqlDbType.Text, optionOrDbNull message) |> ignore
            command.Parameters.AddWithValue("data", NpgsqlDbType.Text, data) |> ignore
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
                    else
                        let workflowId = Guid.NewGuid()
                        let now = DateTimeOffset.UtcNow
                        let steps = defaultSteps request.WorkflowType
                        let currentStepKey = steps |> Array.head |> fst
                        let title = request.Title |> Option.filter (String.IsNullOrWhiteSpace >> not) |> Option.defaultValue (defaultTitle request.WorkflowType)

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
                                    values (@id, @workflow_id, @step_key, @title, @status, @sort_order, '{}'::jsonb, @created_at, @updated_at)
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
                            insertStep.Parameters.AddWithValue("created_at", NpgsqlDbType.TimestampTz, now) |> ignore
                            insertStep.Parameters.AddWithValue("updated_at", NpgsqlDbType.TimestampTz, now) |> ignore
                            let! _ = insertStep.ExecuteNonQueryAsync(httpContext.RequestAborted)
                            ()

                        do! insertEventAsync connection workflowId None "Created" (Some title) "{}" httpContext.RequestAborted
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
                            do! insertEventAsync connection workflowId (Some stepKey) "StepSaved" (Some request.Status) (jsonOrEmpty request.Data) httpContext.RequestAborted
                            let! workflow = fetchWorkflowAsync dataSource workflowId httpContext.RequestAborted
                            return Results.Ok(workflow.Value)
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
                            do! insertEventAsync connection workflowId None "StatusChanged" (Some request.Status) "{}" httpContext.RequestAborted
                            let! workflow = fetchWorkflowAsync dataSource workflowId httpContext.RequestAborted
                            return Results.Ok(workflow.Value)
                })
        )
        |> ignore

        app
