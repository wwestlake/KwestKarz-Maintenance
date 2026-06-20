namespace KwestKarz.Api

open System
open System.IO
open System.Text.Json
open System.Text.RegularExpressions
open System.Threading.Tasks
open KwestKarz.Domain
open KwestKarz.Infrastructure
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Npgsql
open NpgsqlTypes

module ComplianceEndpoints =
    let private validTypes = set [ "Registration"; "Insurance"; "LicensePlate" ]

    let private optionOrDbNull value =
        match value with
        | Some value -> box value
        | None -> box DBNull.Value

    let private textOrNone (value: string) =
        if String.IsNullOrWhiteSpace(value) then None else Some(value.Trim())

    let private getOption (reader: NpgsqlDataReader) name getter =
        let ordinal = reader.GetOrdinal(name)
        if reader.IsDBNull(ordinal) then None else Some(getter ordinal)

    let private dueStatus today (recordType: string) (expirationDate: DateOnly option) =
        match recordType, expirationDate with
        | "LicensePlate", _ -> "Tracked"
        | _, None -> "Missing Expiration"
        | _, Some date when date < today -> "Expired"
        | _, Some date when date <= today.AddDays(30) -> "Due Soon"
        | _ -> "Current"

    let private mapRecord today (reader: NpgsqlDataReader) =
        let recordType = reader.GetString(reader.GetOrdinal("record_type"))
        let expirationDate = getOption reader "expiration_date" (fun ordinal -> reader.GetFieldValue<DateOnly>(ordinal))

        { Id = reader.GetGuid(reader.GetOrdinal("id"))
          VehicleId = reader.GetGuid(reader.GetOrdinal("vehicle_id"))
          RecordType = recordType
          Provider = getOption reader "provider" reader.GetString
          PolicyNumber = getOption reader "policy_number" reader.GetString
          DocumentNumber = getOption reader "document_number" reader.GetString
          PlateNumber = getOption reader "plate_number" reader.GetString
          PlateState = getOption reader "plate_state" reader.GetString
          Vin = getOption reader "vin" reader.GetString
          StickerMonth = getOption reader "sticker_month" reader.GetString
          StickerYear = getOption reader "sticker_year" reader.GetInt32
          SerialNumber = getOption reader "serial_number" reader.GetString
          EffectiveDate = getOption reader "effective_date" (fun ordinal -> reader.GetFieldValue<DateOnly>(ordinal))
          ExpirationDate = expirationDate
          DocumentId = getOption reader "document_id" reader.GetGuid
          Notes = getOption reader "notes" reader.GetString
          DueStatus = dueStatus today recordType expirationDate
          CreatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("created_at"))
          UpdatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("updated_at")) }

    let private mapJob (reader: NpgsqlDataReader) =
        { Id = reader.GetGuid(reader.GetOrdinal("id"))
          VehicleId = getOption reader "vehicle_id" reader.GetGuid
          ScanType = reader.GetString(reader.GetOrdinal("scan_type"))
          RecordType = getOption reader "record_type" reader.GetString
          Status = reader.GetString(reader.GetOrdinal("status"))
          Message = getOption reader "message" reader.GetString
          DocumentId = getOption reader "document_id" reader.GetGuid
          ResultRecordId = getOption reader "result_record_id" reader.GetGuid
          AiText = getOption reader "ai_text" reader.GetString
          Error = getOption reader "error" reader.GetString
          CreatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("created_at"))
          UpdatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("updated_at"))
          CompletedAt = getOption reader "completed_at" (fun ordinal -> reader.GetFieldValue<DateTimeOffset>(ordinal)) }

    let private selectColumns =
        """
        id, vehicle_id, record_type, provider, policy_number, document_number,
        plate_number, plate_state, vin, sticker_month, sticker_year, serial_number,
        effective_date, expiration_date, document_id,
        notes, created_at, updated_at
        """

    let listLatestAsync (dataSource: NpgsqlDataSource) vehicleId cancellationToken =
        task {
            use! connection = dataSource.OpenConnectionAsync(cancellationToken)
            use command =
                new NpgsqlCommand(
                    $"""
                    select distinct on (record_type) {selectColumns}
                    from kwestkarzbusinessdata.vehicle_compliance_records
                    where vehicle_id = @vehicle_id
                    order by record_type, updated_at desc
                    """,
                    connection
                )

            command.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, vehicleId) |> ignore
            use! reader = command.ExecuteReaderAsync(cancellationToken)
            let today = DateOnly.FromDateTime(DateTime.UtcNow)
            let records = ResizeArray<ComplianceRecordResponse>()
            let mutable keepReading = true

            while keepReading do
                let! hasRow = reader.ReadAsync(cancellationToken)
                if hasRow then records.Add(mapRecord today reader) else keepReading <- false

            return records |> Seq.sortBy (fun item -> item.RecordType) |> Seq.toArray
        }

    let private tryDate value =
        match textOrNone value with
        | None -> None
        | Some value ->
            match DateOnly.TryParse(value) with
            | true, parsed -> Some parsed
            | _ -> None

    let private tryInt value =
        match textOrNone value with
        | None -> None
        | Some value ->
            match Int32.TryParse(value) with
            | true, parsed -> Some parsed
            | _ -> None

    let private jsonString (json: JsonElement) (name: string) =
        match json.TryGetProperty(name) with
        | true, value when value.ValueKind = JsonValueKind.String -> value.GetString() |> textOrNone
        | _ -> None

    let private normalizeVin (value: string option) =
        match value with
        | None -> None
        | Some text ->
            let normalized = Regex.Replace(text.ToUpperInvariant(), "[^A-HJ-NPR-Z0-9]", "")
            if String.IsNullOrWhiteSpace(normalized) then None else Some normalized

    let private isSubsequence (needle: string) (haystack: string) =
        let mutable index = 0

        for character in haystack do
            if index < needle.Length && needle[index] = character then
                index <- index + 1

        index = needle.Length

    let private reconcileVinWithVehicle vehicleVin parsedVin =
        let normalizedVehicle = normalizeVin vehicleVin
        let normalizedParsed = normalizeVin parsedVin

        match normalizedVehicle, normalizedParsed with
        | Some vehicle, Some parsed when parsed = vehicle -> Some vehicle
        | Some vehicle, Some parsed when vehicle.Length = 17 && parsed.Length = 16 && isSubsequence parsed vehicle -> Some vehicle
        | _, Some parsed when parsed.Length = 17 -> Some parsed
        | _ -> None

    let private parsedField (jsonText: string) name =
        let normalizeJsonText (value: string) =
            if String.IsNullOrWhiteSpace(value) then
                value
            else
                let trimmed = value.Trim()
                let fenced = Regex.Match(trimmed, @"(?s)^```(?:json)?\s*(.*?)\s*```$")

                let unwrapped =
                    if fenced.Success then fenced.Groups[1].Value.Trim()
                    else trimmed

                let first = unwrapped.IndexOf('{')
                let last = unwrapped.LastIndexOf('}')

                if first >= 0 && last > first then unwrapped.Substring(first, last - first + 1)
                else unwrapped

        try
            use document = JsonDocument.Parse(normalizeJsonText jsonText)
            jsonString document.RootElement name
        with _ ->
            None

    let private stateCode (value: string) =
        let normalized =
            Regex.Replace(value.ToUpperInvariant(), @"[^A-Z ]", " ")
            |> fun text -> Regex.Replace(text, @"\s+", " ").Trim()

        let states =
            dict
                [ "ALABAMA", "AL"; "ALASKA", "AK"; "ARIZONA", "AZ"; "ARKANSAS", "AR"; "CALIFORNIA", "CA"
                  "COLORADO", "CO"; "CONNECTICUT", "CT"; "DELAWARE", "DE"; "FLORIDA", "FL"; "GEORGIA", "GA"
                  "HAWAII", "HI"; "IDAHO", "ID"; "ILLINOIS", "IL"; "INDIANA", "IN"; "IOWA", "IA"; "KANSAS", "KS"
                  "KENTUCKY", "KY"; "LOUISIANA", "LA"; "MAINE", "ME"; "MARYLAND", "MD"; "MASSACHUSETTS", "MA"
                  "MICHIGAN", "MI"; "MINNESOTA", "MN"; "MISSISSIPPI", "MS"; "MISSOURI", "MO"; "MONTANA", "MT"
                  "NEBRASKA", "NE"; "NEVADA", "NV"; "NEW HAMPSHIRE", "NH"; "NEW JERSEY", "NJ"; "NEW MEXICO", "NM"
                  "NEW YORK", "NY"; "NORTH CAROLINA", "NC"; "NORTH DAKOTA", "ND"; "OHIO", "OH"; "OKLAHOMA", "OK"
                  "OREGON", "OR"; "PENNSYLVANIA", "PA"; "RHODE ISLAND", "RI"; "SOUTH CAROLINA", "SC"
                  "SOUTH DAKOTA", "SD"; "TENNESSEE", "TN"; "TEXAS", "TX"; "UTAH", "UT"; "VERMONT", "VT"
                  "VIRGINIA", "VA"; "WASHINGTON", "WA"; "WEST VIRGINIA", "WV"; "WISCONSIN", "WI"; "WYOMING", "WY"
                  "DISTRICT OF COLUMBIA", "DC" ]

        if normalized.Length = 2 then normalized
        elif states.ContainsKey(normalized) then states[normalized]
        else normalized

    let private normalizePlateState value =
        value |> Option.map stateCode |> Option.bind textOrNone

    let private normalizeStickerMonth (value: string option) =
        let monthValue text =
            match text with
            | "1" | "01" | "JAN" | "JANUARY" -> Some "01"
            | "2" | "02" | "FEB" | "FEBRUARY" -> Some "02"
            | "3" | "03" | "MAR" | "MARCH" -> Some "03"
            | "4" | "04" | "APR" | "APRIL" -> Some "04"
            | "5" | "05" | "MAY" -> Some "05"
            | "6" | "06" | "JUN" | "JUNE" -> Some "06"
            | "7" | "07" | "JUL" | "JULY" -> Some "07"
            | "8" | "08" | "AUG" | "AUGUST" -> Some "08"
            | "9" | "09" | "SEP" | "SEPT" | "SEPTEMBER" -> Some "09"
            | "10" | "OCT" | "OCTOBER" -> Some "10"
            | "11" | "NOV" | "NOVEMBER" -> Some "11"
            | "12" | "DEC" | "DECEMBER" -> Some "12"
            | _ -> None

        value
        |> Option.map (fun text -> Regex.Replace(text.ToUpperInvariant(), @"[^A-Z0-9]", ""))
        |> Option.bind monthValue

    let private normalizeStickerYear (value: string option) =
        value
        |> Option.map (fun text -> Regex.Replace(text, @"[^0-9]", ""))
        |> Option.bind (fun text ->
            match Int32.TryParse(text) with
            | true, year when year >= 2000 && year <= 2099 -> Some year
            | true, year when year >= 0 && year <= 99 -> Some(2000 + year)
            | _ -> None)

    let private parseCompliance recordType aiText =
        let provider = parsedField aiText "provider"
        let policyNumber = parsedField aiText "policyNumber"
        let documentNumber = parsedField aiText "documentNumber"
        let plateNumber = parsedField aiText "plateNumber"
        let plateState = parsedField aiText "plateState" |> normalizePlateState
        let vin = parsedField aiText "vin"
        let stickerMonth = parsedField aiText "stickerMonth" |> normalizeStickerMonth
        let parsedStickerYear = parsedField aiText "stickerYear" |> normalizeStickerYear
        let parsedSerialNumber = parsedField aiText "serialNumber"
        let serialYearCandidate =
            if recordType = "LicensePlate" then parsedSerialNumber |> normalizeStickerYear else None
        let stickerYear =
            parsedStickerYear
            |> Option.orElseWith (fun () -> serialYearCandidate)
        let serialNumber =
            match recordType, parsedSerialNumber, parsedStickerYear, serialYearCandidate with
            | "LicensePlate", Some _, None, Some _ -> None
            | _ -> parsedSerialNumber
        let effectiveDate = parsedField aiText "effectiveDate" |> Option.bind tryDate
        let parsedExpirationDate = parsedField aiText "expirationDate" |> Option.bind tryDate
        let expirationDate =
            match recordType, effectiveDate, parsedExpirationDate with
            | "Insurance", Some effective, Some expiration when effective = expiration -> None
            | _ -> parsedExpirationDate
        let notes = parsedField aiText "notes"

        {| RecordType = recordType
           Provider = provider
           PolicyNumber = policyNumber
           DocumentNumber = documentNumber
           PlateNumber = plateNumber
           PlateState = plateState
           Vin = vin
           StickerMonth = stickerMonth
           StickerYear = stickerYear
           SerialNumber = serialNumber
           EffectiveDate = effectiveDate
           ExpirationDate = expirationDate
           Notes = notes |}

    let private getVehicleVinAsync (dataSource: NpgsqlDataSource) vehicleId cancellationToken =
        task {
            use! connection = dataSource.OpenConnectionAsync(cancellationToken)
            use command =
                new NpgsqlCommand(
                    """
                    select vin
                    from kwestkarzbusinessdata.vehicles
                    where id = @vehicle_id
                    """,
                    connection
                )

            command.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, vehicleId) |> ignore
            let! result = command.ExecuteScalarAsync(cancellationToken)
            return
                match result with
                | :? string as vin -> Some vin
                | _ -> None
        }

    let private insertRecordAsync (dataSource: NpgsqlDataSource) vehicleId recordType provider policyNumber documentNumber plateNumber plateState vin stickerMonth stickerYear serialNumber effectiveDate expirationDate documentId notes cancellationToken =
        task {
            use! connection = dataSource.OpenConnectionAsync(cancellationToken)
            use command =
                new NpgsqlCommand(
                    $"""
                    insert into kwestkarzbusinessdata.vehicle_compliance_records (
                        id, vehicle_id, record_type, provider, policy_number, document_number,
                        plate_number, plate_state, vin, sticker_month, sticker_year, serial_number,
                        effective_date, expiration_date, document_id,
                        notes, created_at, updated_at
                    )
                    values (
                        @id, @vehicle_id, @record_type, @provider, @policy_number, @document_number,
                        @plate_number, @plate_state, @vin, @sticker_month, @sticker_year, @serial_number,
                        @effective_date, @expiration_date, @document_id,
                        @notes, @created_at, @updated_at
                    )
                    returning {selectColumns}
                    """,
                    connection
                )

            let now = DateTimeOffset.UtcNow
            command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, Guid.NewGuid()) |> ignore
            command.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, vehicleId) |> ignore
            command.Parameters.AddWithValue("record_type", NpgsqlDbType.Text, recordType) |> ignore
            command.Parameters.AddWithValue("provider", NpgsqlDbType.Text, optionOrDbNull provider) |> ignore
            command.Parameters.AddWithValue("policy_number", NpgsqlDbType.Text, optionOrDbNull policyNumber) |> ignore
            command.Parameters.AddWithValue("document_number", NpgsqlDbType.Text, optionOrDbNull documentNumber) |> ignore
            command.Parameters.AddWithValue("plate_number", NpgsqlDbType.Text, optionOrDbNull plateNumber) |> ignore
            command.Parameters.AddWithValue("plate_state", NpgsqlDbType.Text, optionOrDbNull plateState) |> ignore
            command.Parameters.AddWithValue("vin", NpgsqlDbType.Text, optionOrDbNull vin) |> ignore
            command.Parameters.AddWithValue("sticker_month", NpgsqlDbType.Text, optionOrDbNull stickerMonth) |> ignore
            command.Parameters.AddWithValue("sticker_year", NpgsqlDbType.Integer, optionOrDbNull stickerYear) |> ignore
            command.Parameters.AddWithValue("serial_number", NpgsqlDbType.Text, optionOrDbNull serialNumber) |> ignore
            command.Parameters.AddWithValue("effective_date", NpgsqlDbType.Date, optionOrDbNull effectiveDate) |> ignore
            command.Parameters.AddWithValue("expiration_date", NpgsqlDbType.Date, optionOrDbNull expirationDate) |> ignore
            command.Parameters.AddWithValue("document_id", NpgsqlDbType.Uuid, optionOrDbNull documentId) |> ignore
            command.Parameters.AddWithValue("notes", NpgsqlDbType.Text, optionOrDbNull notes) |> ignore
            command.Parameters.AddWithValue("created_at", NpgsqlDbType.TimestampTz, now) |> ignore
            command.Parameters.AddWithValue("updated_at", NpgsqlDbType.TimestampTz, now) |> ignore

            use! reader = command.ExecuteReaderAsync(cancellationToken)
            let! hasRow = reader.ReadAsync(cancellationToken)
            if not hasRow then return failwith "Compliance insert did not return a row."
            else return mapRecord (DateOnly.FromDateTime(DateTime.UtcNow)) reader
        }

    let private insertJobAsync (dataSource: NpgsqlDataSource) vehicleId recordType documentId cancellationToken =
        task {
            use! connection = dataSource.OpenConnectionAsync(cancellationToken)
            use command =
                new NpgsqlCommand(
                    """
                    insert into kwestkarzbusinessdata.scan_jobs (
                        id, vehicle_id, scan_type, record_type, status, message,
                        document_id, result_record_id, ai_text, error,
                        created_at, updated_at, completed_at
                    )
                    values (
                        @id, @vehicle_id, @scan_type, @record_type, @status, @message,
                        @document_id, @result_record_id, @ai_text, @error,
                        @created_at, @updated_at, @completed_at
                    )
                    returning id, vehicle_id, scan_type, record_type, status, message,
                              document_id, result_record_id, ai_text, error,
                              created_at, updated_at, completed_at
                    """,
                    connection
                )

            let now = DateTimeOffset.UtcNow
            command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, Guid.NewGuid()) |> ignore
            command.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, vehicleId) |> ignore
            command.Parameters.AddWithValue("scan_type", NpgsqlDbType.Text, "CompliancePhoto") |> ignore
            command.Parameters.AddWithValue("record_type", NpgsqlDbType.Text, recordType) |> ignore
            command.Parameters.AddWithValue("status", NpgsqlDbType.Text, "Queued") |> ignore
            command.Parameters.AddWithValue("message", NpgsqlDbType.Text, $"Queued {recordType} photo scan.") |> ignore
            command.Parameters.AddWithValue("document_id", NpgsqlDbType.Uuid, documentId) |> ignore
            command.Parameters.AddWithValue("result_record_id", NpgsqlDbType.Uuid, box DBNull.Value) |> ignore
            command.Parameters.AddWithValue("ai_text", NpgsqlDbType.Text, box DBNull.Value) |> ignore
            command.Parameters.AddWithValue("error", NpgsqlDbType.Text, box DBNull.Value) |> ignore
            command.Parameters.AddWithValue("created_at", NpgsqlDbType.TimestampTz, now) |> ignore
            command.Parameters.AddWithValue("updated_at", NpgsqlDbType.TimestampTz, now) |> ignore
            command.Parameters.AddWithValue("completed_at", NpgsqlDbType.TimestampTz, box DBNull.Value) |> ignore

            use! reader = command.ExecuteReaderAsync(cancellationToken)
            let! hasRow = reader.ReadAsync(cancellationToken)
            if not hasRow then return failwith "Scan job insert did not return a row."
            else return mapJob reader
        }

    let private insertRecheckJobAsync (dataSource: NpgsqlDataSource) vehicleId cancellationToken =
        task {
            use! connection = dataSource.OpenConnectionAsync(cancellationToken)
            use command =
                new NpgsqlCommand(
                    """
                    insert into kwestkarzbusinessdata.scan_jobs (
                        id, vehicle_id, scan_type, record_type, status, message,
                        document_id, result_record_id, ai_text, error,
                        created_at, updated_at, completed_at
                    )
                    values (
                        @id, @vehicle_id, @scan_type, @record_type, @status, @message,
                        @document_id, @result_record_id, @ai_text, @error,
                        @created_at, @updated_at, @completed_at
                    )
                    returning id, vehicle_id, scan_type, record_type, status, message,
                              document_id, result_record_id, ai_text, error,
                              created_at, updated_at, completed_at
                    """,
                    connection
                )

            let now = DateTimeOffset.UtcNow
            command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, Guid.NewGuid()) |> ignore
            command.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, vehicleId) |> ignore
            command.Parameters.AddWithValue("scan_type", NpgsqlDbType.Text, "ComplianceRecheck") |> ignore
            command.Parameters.AddWithValue("record_type", NpgsqlDbType.Text, "All") |> ignore
            command.Parameters.AddWithValue("status", NpgsqlDbType.Text, "Queued") |> ignore
            command.Parameters.AddWithValue("message", NpgsqlDbType.Text, "Queued saved compliance image recheck.") |> ignore
            command.Parameters.AddWithValue("document_id", NpgsqlDbType.Uuid, box DBNull.Value) |> ignore
            command.Parameters.AddWithValue("result_record_id", NpgsqlDbType.Uuid, box DBNull.Value) |> ignore
            command.Parameters.AddWithValue("ai_text", NpgsqlDbType.Text, box DBNull.Value) |> ignore
            command.Parameters.AddWithValue("error", NpgsqlDbType.Text, box DBNull.Value) |> ignore
            command.Parameters.AddWithValue("created_at", NpgsqlDbType.TimestampTz, now) |> ignore
            command.Parameters.AddWithValue("updated_at", NpgsqlDbType.TimestampTz, now) |> ignore
            command.Parameters.AddWithValue("completed_at", NpgsqlDbType.TimestampTz, box DBNull.Value) |> ignore

            use! reader = command.ExecuteReaderAsync(cancellationToken)
            let! hasRow = reader.ReadAsync(cancellationToken)
            if not hasRow then return failwith "Scan job insert did not return a row."
            else return mapJob reader
        }

    let private getJobAsync (dataSource: NpgsqlDataSource) jobId cancellationToken =
        task {
            use! connection = dataSource.OpenConnectionAsync(cancellationToken)
            use command =
                new NpgsqlCommand(
                    """
                    select id, vehicle_id, scan_type, record_type, status, message,
                           document_id, result_record_id, ai_text, error,
                           created_at, updated_at, completed_at
                    from kwestkarzbusinessdata.scan_jobs
                    where id = @id
                    """,
                    connection
                )

            command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, jobId) |> ignore
            use! reader = command.ExecuteReaderAsync(cancellationToken)
            let! hasRow = reader.ReadAsync(cancellationToken)
            if hasRow then return Some(mapJob reader) else return None
        }

    let private updateJobAsync (dataSource: NpgsqlDataSource) jobId status message resultRecordId aiText error completed cancellationToken =
        task {
            use! connection = dataSource.OpenConnectionAsync(cancellationToken)
            use command =
                new NpgsqlCommand(
                    """
                    update kwestkarzbusinessdata.scan_jobs
                    set status = @status,
                        message = @message,
                        result_record_id = coalesce(@result_record_id, result_record_id),
                        ai_text = coalesce(@ai_text, ai_text),
                        error = @error,
                        updated_at = @updated_at,
                        completed_at = case when @completed then @updated_at else completed_at end
                    where id = @id
                    returning id, vehicle_id, scan_type, record_type, status, message,
                              document_id, result_record_id, ai_text, error,
                              created_at, updated_at, completed_at
                    """,
                    connection
                )

            command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, jobId) |> ignore
            command.Parameters.AddWithValue("status", NpgsqlDbType.Text, status) |> ignore
            command.Parameters.AddWithValue("message", NpgsqlDbType.Text, optionOrDbNull message) |> ignore
            command.Parameters.AddWithValue("result_record_id", NpgsqlDbType.Uuid, optionOrDbNull resultRecordId) |> ignore
            command.Parameters.AddWithValue("ai_text", NpgsqlDbType.Text, optionOrDbNull aiText) |> ignore
            command.Parameters.AddWithValue("error", NpgsqlDbType.Text, optionOrDbNull error) |> ignore
            command.Parameters.AddWithValue("updated_at", NpgsqlDbType.TimestampTz, DateTimeOffset.UtcNow) |> ignore
            command.Parameters.AddWithValue("completed", NpgsqlDbType.Boolean, completed) |> ignore

            use! reader = command.ExecuteReaderAsync(cancellationToken)
            let! hasRow = reader.ReadAsync(cancellationToken)
            if hasRow then return Some(mapJob reader) else return None
        }

    let private updateRecordAsync (dataSource: NpgsqlDataSource) vehicleId recordId (request: UpdateComplianceRecordRequest) cancellationToken =
        task {
            use! connection = dataSource.OpenConnectionAsync(cancellationToken)
            use command =
                new NpgsqlCommand(
                    $"""
                    update kwestkarzbusinessdata.vehicle_compliance_records
                    set provider = @provider,
                        policy_number = @policy_number,
                        document_number = @document_number,
                        plate_number = @plate_number,
                        plate_state = @plate_state,
                        vin = @vin,
                        sticker_month = @sticker_month,
                        sticker_year = @sticker_year,
                        serial_number = @serial_number,
                        effective_date = @effective_date,
                        expiration_date = @expiration_date,
                        notes = @notes,
                        updated_at = @updated_at
                    where id = @id and vehicle_id = @vehicle_id
                    returning {selectColumns}
                    """,
                    connection
                )

            command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, recordId) |> ignore
            command.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, vehicleId) |> ignore
            command.Parameters.AddWithValue("provider", NpgsqlDbType.Text, optionOrDbNull request.Provider) |> ignore
            command.Parameters.AddWithValue("policy_number", NpgsqlDbType.Text, optionOrDbNull request.PolicyNumber) |> ignore
            command.Parameters.AddWithValue("document_number", NpgsqlDbType.Text, optionOrDbNull request.DocumentNumber) |> ignore
            command.Parameters.AddWithValue("plate_number", NpgsqlDbType.Text, optionOrDbNull request.PlateNumber) |> ignore
            command.Parameters.AddWithValue("plate_state", NpgsqlDbType.Text, optionOrDbNull request.PlateState) |> ignore
            command.Parameters.AddWithValue("vin", NpgsqlDbType.Text, optionOrDbNull request.Vin) |> ignore
            command.Parameters.AddWithValue("sticker_month", NpgsqlDbType.Text, optionOrDbNull request.StickerMonth) |> ignore
            command.Parameters.AddWithValue("sticker_year", NpgsqlDbType.Integer, optionOrDbNull request.StickerYear) |> ignore
            command.Parameters.AddWithValue("serial_number", NpgsqlDbType.Text, optionOrDbNull request.SerialNumber) |> ignore
            command.Parameters.AddWithValue("effective_date", NpgsqlDbType.Date, optionOrDbNull request.EffectiveDate) |> ignore
            command.Parameters.AddWithValue("expiration_date", NpgsqlDbType.Date, optionOrDbNull request.ExpirationDate) |> ignore
            command.Parameters.AddWithValue("notes", NpgsqlDbType.Text, optionOrDbNull request.Notes) |> ignore
            command.Parameters.AddWithValue("updated_at", NpgsqlDbType.TimestampTz, DateTimeOffset.UtcNow) |> ignore

            use! reader = command.ExecuteReaderAsync(cancellationToken)
            let! hasRow = reader.ReadAsync(cancellationToken)
            if hasRow then return Some(mapRecord (DateOnly.FromDateTime(DateTime.UtcNow)) reader) else return None
        }

    let private writeScanLogAsync (dataSource: NpgsqlDataSource) vehicleId recordType aiText cancellationToken =
        task {
            use! connection = dataSource.OpenConnectionAsync(cancellationToken)
            use command =
                new NpgsqlCommand(
                    """
                    insert into kwestkarzbusinessdata.system_logs (
                        id, logged_at, level, source, method, path, status_code, elapsed_ms, message, exception
                    )
                    values (
                        @id, @logged_at, @level, @source, @method, @path, @status_code, @elapsed_ms, @message, @exception
                    )
                    """,
                    connection
                )

            command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, Guid.NewGuid()) |> ignore
            command.Parameters.AddWithValue("logged_at", NpgsqlDbType.TimestampTz, DateTimeOffset.UtcNow) |> ignore
            command.Parameters.AddWithValue("level", NpgsqlDbType.Text, "Information") |> ignore
            command.Parameters.AddWithValue("source", NpgsqlDbType.Text, "ComplianceScan") |> ignore
            command.Parameters.AddWithValue("method", NpgsqlDbType.Text, "POST") |> ignore
            command.Parameters.AddWithValue("path", NpgsqlDbType.Text, $"/api/vehicles/{vehicleId}/compliance/photo") |> ignore
            command.Parameters.AddWithValue("status_code", NpgsqlDbType.Integer, 200) |> ignore
            command.Parameters.AddWithValue("elapsed_ms", NpgsqlDbType.Integer, box DBNull.Value) |> ignore
            command.Parameters.AddWithValue("message", NpgsqlDbType.Text, $"Type={recordType}; AI={aiText}") |> ignore
            command.Parameters.AddWithValue("exception", NpgsqlDbType.Text, box DBNull.Value) |> ignore
            let! _ = command.ExecuteNonQueryAsync(cancellationToken)
            return ()
        }

    let private documentKind recordType =
        match recordType with
        | "Registration" -> DocumentKind.Registration
        | "Insurance" -> DocumentKind.Insurance
        | "LicensePlate" -> DocumentKind.LicensePlate
        | _ -> DocumentKind.Other

    let private promptFor recordType =
        match recordType with
        | "Insurance" ->
            "Read this vehicle insurance card or certificate. Return JSON only with fields provider, policyNumber, documentNumber, plateNumber, plateState, vin, stickerMonth, stickerYear, serialNumber, effectiveDate, expirationDate, notes. Dates must be yyyy-MM-dd or empty strings. effectiveDate must come only from labels like effective, inception, policy begins, or from date. expirationDate must come only from labels like expiration, expires, policy ends, through, to, or valid until. Do not copy the effective date into expirationDate. If an expiration or policy-period-end date is blurry, missing, or ambiguous, set expirationDate to an empty string and explain uncertainty in notes. Capture VIN only when a full 17-character VIN is visible."
        | "Registration" ->
            "Read this vehicle registration document. Return JSON only with fields provider, policyNumber, documentNumber, plateNumber, plateState, vin, stickerMonth, stickerYear, serialNumber, effectiveDate, expirationDate, notes. Dates must be yyyy-MM-dd or empty strings. expirationDate must be the registration expiration, tab expiration, valid-until date, or renewal due date. Capture VIN only when a full 17-character VIN is visible. Put registration/control/sticker/serial number in serialNumber or documentNumber as appropriate. If unclear, leave expirationDate empty and explain in notes."
        | "LicensePlate" ->
            "Read this close-up vehicle license plate photo. Return JSON only with fields provider, policyNumber, documentNumber, plateNumber, plateState, vin, stickerMonth, stickerYear, serialNumber, effectiveDate, expirationDate, notes. Focus on plateNumber, plateState, registration tab/sticker month and year, and any sticker serial/control number. Return plateState as the two-letter state abbreviation when possible. Put the visible tab month abbreviation or number in stickerMonth and the visible tab year in stickerYear. If the tab shows a two-digit year like 27, interpret it as 2027 and put it in stickerYear, not serialNumber. If a registration tab month/year is visible, put the best yyyy-MM-dd estimate in expirationDate only when the year is clear; otherwise leave expirationDate empty and explain in notes. VIN is usually not on the plate; only fill vin if a full 17-character VIN is visible."
        | _ ->
            $"Read this vehicle {recordType} image. Return JSON only with fields provider, policyNumber, documentNumber, plateNumber, plateState, vin, stickerMonth, stickerYear, serialNumber, effectiveDate, expirationDate, notes. Dates must be yyyy-MM-dd or empty strings."

    let private processComplianceJobAsync (jobId: Guid) vehicleId recordType contentType imageBase64 (ai: OpenAIResponsesConnection) (dataSource: NpgsqlDataSource) =
        task {
            try
                let! _ =
                    updateJobAsync
                        dataSource
                        jobId
                        "Processing"
                        (Some($"Reading {recordType} photo with AI."))
                        None
                        None
                        None
                        false
                        Threading.CancellationToken.None

                let aiRequest =
                    { SystemInstructions = Some "You extract vehicle compliance information from registration cards, insurance cards, and license plate photos. Return JSON only."
                      UserMessage = promptFor recordType }

                let! aiResponse = ai.CompleteWithImageAsync(aiRequest, contentType, imageBase64, Threading.CancellationToken.None)
                let parsed = parseCompliance recordType aiResponse.Text
                let! vehicleVin = getVehicleVinAsync dataSource vehicleId Threading.CancellationToken.None
                let reconciledVin = reconcileVinWithVehicle vehicleVin parsed.Vin
                let! job = getJobAsync dataSource jobId Threading.CancellationToken.None
                let documentId = job |> Option.bind (fun item -> item.DocumentId)
                let! record =
                    insertRecordAsync
                        dataSource
                        vehicleId
                        recordType
                        parsed.Provider
                        parsed.PolicyNumber
                        parsed.DocumentNumber
                        parsed.PlateNumber
                        parsed.PlateState
                        reconciledVin
                        parsed.StickerMonth
                        parsed.StickerYear
                        parsed.SerialNumber
                        parsed.EffectiveDate
                        parsed.ExpirationDate
                        documentId
                        parsed.Notes
                        Threading.CancellationToken.None

                do! writeScanLogAsync dataSource vehicleId recordType aiResponse.Text Threading.CancellationToken.None
                let! _ =
                    updateJobAsync
                        dataSource
                        jobId
                        "Succeeded"
                        (Some($"{recordType} photo read. Review extracted fields."))
                        (Some record.Id)
                        (Some aiResponse.Text)
                        None
                        true
                        Threading.CancellationToken.None

                return ()
            with error ->
                let! _ =
                    updateJobAsync
                        dataSource
                        jobId
                        "Failed"
                        (Some($"{recordType} photo scan failed."))
                        None
                        None
                        (Some error.Message)
                        true
                        Threading.CancellationToken.None

                return ()
        }

    let private processComplianceRecheckJobAsync (jobId: Guid) vehicleId (ai: OpenAIResponsesConnection) (documents: IDocumentRepository) (dataSource: NpgsqlDataSource) =
        task {
            try
                let! _ =
                    updateJobAsync
                        dataSource
                        jobId
                        "Processing"
                        (Some "Rechecking saved compliance images.")
                        None
                        None
                        None
                        false
                        Threading.CancellationToken.None

                let! latestRecords = listLatestAsync dataSource vehicleId Threading.CancellationToken.None
                let recordsWithDocuments =
                    latestRecords
                    |> Array.choose (fun record ->
                        record.DocumentId
                        |> Option.map (fun documentId -> record.RecordType, documentId))

                if recordsWithDocuments.Length = 0 then
                    let! _ =
                        updateJobAsync
                            dataSource
                            jobId
                            "Failed"
                            (Some "No saved compliance photos found to recheck.")
                            None
                            None
                            (Some "No saved compliance photos found to recheck.")
                            true
                            Threading.CancellationToken.None

                    return ()
                else
                    let aiTexts = ResizeArray<string>()

                    for recordType, documentId in recordsWithDocuments do
                        let! _ =
                            updateJobAsync
                                dataSource
                                jobId
                                "Processing"
                                (Some($"Rechecking {recordType} photo."))
                                None
                                None
                                None
                                false
                                Threading.CancellationToken.None

                        let! documentContent = documents.FindContentAsync(documentId, Threading.CancellationToken.None)

                        match documentContent with
                        | Some { Document = document; ContentBytes = Some contentBytes } ->
                            let imageBase64 = Convert.ToBase64String(contentBytes)
                            let aiRequest =
                                { SystemInstructions = Some "You extract vehicle compliance information from registration cards, insurance cards, and license plate photos. Return JSON only."
                                  UserMessage = promptFor recordType }

                            let! aiResponse = ai.CompleteWithImageAsync(aiRequest, document.ContentType, imageBase64, Threading.CancellationToken.None)
                            let parsed = parseCompliance recordType aiResponse.Text
                            let! vehicleVin = getVehicleVinAsync dataSource vehicleId Threading.CancellationToken.None
                            let reconciledVin = reconcileVinWithVehicle vehicleVin parsed.Vin
                            let! record =
                                insertRecordAsync
                                    dataSource
                                    vehicleId
                                    recordType
                                    parsed.Provider
                                    parsed.PolicyNumber
                                    parsed.DocumentNumber
                                    parsed.PlateNumber
                                    parsed.PlateState
                                    reconciledVin
                                    parsed.StickerMonth
                                    parsed.StickerYear
                                    parsed.SerialNumber
                                    parsed.EffectiveDate
                                    parsed.ExpirationDate
                                    (Some documentId)
                                    parsed.Notes
                                    Threading.CancellationToken.None

                            aiTexts.Add($"{recordType}: {aiResponse.Text}")
                            do! writeScanLogAsync dataSource vehicleId recordType aiResponse.Text Threading.CancellationToken.None
                            let! _ =
                                updateJobAsync
                                    dataSource
                                    jobId
                                    "Processing"
                                    (Some($"Rechecked {recordType} photo."))
                                    (Some record.Id)
                                    None
                                    None
                                    false
                                    Threading.CancellationToken.None

                            ()
                        | _ -> ()

                    let! _ =
                        updateJobAsync
                            dataSource
                            jobId
                            "Succeeded"
                            (Some "Saved compliance images rechecked. Review extracted fields.")
                            None
                            (Some(String.Join("\n\n", aiTexts)))
                            None
                            true
                            Threading.CancellationToken.None

                    return ()
            with error ->
                let! _ =
                    updateJobAsync
                        dataSource
                        jobId
                        "Failed"
                        (Some "Saved compliance image recheck failed.")
                        None
                        None
                        (Some error.Message)
                        true
                        Threading.CancellationToken.None

                return ()
        }

    let mapComplianceEndpoints (app: WebApplication) =
        let group = app.MapGroup("/api/vehicles/{vehicleId:guid}/compliance")

        group.MapGet(
            "/",
            Func<Guid, NpgsqlDataSource, HttpContext, Task<IResult>>(fun vehicleId dataSource httpContext ->
                task {
                    let! records = listLatestAsync dataSource vehicleId httpContext.RequestAborted
                    return Results.Ok(records)
                })
        )
        |> ignore

        group.MapPost(
            "/photo-jobs/recheck",
            Func<Guid, OpenAIResponsesConnection, IDocumentRepository, NpgsqlDataSource, HttpContext, Task<IResult>>(fun vehicleId ai documents dataSource httpContext ->
                task {
                    let! job = insertRecheckJobAsync dataSource vehicleId httpContext.RequestAborted
                    processComplianceRecheckJobAsync job.Id vehicleId ai documents dataSource
                    |> fun work -> Task.Run(fun () -> work :> Task) |> ignore

                    return Results.Accepted($"/api/vehicles/{vehicleId}/compliance/photo-jobs/{job.Id}", job)
                })
        )
        |> ignore

        group.MapPost(
            "/photo-jobs",
            Func<Guid, OpenAIResponsesConnection, IDocumentRepository, NpgsqlDataSource, HttpContext, Task<IResult>>(fun vehicleId ai documents dataSource httpContext ->
                task {
                    let! form = httpContext.Request.ReadFormAsync(httpContext.RequestAborted)
                    let file = form.Files.GetFile("file")
                    let recordType = form["recordType"].ToString()

                    if not (validTypes.Contains(recordType)) then
                        return Results.BadRequest("recordType must be Registration, Insurance, or LicensePlate.")
                    elif isNull file || file.Length = 0L then
                        return Results.BadRequest("A multipart form image named 'file' is required.")
                    else
                        use stream = file.OpenReadStream()
                        use memory = new MemoryStream()
                        do! stream.CopyToAsync(memory, httpContext.RequestAborted)
                        let contentBytes = memory.ToArray()
                        let imageBase64 = Convert.ToBase64String(contentBytes)
                        let contentType = if String.IsNullOrWhiteSpace(file.ContentType) then "application/octet-stream" else file.ContentType

                        let newDocument =
                            { OwnerType = DocumentOwnerType.Vehicle
                              OwnerId = vehicleId
                              Kind = documentKind recordType
                              OriginalFileName = file.FileName
                              ContentType = contentType
                              StoragePath = ""
                              SizeBytes = int64 contentBytes.Length
                              Description = Some($"{recordType} photo")
                              ContentBytes = Some contentBytes }

                        let! document = documents.CreateAsync(newDocument, httpContext.RequestAborted)
                        let! job = insertJobAsync dataSource vehicleId recordType document.Id httpContext.RequestAborted
                        processComplianceJobAsync job.Id vehicleId recordType contentType imageBase64 ai dataSource
                        |> fun work -> Task.Run(fun () -> work :> Task) |> ignore

                        return Results.Accepted($"/api/vehicles/{vehicleId}/compliance/photo-jobs/{job.Id}", job)
                })
        )
        |> ignore

        group.MapGet(
            "/photo-jobs/{jobId:guid}",
            Func<Guid, Guid, NpgsqlDataSource, HttpContext, Task<IResult>>(fun vehicleId jobId dataSource httpContext ->
                task {
                    let! job = getJobAsync dataSource jobId httpContext.RequestAborted
                    return
                        match job with
                        | Some item when item.VehicleId = Some vehicleId -> Results.Ok(item)
                        | Some _ -> Results.NotFound()
                        | None -> Results.NotFound()
                })
        )
        |> ignore

        group.MapPost(
            "/photo",
            Func<Guid, OpenAIResponsesConnection, IDocumentRepository, NpgsqlDataSource, HttpContext, Task<IResult>>(fun vehicleId ai documents dataSource httpContext ->
                task {
                    let! form = httpContext.Request.ReadFormAsync(httpContext.RequestAborted)
                    let file = form.Files.GetFile("file")
                    let recordType = form["recordType"].ToString()

                    if not (validTypes.Contains(recordType)) then
                        return Results.BadRequest("recordType must be Registration, Insurance, or LicensePlate.")
                    elif isNull file || file.Length = 0L then
                        return Results.BadRequest("A multipart form image named 'file' is required.")
                    else
                        use stream = file.OpenReadStream()
                        use memory = new MemoryStream()
                        do! stream.CopyToAsync(memory, httpContext.RequestAborted)
                        let contentBytes = memory.ToArray()
                        let imageBase64 = Convert.ToBase64String(contentBytes)

                        let newDocument =
                            { OwnerType = DocumentOwnerType.Vehicle
                              OwnerId = vehicleId
                              Kind = documentKind recordType
                              OriginalFileName = file.FileName
                              ContentType = if String.IsNullOrWhiteSpace(file.ContentType) then "application/octet-stream" else file.ContentType
                              StoragePath = ""
                              SizeBytes = int64 contentBytes.Length
                              Description = Some($"{recordType} photo")
                              ContentBytes = Some contentBytes }

                        let! document = documents.CreateAsync(newDocument, httpContext.RequestAborted)
                        let aiRequest =
                            { SystemInstructions = Some "You extract vehicle compliance information from registration cards, insurance cards, and license plate photos. Return JSON only."
                              UserMessage = promptFor recordType }

                        let! aiResponse = ai.CompleteWithImageAsync(aiRequest, file.ContentType, imageBase64, httpContext.RequestAborted)
                        let parsed = parseCompliance recordType aiResponse.Text
                        let! record =
                            insertRecordAsync
                                dataSource
                                vehicleId
                                recordType
                                parsed.Provider
                                parsed.PolicyNumber
                                parsed.DocumentNumber
                                parsed.PlateNumber
                                parsed.PlateState
                                parsed.Vin
                                parsed.StickerMonth
                                parsed.StickerYear
                                parsed.SerialNumber
                                parsed.EffectiveDate
                                parsed.ExpirationDate
                                (Some document.Id)
                                parsed.Notes
                                httpContext.RequestAborted

                        do! writeScanLogAsync dataSource vehicleId recordType aiResponse.Text httpContext.RequestAborted
                        return Results.Ok({ Record = record; AiText = aiResponse.Text })
                })
        )
        |> ignore

        group.MapPut(
            "/{recordId:guid}",
            Func<Guid, Guid, UpdateComplianceRecordRequest, NpgsqlDataSource, HttpContext, Task<IResult>>(fun vehicleId recordId request dataSource httpContext ->
                task {
                    let! updated = updateRecordAsync dataSource vehicleId recordId request httpContext.RequestAborted
                    return
                        match updated with
                        | Some record -> Results.Ok(record)
                        | None -> Results.NotFound()
                })
        )
        |> ignore

        app
