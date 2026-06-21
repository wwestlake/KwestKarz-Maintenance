namespace KwestKarz.Api

open System
open System.IO
open System.Text.Json
open System.Threading
open System.Threading.Tasks
open KwestKarz.Domain
open KwestKarz.Infrastructure
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Npgsql
open NpgsqlTypes

module RentalInspectionEndpoints =
    let private inspectionKinds = set [ "Pre"; "Post"; "Both" ]
    let private inspectionStatuses = set [ "Draft"; "NeedsReview"; "Complete" ]
    let private photoSlots =
        set [ "front"; "rear"; "driverSide"; "passengerSide"; "frontInterior"; "rearInterior"; "trunkCargo"; "odometerDashboard"; "damage" ]

    let private optionOrDbNull value =
        match value with
        | Some value -> box value
        | None -> box DBNull.Value

    let private textOrNone (value: string) =
        if String.IsNullOrWhiteSpace(value) then None else Some value

    let private readOptionalGuid (reader: NpgsqlDataReader) name =
        let ordinal = reader.GetOrdinal(name)
        if reader.IsDBNull(ordinal) then None else Some(reader.GetGuid(ordinal))

    let private readOptionalInt (reader: NpgsqlDataReader) name =
        let ordinal = reader.GetOrdinal(name)
        if reader.IsDBNull(ordinal) then None else Some(reader.GetInt32(ordinal))

    let private readOptionalBool (reader: NpgsqlDataReader) name =
        let ordinal = reader.GetOrdinal(name)
        if reader.IsDBNull(ordinal) then None else Some(reader.GetBoolean(ordinal))

    let private readOptionalString (reader: NpgsqlDataReader) name =
        let ordinal = reader.GetOrdinal(name)
        if reader.IsDBNull(ordinal) then None else Some(reader.GetString(ordinal))

    let private mapPhoto (reader: NpgsqlDataReader) =
        { Id = reader.GetGuid(reader.GetOrdinal("photo_id"))
          InspectionId = reader.GetGuid(reader.GetOrdinal("photo_inspection_id"))
          SlotKey = reader.GetString(reader.GetOrdinal("slot_key"))
          DocumentId = reader.GetGuid(reader.GetOrdinal("document_id"))
          Notes = readOptionalString reader "photo_notes"
          CreatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("photo_created_at")) }

    let private fetchInspectionAsync (dataSource: NpgsqlDataSource) workflowId cancellationToken =
        task {
            use! connection = dataSource.OpenConnectionAsync(cancellationToken)
            use command =
                new NpgsqlCommand(
                    """
                    select
                        ri.id, ri.workflow_id, ri.vehicle_id, ri.inspection_kind, ri.odometer,
                        ri.fuel_level, ri.damage_found, ri.status, ri.notes, ri.created_at, ri.updated_at,
                        rip.id as photo_id, rip.inspection_id as photo_inspection_id, rip.slot_key,
                        rip.document_id, rip.notes as photo_notes, rip.created_at as photo_created_at
                    from kwestkarzbusinessdata.rental_inspections ri
                    left join kwestkarzbusinessdata.rental_inspection_photos rip on rip.inspection_id = ri.id
                    where ri.workflow_id = @workflow_id
                    order by rip.created_at desc
                    """,
                    connection
                )

            command.Parameters.AddWithValue("workflow_id", NpgsqlDbType.Uuid, workflowId) |> ignore
            use! reader = command.ExecuteReaderAsync(cancellationToken)
            let photos = ResizeArray<RentalInspectionPhotoResponse>()
            let mutable inspection: RentalInspectionResponse option = None
            let mutable keepReading = true

            while keepReading do
                let! hasRow = reader.ReadAsync(cancellationToken)
                if hasRow then
                    if inspection.IsNone then
                        inspection <-
                            Some
                                { Id = reader.GetGuid(reader.GetOrdinal("id"))
                                  WorkflowId = readOptionalGuid reader "workflow_id"
                                  VehicleId = reader.GetGuid(reader.GetOrdinal("vehicle_id"))
                                  InspectionKind = reader.GetString(reader.GetOrdinal("inspection_kind"))
                                  Odometer = readOptionalInt reader "odometer"
                                  FuelLevel = readOptionalString reader "fuel_level"
                                  DamageFound = readOptionalBool reader "damage_found"
                                  Status = reader.GetString(reader.GetOrdinal("status"))
                                  Notes = readOptionalString reader "notes"
                                  CreatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("created_at"))
                                  UpdatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("updated_at"))
                                  Photos = Array.empty }

                    if not (reader.IsDBNull(reader.GetOrdinal("photo_id"))) then
                        photos.Add(mapPhoto reader)
                else
                    keepReading <- false

            return inspection |> Option.map (fun value -> { value with Photos = photos.ToArray() })
        }

    let private getWorkflowContextAsync (connection: NpgsqlConnection) (workflowId: Guid) (cancellationToken: CancellationToken) =
        task {
            use command =
                new NpgsqlCommand(
                    """
                    select
                        wi.workflow_type,
                        wi.vehicle_id,
                        coalesce(
                            (
                                select ws.data->>'inspectionKind'
                                from kwestkarzbusinessdata.workflow_steps ws
                                where ws.workflow_id = wi.id and ws.step_key = 'inspectionKind'
                                limit 1
                            ),
                            'Pre'
                        ) as inspection_kind
                    from kwestkarzbusinessdata.workflow_instances wi
                    where wi.id = @workflow_id
                    """,
                    connection
                )

            command.Parameters.AddWithValue("workflow_id", NpgsqlDbType.Uuid, workflowId) |> ignore
            use! reader = command.ExecuteReaderAsync(cancellationToken)
            let! hasRow = reader.ReadAsync(cancellationToken)

            if not hasRow then
                return None
            else
                let vehicleId =
                    let ordinal = reader.GetOrdinal("vehicle_id")
                    if reader.IsDBNull(ordinal) then None else Some(reader.GetGuid(ordinal))

                return
                    Some(
                        reader.GetString(reader.GetOrdinal("workflow_type")),
                        vehicleId,
                        reader.GetString(reader.GetOrdinal("inspection_kind"))
                    )
        }

    let private ensureInspectionAsync (dataSource: NpgsqlDataSource) (workflowId: Guid) (request: SaveRentalInspectionRequest) (cancellationToken: CancellationToken) =
        task {
            use! connection = dataSource.OpenConnectionAsync(cancellationToken)
            let! context = getWorkflowContextAsync connection workflowId cancellationToken

            match context with
            | None -> return Some "Workflow not found."
            | Some(workflowType, _, _) when workflowType <> "RentalInspection" ->
                return Some $"Workflow {workflowId} is not a rental inspection workflow."
            | Some(_, workflowVehicleId, defaultKind) ->
                let vehicleId = request.VehicleId |> Option.orElse workflowVehicleId
                match vehicleId with
                | None -> return Some "Choose a vehicle before saving this inspection."
                | Some vehicleId ->
                    let inspectionKind = request.InspectionKind |> Option.defaultValue defaultKind
                    let status = request.Status |> Option.defaultValue "Draft"

                    if not (inspectionKinds.Contains inspectionKind) then
                        return Some "inspectionKind must be Pre, Post, or Both."
                    elif not (inspectionStatuses.Contains status) then
                        return Some "status must be Draft, NeedsReview, or Complete."
                    else
                        let now = DateTimeOffset.UtcNow
                        use command =
                            new NpgsqlCommand(
                                """
                                insert into kwestkarzbusinessdata.rental_inspections (
                                    id, workflow_id, vehicle_id, inspection_kind, odometer, fuel_level,
                                    damage_found, status, notes, created_at, updated_at
                                )
                                values (
                                    @id, @workflow_id, @vehicle_id, @inspection_kind, @odometer, @fuel_level,
                                    @damage_found, @status, @notes, @created_at, @updated_at
                                )
                                on conflict (workflow_id) where workflow_id is not null do update
                                set vehicle_id = excluded.vehicle_id,
                                    inspection_kind = excluded.inspection_kind,
                                    odometer = excluded.odometer,
                                    fuel_level = excluded.fuel_level,
                                    damage_found = excluded.damage_found,
                                    status = excluded.status,
                                    notes = excluded.notes,
                                    updated_at = excluded.updated_at
                                returning id
                                """,
                                connection
                            )

                        command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, Guid.NewGuid()) |> ignore
                        command.Parameters.AddWithValue("workflow_id", NpgsqlDbType.Uuid, workflowId) |> ignore
                        command.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, vehicleId) |> ignore
                        command.Parameters.AddWithValue("inspection_kind", NpgsqlDbType.Text, inspectionKind) |> ignore
                        command.Parameters.AddWithValue("odometer", NpgsqlDbType.Integer, optionOrDbNull request.Odometer) |> ignore
                        command.Parameters.AddWithValue("fuel_level", NpgsqlDbType.Text, optionOrDbNull (request.FuelLevel |> Option.bind textOrNone)) |> ignore
                        command.Parameters.AddWithValue("damage_found", NpgsqlDbType.Boolean, optionOrDbNull request.DamageFound) |> ignore
                        command.Parameters.AddWithValue("status", NpgsqlDbType.Text, status) |> ignore
                        command.Parameters.AddWithValue("notes", NpgsqlDbType.Text, optionOrDbNull (request.Notes |> Option.bind textOrNone)) |> ignore
                        command.Parameters.AddWithValue("created_at", NpgsqlDbType.TimestampTz, now) |> ignore
                        command.Parameters.AddWithValue("updated_at", NpgsqlDbType.TimestampTz, now) |> ignore
                        let! _ = command.ExecuteScalarAsync(cancellationToken)
                        return None
        }

    let private createDefaultRequest (vehicleId: Guid option) inspectionKind : SaveRentalInspectionRequest =
        { VehicleId = vehicleId
          InspectionKind = Some inspectionKind
          Odometer = None
          FuelLevel = None
          DamageFound = None
          Status = Some "Draft"
          Notes = None }

    let private updateWorkflowStepAsync (connection: NpgsqlConnection) workflowId stepKey status data cancellationToken =
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

            command.Parameters.AddWithValue("workflow_id", NpgsqlDbType.Uuid, workflowId) |> ignore
            command.Parameters.AddWithValue("step_key", NpgsqlDbType.Text, stepKey) |> ignore
            command.Parameters.AddWithValue("status", NpgsqlDbType.Text, status) |> ignore
            command.Parameters.AddWithValue("data", NpgsqlDbType.Text, data) |> ignore
            command.Parameters.AddWithValue("updated_at", NpgsqlDbType.TimestampTz, DateTimeOffset.UtcNow) |> ignore
            let! _ = command.ExecuteNonQueryAsync(cancellationToken)
            return ()
        }

    let mapRentalInspectionEndpoints (app: WebApplication) =
        let group = app.MapGroup("/api/workflows/{workflowId:guid}/rental-inspection")

        group.MapGet(
            "/",
            Func<Guid, NpgsqlDataSource, HttpContext, Task<IResult>>(fun workflowId dataSource httpContext ->
                task {
                    let! current = fetchInspectionAsync dataSource workflowId httpContext.RequestAborted
                    match current with
                    | Some inspection -> return Results.Ok(inspection)
                    | None ->
                        use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                        let! context = getWorkflowContextAsync connection workflowId httpContext.RequestAborted
                        match context with
                        | None -> return Results.NotFound("Workflow not found.")
                        | Some(workflowType, _, _) when workflowType <> "RentalInspection" ->
                            return Results.BadRequest("This workflow is not a rental inspection workflow.")
                        | Some(_, vehicleId, inspectionKind) ->
                            let defaultRequest = createDefaultRequest vehicleId inspectionKind
                            let! result = ensureInspectionAsync dataSource workflowId defaultRequest httpContext.RequestAborted
                            match result with
                            | Some message -> return Results.BadRequest(message)
                            | None ->
                                let! saved = fetchInspectionAsync dataSource workflowId httpContext.RequestAborted
                                return Results.Ok(saved.Value)
                })
        )
        |> ignore

        group.MapPut(
            "/",
            Func<Guid, SaveRentalInspectionRequest, NpgsqlDataSource, HttpContext, Task<IResult>>(fun workflowId request dataSource httpContext ->
                task {
                    let! result = ensureInspectionAsync dataSource workflowId request httpContext.RequestAborted
                    match result with
                    | Some message -> return Results.BadRequest(message)
                    | None ->
                        let! saved = fetchInspectionAsync dataSource workflowId httpContext.RequestAborted
                        return Results.Ok(saved.Value)
                })
        )
        |> ignore

        group.MapPost(
            "/photos/{slotKey}",
            Func<Guid, string, IDocumentRepository, NpgsqlDataSource, HttpContext, Task<IResult>>(fun workflowId slotKey documents dataSource httpContext ->
                task {
                    if not (photoSlots.Contains slotKey) then
                        return Results.BadRequest("Unsupported rental inspection photo slot.")
                    else
                        let! current = fetchInspectionAsync dataSource workflowId httpContext.RequestAborted
                        match current with
                        | None -> return Results.BadRequest("Save the inspection details before attaching photos.")
                        | Some inspection ->
                            let! form = httpContext.Request.ReadFormAsync(httpContext.RequestAborted)
                            let file = form.Files.GetFile("file")
                            if isNull file || file.Length = 0L then
                                return Results.BadRequest("A multipart form file named 'file' is required.")
                            else
                                let notes = form["notes"].ToString() |> textOrNone
                                use memory = new MemoryStream()
                                use stream = file.OpenReadStream()
                                do! stream.CopyToAsync(memory, httpContext.RequestAborted)
                                let contentBytes = memory.ToArray()

                                let newDocument =
                                    { OwnerType = DocumentOwnerType.Vehicle
                                      OwnerId = inspection.VehicleId
                                      Kind = DocumentKind.Inspection
                                      OriginalFileName = file.FileName
                                      ContentType = if String.IsNullOrWhiteSpace(file.ContentType) then "application/octet-stream" else file.ContentType
                                      StoragePath = ""
                                      SizeBytes = int64 contentBytes.Length
                                      Description = Some $"Rental inspection photo: {slotKey}"
                                      ContentBytes = Some contentBytes }

                                let! document = documents.CreateAsync(newDocument, httpContext.RequestAborted)
                                let photoId = Guid.NewGuid()
                                let now = DateTimeOffset.UtcNow

                                use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                                use command =
                                    new NpgsqlCommand(
                                        """
                                        insert into kwestkarzbusinessdata.rental_inspection_photos (
                                            id, inspection_id, slot_key, document_id, notes, created_at
                                        )
                                        values (@id, @inspection_id, @slot_key, @document_id, @notes, @created_at)
                                        on conflict (inspection_id, slot_key) do update
                                        set document_id = excluded.document_id,
                                            notes = excluded.notes,
                                            created_at = excluded.created_at
                                        """,
                                        connection
                                    )

                                command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, photoId) |> ignore
                                command.Parameters.AddWithValue("inspection_id", NpgsqlDbType.Uuid, inspection.Id) |> ignore
                                command.Parameters.AddWithValue("slot_key", NpgsqlDbType.Text, slotKey) |> ignore
                                command.Parameters.AddWithValue("document_id", NpgsqlDbType.Uuid, document.Id) |> ignore
                                command.Parameters.AddWithValue("notes", NpgsqlDbType.Text, optionOrDbNull notes) |> ignore
                                command.Parameters.AddWithValue("created_at", NpgsqlDbType.TimestampTz, now) |> ignore
                                let! _ = command.ExecuteNonQueryAsync(httpContext.RequestAborted)

                                let! saved = fetchInspectionAsync dataSource workflowId httpContext.RequestAborted
                                let photoCount = saved.Value.Photos.Length
                                let status = if photoCount >= 4 then "Complete" else "InProgress"
                                let data = JsonSerializer.Serialize {| inspectionId = inspection.Id; photoCount = photoCount |}
                                do! updateWorkflowStepAsync connection workflowId "photos" status data httpContext.RequestAborted
                                return Results.Ok(saved.Value)
                })
        )
        |> ignore

        group.MapGet(
            "/report",
            Func<Guid, IVehicleRepository, NpgsqlDataSource, HttpContext, Task<IResult>>(fun workflowId vehicles dataSource httpContext ->
                task {
                    let! inspection = fetchInspectionAsync dataSource workflowId httpContext.RequestAborted
                    match inspection with
                    | None -> return Results.NotFound("No inspection found for this workflow.")
                    | Some insp ->
                        let! allVehicles = vehicles.ListAsync(httpContext.RequestAborted)
                        let vehicle = allVehicles |> List.tryFind (fun v -> v.Id = insp.VehicleId)
                        match vehicle with
                        | None -> return Results.NotFound("Vehicle not found.")
                        | Some v ->
                            let slotLabels =
                                dict [ "front", "Front"
                                       "rear", "Rear"
                                       "driverSide", "Driver Side"
                                       "passengerSide", "Passenger Side"
                                       "frontInterior", "Front Interior"
                                       "rearInterior", "Rear Interior"
                                       "trunkCargo", "Trunk / Cargo"
                                       "odometerDashboard", "Odometer / Dashboard"
                                       "damage", "Damage Close-up" ]

                            let photos =
                                insp.Photos
                                |> Array.map (fun p ->
                                    { SlotKey = p.SlotKey
                                      SlotLabel = if slotLabels.ContainsKey(p.SlotKey) then slotLabels[p.SlotKey] else p.SlotKey
                                      DocumentId = p.DocumentId
                                      Notes = p.Notes })

                            let report =
                                { InspectionId = insp.Id
                                  InspectionKind = insp.InspectionKind
                                  Status = insp.Status
                                  InspectedAt = insp.UpdatedAt
                                  Odometer = insp.Odometer
                                  FuelLevel = insp.FuelLevel
                                  DamageFound = insp.DamageFound
                                  Notes = insp.Notes
                                  VehicleId = v.Id
                                  VehicleYear = v.Year
                                  VehicleMake = v.Make
                                  VehicleModel = v.Model
                                  VehicleVin = v.Vin
                                  VehicleColor = v.Color
                                  VehiclePlate = v.LicensePlate
                                  VehiclePlateState = v.LicensePlateState
                                  Photos = photos }

                            return Results.Ok(report)
                })
        )
        |> ignore

        app
