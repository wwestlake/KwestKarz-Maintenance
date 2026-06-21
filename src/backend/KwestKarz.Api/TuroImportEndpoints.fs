namespace KwestKarz.Api

open System
open System.Collections.Generic
open System.Globalization
open System.IO
open System.Text.Json
open System.Text.RegularExpressions
open System.Threading.Tasks
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Microsoft.VisualBasic.FileIO
open Npgsql
open NpgsqlTypes

module TuroImportEndpoints =
    type private ParsedTrip =
        { ReservationId: string
          Guest: string option
          VehicleLabel: string option
          VehicleName: string option
          TuroVehicleId: string option
          Vin: string option
          TripStart: DateTimeOffset option
          TripEnd: DateTimeOffset option
          PickupLocation: string option
          ReturnLocation: string option
          TripStatus: string option
          CheckInOdometer: int option
          CheckOutOdometer: int option
          DistanceTraveled: int option
          TripDays: int option
          TripPrice: decimal option
          TotalEarnings: decimal option
          RawData: IReadOnlyDictionary<string, string>
          VehicleId: Guid option }

    let private optionOrDbNull value =
        match value with
        | Some value -> box value
        | None -> box DBNull.Value

    let private textOrNone (value: string) =
        if String.IsNullOrWhiteSpace(value) then None else Some(value.Trim())

    let private value (row: IReadOnlyDictionary<string, string>) (key: string) =
        match row.TryGetValue(key) with
        | true, value -> value
        | _ -> ""

    let private parseInt (value: string) =
        let cleaned = Regex.Replace(value, "[^0-9-]", "")
        let mutable parsed = 0
        if Int32.TryParse(cleaned, NumberStyles.Integer, CultureInfo.InvariantCulture, &parsed) then Some parsed else None

    let private parseMoney (value: string) =
        let trimmed = value.Trim()
        if String.IsNullOrWhiteSpace(trimmed) then
            None
        else
            let isNegative = trimmed.Contains("-")
            let cleaned = Regex.Replace(trimmed, "[^0-9.]", "")
            let mutable parsed = 0M
            if Decimal.TryParse(cleaned, NumberStyles.Number, CultureInfo.InvariantCulture, &parsed) then
                Some(if isNegative then -parsed else parsed)
            else
                None

    let private parseDateTime (value: string) =
        match textOrNone value with
        | None -> None
        | Some text ->
            let formats = [| "yyyy-MM-dd hh:mm tt"; "yyyy-MM-dd h:mm tt"; "M/d/yyyy h:mm tt"; "M/d/yyyy hh:mm tt" |]
            let mutable parsed = DateTime.MinValue
            if DateTime.TryParseExact(text, formats, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, &parsed) then
                let offset = TimeZoneInfo.Local.GetUtcOffset(parsed)
                Some(DateTimeOffset(parsed, offset).ToUniversalTime())
            else
                let mutable parsedOffset = DateTimeOffset.MinValue
                if DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, &parsedOffset) then
                    Some(parsedOffset.ToUniversalTime())
                else
                    None

    let private normalizeVin (value: string) =
        let cleaned = Regex.Replace(value.ToUpperInvariant(), "[^A-HJ-NPR-Z0-9]", "")
        if cleaned.Length = 17 then Some cleaned else None

    let private readCsvRows (contentBytes: byte array) =
        use stream = new MemoryStream(contentBytes)
        use parser = new TextFieldParser(stream)
        parser.SetDelimiters([| "," |])
        parser.HasFieldsEnclosedInQuotes <- true
        parser.TrimWhiteSpace <- false

        let headers = parser.ReadFields()
        if isNull headers then
            [||]
        else
            let rows = ResizeArray<IReadOnlyDictionary<string, string>>()
            while not parser.EndOfData do
                let fields = parser.ReadFields()
                if not (isNull fields) then
                    let row = Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                    for index in 0 .. headers.Length - 1 do
                        let item = if index < fields.Length then fields[index] else ""
                        row[headers[index]] <- item
                    rows.Add(row)
            rows.ToArray()

    let private parseVehicleName (vehicleName: string option) =
        match vehicleName with
        | None -> None, None, None
        | Some name ->
            let parts = name.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            let year =
                parts
                |> Array.tryLast
                |> Option.bind (fun value ->
                    let mutable parsed = 0
                    if Int32.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, &parsed) && parsed >= 1980 && parsed <= 2100 then
                        Some parsed
                    else
                        None)

            let make = parts |> Array.tryHead
            let model =
                if parts.Length >= 3 && year.IsSome then
                    Some(String.Join(" ", parts[1 .. parts.Length - 2]))
                elif parts.Length >= 2 then
                    Some(String.Join(" ", parts[1 ..]))
                else
                    None

            year, make, model

    let private findOrCreateVehicleIdAsync (connection: NpgsqlConnection) vin vehicleName vehicleLabel turoVehicleId cancellationToken =
        task {
            match vin with
            | None -> return None
            | Some vin ->
                use findCommand =
                    new NpgsqlCommand(
                        "select id from kwestkarzbusinessdata.vehicles where vin = @vin",
                        connection
                    )
                findCommand.Parameters.AddWithValue("vin", NpgsqlDbType.Text, vin) |> ignore
                let! result = findCommand.ExecuteScalarAsync(cancellationToken)

                if not (isNull result || result = box DBNull.Value) then
                    return Some(result :?> Guid)
                else
                    let year, make, model = parseVehicleName vehicleName
                    let id = Guid.NewGuid()
                    let now = DateTimeOffset.UtcNow
                    use insertCommand =
                        new NpgsqlCommand(
                            """
                            insert into kwestkarzbusinessdata.vehicles (
                                id, vin, year, make, model, trim, color, license_plate, license_plate_state,
                                acquisition_date, purchase_price, status, turo_listing_id, turo_listing_status,
                                current_odometer, current_odometer_recorded_at, fleet_position_number, notes,
                                created_at, updated_at
                            )
                            values (
                                @id, @vin, @year, @make, @model, null, null, null, null,
                                null, null, 'Staging', @turo_listing_id, null,
                                null, null, null, @notes,
                                @created_at, @updated_at
                            )
                            on conflict (vin) do update
                            set turo_listing_id = coalesce(kwestkarzbusinessdata.vehicles.turo_listing_id, excluded.turo_listing_id),
                                notes = coalesce(kwestkarzbusinessdata.vehicles.notes, excluded.notes),
                                updated_at = excluded.updated_at
                            returning id
                            """,
                            connection
                        )

                    insertCommand.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, id) |> ignore
                    insertCommand.Parameters.AddWithValue("vin", NpgsqlDbType.Text, vin) |> ignore
                    insertCommand.Parameters.AddWithValue("year", NpgsqlDbType.Integer, optionOrDbNull year) |> ignore
                    insertCommand.Parameters.AddWithValue("make", NpgsqlDbType.Text, optionOrDbNull make) |> ignore
                    insertCommand.Parameters.AddWithValue("model", NpgsqlDbType.Text, optionOrDbNull model) |> ignore
                    insertCommand.Parameters.AddWithValue("turo_listing_id", NpgsqlDbType.Text, optionOrDbNull turoVehicleId) |> ignore
                    let notes =
                        match vehicleName, vehicleLabel with
                        | Some name, Some label -> Some $"Placeholder created from Turo trip import. Turo vehicle name: {name}. Turo listing label: {label}."
                        | Some name, None -> Some $"Placeholder created from Turo trip import. Turo vehicle name: {name}."
                        | None, Some label -> Some $"Placeholder created from Turo trip import. Turo listing label: {label}."
                        | None, None -> Some "Placeholder created from Turo trip import."
                    insertCommand.Parameters.AddWithValue("notes", NpgsqlDbType.Text, optionOrDbNull notes) |> ignore
                    insertCommand.Parameters.AddWithValue("created_at", NpgsqlDbType.TimestampTz, now) |> ignore
                    insertCommand.Parameters.AddWithValue("updated_at", NpgsqlDbType.TimestampTz, now) |> ignore
                    let! createdResult = insertCommand.ExecuteScalarAsync(cancellationToken)
                    return Some(createdResult :?> Guid)
        }

    let private parseTripAsync (connection: NpgsqlConnection) (row: IReadOnlyDictionary<string, string>) cancellationToken =
        task {
            let reservationId = value row "Reservation ID" |> textOrNone
            match reservationId with
            | None -> return None
            | Some reservationId ->
                let vin = value row "VIN" |> normalizeVin
                let vehicleLabel = value row "Vehicle" |> textOrNone
                let vehicleName = value row "Vehicle name" |> textOrNone
                let turoVehicleId = value row "Vehicle id" |> textOrNone
                let! vehicleId = findOrCreateVehicleIdAsync connection vin vehicleName vehicleLabel turoVehicleId cancellationToken
                return
                    Some
                        { ReservationId = reservationId
                          Guest = value row "Guest" |> textOrNone
                          VehicleLabel = vehicleLabel
                          VehicleName = vehicleName
                          TuroVehicleId = turoVehicleId
                          Vin = vin
                          TripStart = value row "Trip start" |> parseDateTime
                          TripEnd = value row "Trip end" |> parseDateTime
                          PickupLocation = value row "Pickup location" |> textOrNone
                          ReturnLocation = value row "Return location" |> textOrNone
                          TripStatus = value row "Trip status" |> textOrNone
                          CheckInOdometer = value row "Check-in odometer" |> parseInt
                          CheckOutOdometer = value row "Check-out odometer" |> parseInt
                          DistanceTraveled = value row "Distance traveled" |> parseInt
                          TripDays = value row "Trip days" |> parseInt
                          TripPrice = value row "Trip price" |> parseMoney
                          TotalEarnings = value row "Total earnings" |> parseMoney
                          RawData = row
                          VehicleId = vehicleId }
        }

    let private upsertTripAsync (connection: NpgsqlConnection) importId (trip: ParsedTrip) cancellationToken =
        task {
            let now = DateTimeOffset.UtcNow
            use command =
                new NpgsqlCommand(
                    """
                    insert into kwestkarzbusinessdata.turo_trip_earnings (
                        id, reservation_id, vehicle_id, import_id, guest, vehicle_label, vehicle_name,
                        turo_vehicle_id, vin, trip_start, trip_end, pickup_location, return_location,
                        trip_status, check_in_odometer, check_out_odometer, distance_traveled, trip_days,
                        trip_price, total_earnings, raw_data, created_at, updated_at
                    )
                    values (
                        @id, @reservation_id, @vehicle_id, @import_id, @guest, @vehicle_label, @vehicle_name,
                        @turo_vehicle_id, @vin, @trip_start, @trip_end, @pickup_location, @return_location,
                        @trip_status, @check_in_odometer, @check_out_odometer, @distance_traveled, @trip_days,
                        @trip_price, @total_earnings, @raw_data::jsonb, @created_at, @updated_at
                    )
                    on conflict (reservation_id) do update
                    set vehicle_id = excluded.vehicle_id,
                        import_id = excluded.import_id,
                        guest = excluded.guest,
                        vehicle_label = excluded.vehicle_label,
                        vehicle_name = excluded.vehicle_name,
                        turo_vehicle_id = excluded.turo_vehicle_id,
                        vin = excluded.vin,
                        trip_start = excluded.trip_start,
                        trip_end = excluded.trip_end,
                        pickup_location = excluded.pickup_location,
                        return_location = excluded.return_location,
                        trip_status = excluded.trip_status,
                        check_in_odometer = excluded.check_in_odometer,
                        check_out_odometer = excluded.check_out_odometer,
                        distance_traveled = excluded.distance_traveled,
                        trip_days = excluded.trip_days,
                        trip_price = excluded.trip_price,
                        total_earnings = excluded.total_earnings,
                        raw_data = excluded.raw_data,
                        updated_at = excluded.updated_at
                    returning (xmax = 0) as inserted
                    """,
                    connection
                )

            command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, Guid.NewGuid()) |> ignore
            command.Parameters.AddWithValue("reservation_id", NpgsqlDbType.Text, trip.ReservationId) |> ignore
            command.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, optionOrDbNull trip.VehicleId) |> ignore
            command.Parameters.AddWithValue("import_id", NpgsqlDbType.Uuid, importId) |> ignore
            command.Parameters.AddWithValue("guest", NpgsqlDbType.Text, optionOrDbNull trip.Guest) |> ignore
            command.Parameters.AddWithValue("vehicle_label", NpgsqlDbType.Text, optionOrDbNull trip.VehicleLabel) |> ignore
            command.Parameters.AddWithValue("vehicle_name", NpgsqlDbType.Text, optionOrDbNull trip.VehicleName) |> ignore
            command.Parameters.AddWithValue("turo_vehicle_id", NpgsqlDbType.Text, optionOrDbNull trip.TuroVehicleId) |> ignore
            command.Parameters.AddWithValue("vin", NpgsqlDbType.Text, optionOrDbNull trip.Vin) |> ignore
            command.Parameters.AddWithValue("trip_start", NpgsqlDbType.TimestampTz, optionOrDbNull trip.TripStart) |> ignore
            command.Parameters.AddWithValue("trip_end", NpgsqlDbType.TimestampTz, optionOrDbNull trip.TripEnd) |> ignore
            command.Parameters.AddWithValue("pickup_location", NpgsqlDbType.Text, optionOrDbNull trip.PickupLocation) |> ignore
            command.Parameters.AddWithValue("return_location", NpgsqlDbType.Text, optionOrDbNull trip.ReturnLocation) |> ignore
            command.Parameters.AddWithValue("trip_status", NpgsqlDbType.Text, optionOrDbNull trip.TripStatus) |> ignore
            command.Parameters.AddWithValue("check_in_odometer", NpgsqlDbType.Integer, optionOrDbNull trip.CheckInOdometer) |> ignore
            command.Parameters.AddWithValue("check_out_odometer", NpgsqlDbType.Integer, optionOrDbNull trip.CheckOutOdometer) |> ignore
            command.Parameters.AddWithValue("distance_traveled", NpgsqlDbType.Integer, optionOrDbNull trip.DistanceTraveled) |> ignore
            command.Parameters.AddWithValue("trip_days", NpgsqlDbType.Integer, optionOrDbNull trip.TripDays) |> ignore
            command.Parameters.AddWithValue("trip_price", NpgsqlDbType.Numeric, optionOrDbNull trip.TripPrice) |> ignore
            command.Parameters.AddWithValue("total_earnings", NpgsqlDbType.Numeric, optionOrDbNull trip.TotalEarnings) |> ignore
            command.Parameters.AddWithValue("raw_data", NpgsqlDbType.Text, JsonSerializer.Serialize(trip.RawData)) |> ignore
            command.Parameters.AddWithValue("created_at", NpgsqlDbType.TimestampTz, now) |> ignore
            command.Parameters.AddWithValue("updated_at", NpgsqlDbType.TimestampTz, now) |> ignore
            let! result = command.ExecuteScalarAsync(cancellationToken)
            return result :?> bool
        }

    let private updateVehicleFromTripAsync (connection: NpgsqlConnection) (trip: ParsedTrip) cancellationToken =
        task {
            match trip.VehicleId with
            | None -> return ()
            | Some vehicleId ->
                let latestOdometer = trip.CheckOutOdometer |> Option.orElse trip.CheckInOdometer
                use command =
                    new NpgsqlCommand(
                        """
                        update kwestkarzbusinessdata.vehicles
                        set turo_listing_id = coalesce(turo_listing_id, @turo_vehicle_id),
                            current_odometer = case
                                when @odometer is not null and (current_odometer is null or @odometer > current_odometer) then @odometer
                                else current_odometer
                            end,
                            current_odometer_recorded_at = case
                                when @odometer is not null and (current_odometer is null or @odometer > current_odometer) then coalesce(@trip_end, @updated_at)
                                else current_odometer_recorded_at
                            end,
                            updated_at = @updated_at
                        where id = @vehicle_id
                        """,
                        connection
                    )

                command.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, vehicleId) |> ignore
                command.Parameters.AddWithValue("turo_vehicle_id", NpgsqlDbType.Text, optionOrDbNull trip.TuroVehicleId) |> ignore
                command.Parameters.AddWithValue("odometer", NpgsqlDbType.Integer, optionOrDbNull latestOdometer) |> ignore
                command.Parameters.AddWithValue("trip_end", NpgsqlDbType.TimestampTz, optionOrDbNull trip.TripEnd) |> ignore
                command.Parameters.AddWithValue("updated_at", NpgsqlDbType.TimestampTz, DateTimeOffset.UtcNow) |> ignore
                let! _ = command.ExecuteNonQueryAsync(cancellationToken)
                return ()
        }

    let private summarizeImport (importId: Guid) fileName rowCount inserted updated skipped (trips: ParsedTrip array) =
        let summaries =
            trips
            |> Array.groupBy (fun trip -> trip.Vin, trip.VehicleId, trip.VehicleName, trip.TuroVehicleId)
            |> Array.map (fun ((vin, vehicleId, vehicleName, turoVehicleId), items) ->
                { Vin = vin
                  VehicleId = vehicleId
                  VehicleName = vehicleName
                  TuroVehicleId = turoVehicleId
                  ImportedTrips = items.Length
                  LatestOdometer =
                    items
                    |> Array.choose (fun trip -> trip.CheckOutOdometer |> Option.orElse trip.CheckInOdometer)
                    |> Array.sortDescending
                    |> Array.tryHead
                  ImportedMiles = items |> Array.choose _.DistanceTraveled |> Array.sum })

        { ImportId = importId
          OriginalFileName = fileName
          RowCount = rowCount
          InsertedCount = inserted
          UpdatedCount = updated
          SkippedCount = skipped
          VehicleMatches = trips |> Array.filter (fun trip -> trip.VehicleId.IsSome) |> Array.length
          VehicleSummaries = summaries }

    // Row type for the first query result before predictions are applied
    type private RawSignalRow =
        { VehicleId: Guid option
          Vin: string option
          VehicleLabel: string
          ImportedTrips: int
          CompletedTrips: int
          ImportedMiles: int
          LatestTripEnd: DateTimeOffset option
          LatestImportedOdometer: int option
          LatestMaintenanceOdometer: int option
          MilesSinceLatestMaintenance: int option }

    let private readRawSignalsAsync (dataSource: NpgsqlDataSource) cancellationToken =
        task {
            use! connection = dataSource.OpenConnectionAsync(cancellationToken)
            use command =
                new NpgsqlCommand(
                    """
                    with trip_rollup as (
                        select
                            vehicle_id,
                            vin,
                            coalesce(max(vehicle_name), max(vehicle_label), max(vin), 'Unmatched Turo vehicle') as vehicle_label,
                            count(*)::int as imported_trips,
                            count(*) filter (where trip_status = 'Completed')::int as completed_trips,
                            coalesce(sum(distance_traveled), 0)::int as imported_miles,
                            max(trip_end) as latest_trip_end,
                            nullif(max(greatest(coalesce(check_in_odometer, 0), coalesce(check_out_odometer, 0))), 0)::int as latest_imported_odometer
                        from kwestkarzbusinessdata.turo_trip_earnings
                        group by vehicle_id, vin
                    ),
                    maintenance_rollup as (
                        select vehicle_id, max(odometer) as latest_maintenance_odometer
                        from kwestkarzbusinessdata.maintenance_records
                        where odometer is not null
                        group by vehicle_id
                    )
                    select
                        tr.vehicle_id,
                        tr.vin,
                        coalesce(v.year::text || ' ' || v.make || ' ' || v.model, tr.vehicle_label) as vehicle_label,
                        tr.imported_trips,
                        tr.completed_trips,
                        tr.imported_miles,
                        tr.latest_trip_end,
                        tr.latest_imported_odometer,
                        mr.latest_maintenance_odometer
                    from trip_rollup tr
                    left join kwestkarzbusinessdata.vehicles v on v.id = tr.vehicle_id
                    left join maintenance_rollup mr on mr.vehicle_id = tr.vehicle_id
                    order by tr.latest_trip_end desc nulls last, tr.imported_miles desc
                    limit 100
                    """,
                    connection
                )

            use! reader = command.ExecuteReaderAsync(cancellationToken)
            let results = ResizeArray<RawSignalRow>()

            let readGuid name =
                let ordinal = reader.GetOrdinal(name)
                if reader.IsDBNull(ordinal) then None else Some(reader.GetGuid(ordinal))
            let readString name =
                let ordinal = reader.GetOrdinal(name)
                if reader.IsDBNull(ordinal) then None else Some(reader.GetString(ordinal))
            let readInt name =
                let ordinal = reader.GetOrdinal(name)
                if reader.IsDBNull(ordinal) then None else Some(reader.GetInt32(ordinal))
            let readDate name =
                let ordinal = reader.GetOrdinal(name)
                if reader.IsDBNull(ordinal) then None else Some(reader.GetFieldValue<DateTimeOffset>(ordinal))

            let mutable keepReading = true
            while keepReading do
                let! hasRow = reader.ReadAsync(cancellationToken)
                if hasRow then
                    let latestImported = readInt "latest_imported_odometer"
                    let latestMaintenance = readInt "latest_maintenance_odometer"
                    let milesSinceMaintenance =
                        match latestImported, latestMaintenance with
                        | Some imported, Some maintenance when imported >= maintenance -> Some(imported - maintenance)
                        | _ -> None
                    results.Add(
                        { VehicleId = readGuid "vehicle_id"
                          Vin = readString "vin"
                          VehicleLabel = reader.GetString(reader.GetOrdinal("vehicle_label"))
                          ImportedTrips = reader.GetInt32(reader.GetOrdinal("imported_trips"))
                          CompletedTrips = reader.GetInt32(reader.GetOrdinal("completed_trips"))
                          ImportedMiles = reader.GetInt32(reader.GetOrdinal("imported_miles"))
                          LatestTripEnd = readDate "latest_trip_end"
                          LatestImportedOdometer = latestImported
                          LatestMaintenanceOdometer = latestMaintenance
                          MilesSinceLatestMaintenance = milesSinceMaintenance })
                else
                    keepReading <- false

            return results.ToArray()
        }

    // Returns Map<vehicleId, Map<lowercase event_type, (lastDate, lastOdometer option)>>
    let private readServiceHistoryAsync (dataSource: NpgsqlDataSource) (vehicleIds: Guid array) cancellationToken =
        task {
            use! connection = dataSource.OpenConnectionAsync(cancellationToken)
            use command =
                new NpgsqlCommand(
                    """
                    select vehicle_id, lower(event_type), max(date_performed), max(odometer)
                    from kwestkarzbusinessdata.maintenance_records
                    where vehicle_id = any(@vehicle_ids)
                    group by vehicle_id, lower(event_type)
                    """,
                    connection
                )
            let idsParam = command.Parameters.Add("vehicle_ids", NpgsqlDbType.Array ||| NpgsqlDbType.Uuid)
            idsParam.Value <- (if vehicleIds.Length = 0 then [| Guid.Empty |] else vehicleIds)
            use! reader = command.ExecuteReaderAsync(cancellationToken)
            let rows = ResizeArray<Guid * string * DateOnly * int option>()
            let mutable keepReading = true
            while keepReading do
                let! hasRow = reader.ReadAsync(cancellationToken)
                if hasRow then
                    let vid = reader.GetGuid(0)
                    let et = reader.GetString(1)
                    let lastDate = reader.GetFieldValue<DateOnly>(2)
                    let lastOdo = if reader.IsDBNull(3) then None else Some(reader.GetInt32(3))
                    rows.Add((vid, et, lastDate, lastOdo))
                else
                    keepReading <- false
            return
                rows
                |> Seq.groupBy (fun (vid, _, _, _) -> vid)
                |> Seq.map (fun (vid, items) ->
                    let eventMap = items |> Seq.map (fun (_, et, d, o) -> et, (d, o)) |> Map.ofSeq
                    vid, eventMap)
                |> Map.ofSeq
        }

    let private listMaintenanceSignalsAsync (dataSource: NpgsqlDataSource) cancellationToken =
        task {
            let! rawRows = readRawSignalsAsync dataSource cancellationToken
            let matchedIds = rawRows |> Array.choose (fun r -> r.VehicleId)
            let! serviceHistory = readServiceHistoryAsync dataSource matchedIds cancellationToken
            let today = DateOnly.FromDateTime(DateTime.UtcNow)

            return
                rawRows
                |> Array.map (fun raw ->
                    let history =
                        match raw.VehicleId with
                        | Some vid ->
                            serviceHistory |> Map.tryFind vid |> Option.defaultValue Map.empty
                        | None -> Map.empty

                    let richSuggestions =
                        MaintenanceLogic.predictMaintenanceActions
                            MaintenanceLogic.defaultServiceSchedules
                            today
                            raw.LatestImportedOdometer
                            history

                    let fallbackSuggestions =
                        [| if raw.LatestImportedOdometer.IsNone && raw.ImportedMiles = 0 then
                               "Turo import has no mileage/odometer for this vehicle; inspect manually."
                           if raw.VehicleId.IsNone then
                               "Vehicle not matched to fleet — add VIN to link records." |]

                    { VehicleId = raw.VehicleId
                      Vin = raw.Vin
                      VehicleLabel = raw.VehicleLabel
                      ImportedTrips = raw.ImportedTrips
                      CompletedTrips = raw.CompletedTrips
                      ImportedMiles = raw.ImportedMiles
                      LatestTripEnd = raw.LatestTripEnd
                      LatestImportedOdometer = raw.LatestImportedOdometer
                      LatestMaintenanceOdometer = raw.LatestMaintenanceOdometer
                      MilesSinceLatestMaintenance = raw.MilesSinceLatestMaintenance
                      SuggestedActions = Array.append richSuggestions fallbackSuggestions })
        }

    let mapTuroImportEndpoints (app: WebApplication) =
        let group = app.MapGroup("/api/imports/turo-trip-earnings")

        group.MapPost(
            "/",
            Func<NpgsqlDataSource, HttpContext, Task<IResult>>(fun dataSource httpContext ->
                task {
                    let! form = httpContext.Request.ReadFormAsync(httpContext.RequestAborted)
                    let file = form.Files.GetFile("file")

                    if isNull file || file.Length = 0L then
                        return Results.BadRequest("A multipart form file named 'file' is required.")
                    else
                        use memory = new MemoryStream()
                        use stream = file.OpenReadStream()
                        do! stream.CopyToAsync(memory, httpContext.RequestAborted)
                        let rows = readCsvRows(memory.ToArray())
                        let importId = Guid.NewGuid()
                        let now = DateTimeOffset.UtcNow
                        let parsedTrips = ResizeArray<ParsedTrip>()
                        let mutable inserted = 0
                        let mutable updated = 0
                        let mutable skipped = 0

                        use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                        use createImportCommand =
                            new NpgsqlCommand(
                                """
                                insert into kwestkarzbusinessdata.turo_trip_earning_imports (
                                    id, original_file_name, imported_at, row_count, inserted_count,
                                    updated_count, skipped_count, notes
                                )
                                values (
                                    @id, @original_file_name, @imported_at, @row_count, 0, 0, 0, @notes
                                )
                                """,
                                connection
                            )
                        createImportCommand.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, importId) |> ignore
                        createImportCommand.Parameters.AddWithValue("original_file_name", NpgsqlDbType.Text, file.FileName) |> ignore
                        createImportCommand.Parameters.AddWithValue("imported_at", NpgsqlDbType.TimestampTz, now) |> ignore
                        createImportCommand.Parameters.AddWithValue("row_count", NpgsqlDbType.Integer, rows.Length) |> ignore
                        let notes = (form["notes"]).ToString() |> textOrNone
                        createImportCommand.Parameters.AddWithValue("notes", NpgsqlDbType.Text, optionOrDbNull notes) |> ignore
                        let! _ = createImportCommand.ExecuteNonQueryAsync(httpContext.RequestAborted)

                        for row in rows do
                            let! parsed = parseTripAsync connection row httpContext.RequestAborted
                            match parsed with
                            | None -> skipped <- skipped + 1
                            | Some trip ->
                                parsedTrips.Add(trip)
                                let! wasInserted = upsertTripAsync connection importId trip httpContext.RequestAborted
                                do! updateVehicleFromTripAsync connection trip httpContext.RequestAborted
                                if wasInserted then inserted <- inserted + 1 else updated <- updated + 1

                        use updateImportCommand =
                            new NpgsqlCommand(
                                """
                                update kwestkarzbusinessdata.turo_trip_earning_imports
                                set inserted_count = @inserted_count,
                                    updated_count = @updated_count,
                                    skipped_count = @skipped_count
                                where id = @id
                                """,
                                connection
                            )
                        updateImportCommand.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, importId) |> ignore
                        updateImportCommand.Parameters.AddWithValue("inserted_count", NpgsqlDbType.Integer, inserted) |> ignore
                        updateImportCommand.Parameters.AddWithValue("updated_count", NpgsqlDbType.Integer, updated) |> ignore
                        updateImportCommand.Parameters.AddWithValue("skipped_count", NpgsqlDbType.Integer, skipped) |> ignore
                        let! _ = updateImportCommand.ExecuteNonQueryAsync(httpContext.RequestAborted)

                        let response = summarizeImport importId file.FileName rows.Length inserted updated skipped (parsedTrips.ToArray())
                        return Results.Ok(response)
                })
        )
        |> ignore

        group.MapGet(
            "/maintenance-signals",
            Func<NpgsqlDataSource, HttpContext, Task<IResult>>(fun dataSource httpContext ->
                task {
                    let! signals = listMaintenanceSignalsAsync dataSource httpContext.RequestAborted
                    return Results.Ok(signals)
                })
        )
        |> ignore

        app
