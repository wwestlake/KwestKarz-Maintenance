namespace KwestKarz.Infrastructure

open System
open System.Threading
open System.Threading.Tasks
open KwestKarz.Domain
open Npgsql
open NpgsqlTypes

type PostgresTirePressureRepository(dataSource: NpgsqlDataSource) =
    let optionOrDbNull value =
        match value with
        | Some x -> box x
        | None -> box DBNull.Value

    let getOption (reader: NpgsqlDataReader) name getter =
        let ordinal = reader.GetOrdinal(name)
        if reader.IsDBNull(ordinal) then None else Some(getter ordinal)

    let mapSpec (reader: NpgsqlDataReader) =
        { VehicleId = reader.GetGuid(reader.GetOrdinal("vehicle_id"))
          FrontLeftPsi = getOption reader "front_left_psi" reader.GetInt32
          FrontRightPsi = getOption reader "front_right_psi" reader.GetInt32
          RearLeftPsi = getOption reader "rear_left_psi" reader.GetInt32
          RearRightPsi = getOption reader "rear_right_psi" reader.GetInt32
          Notes = getOption reader "notes" reader.GetString
          PhotoDocumentId = getOption reader "photo_document_id" reader.GetGuid
          CreatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("created_at"))
          UpdatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("updated_at")) }

    let mapLog (reader: NpgsqlDataReader) =
        { Id = reader.GetGuid(reader.GetOrdinal("id"))
          VehicleId = reader.GetGuid(reader.GetOrdinal("vehicle_id"))
          MeasuredAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("measured_at"))
          FrontLeftPsi = getOption reader "front_left_psi" reader.GetInt32
          FrontRightPsi = getOption reader "front_right_psi" reader.GetInt32
          RearLeftPsi = getOption reader "rear_left_psi" reader.GetInt32
          RearRightPsi = getOption reader "rear_right_psi" reader.GetInt32
          Status = reader.GetString(reader.GetOrdinal("status")) |> TirePressureStatus.fromStorageValue
          Notes = getOption reader "notes" reader.GetString
          PhotoDocumentId = getOption reader "photo_document_id" reader.GetGuid
          CreatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("created_at")) }

    let specColumns =
        """
        vehicle_id, front_left_psi, front_right_psi, rear_left_psi, rear_right_psi,
        notes, photo_document_id, created_at, updated_at
        """

    let logColumns =
        """
        id, vehicle_id, measured_at, front_left_psi, front_right_psi, rear_left_psi, rear_right_psi,
        status, notes, photo_document_id, created_at
        """

    let statusFor (spec: TirePressureSpec option) (log: NewTirePressureLog) =
        let score tireValue target =
            match tireValue, target with
            | Some value, Some targetPsi ->
                let diff = abs (value - targetPsi)
                if diff <= 2 then 0 elif diff <= 5 then 1 else 2
            | Some _, None -> 0
            | None, _ -> 1

        let worst =
            [ score log.FrontLeftPsi (spec |> Option.bind (fun item -> item.FrontLeftPsi))
              score log.FrontRightPsi (spec |> Option.bind (fun item -> item.FrontRightPsi))
              score log.RearLeftPsi (spec |> Option.bind (fun item -> item.RearLeftPsi))
              score log.RearRightPsi (spec |> Option.bind (fun item -> item.RearRightPsi)) ]
            |> List.max

        if worst >= 2 then TirePressureStatus.Red
        elif worst = 1 then TirePressureStatus.Yellow
        else TirePressureStatus.Green

    interface ITirePressureRepository with
        member _.GetSnapshotAsync(vehicleId: Guid, cancellationToken: CancellationToken) : Task<TirePressureSnapshot> =
            task {
                use! connection = dataSource.OpenConnectionAsync(cancellationToken)

                use specCommand =
                    new NpgsqlCommand(
                        $"select {specColumns} from kwestkarzbusinessdata.tire_pressure_specs where vehicle_id = @vehicle_id",
                        connection
                    )

                specCommand.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, vehicleId) |> ignore
                use! specReader = specCommand.ExecuteReaderAsync(cancellationToken)
                let! hasSpec = specReader.ReadAsync(cancellationToken)
                let spec = if hasSpec then Some(mapSpec specReader) else None
                do! specReader.DisposeAsync().AsTask()

                use logCommand =
                    new NpgsqlCommand(
                        $"select {logColumns} from kwestkarzbusinessdata.tire_pressure_logs where vehicle_id = @vehicle_id order by measured_at desc, created_at desc limit 10",
                        connection
                    )

                logCommand.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, vehicleId) |> ignore
                use! logReader = logCommand.ExecuteReaderAsync(cancellationToken)
                let logs = ResizeArray<TirePressureLog>()
                let mutable keepReading = true

                while keepReading do
                    let! hasRow = logReader.ReadAsync(cancellationToken)
                    if hasRow then logs.Add(mapLog logReader) else keepReading <- false

                return { Spec = spec; RecentLogs = List.ofSeq logs }
            }

        member _.UpsertSpecAsync(spec: UpsertTirePressureSpec, cancellationToken: CancellationToken) : Task<TirePressureSpec> =
            task {
                let now = DateTimeOffset.UtcNow
                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                use command =
                    new NpgsqlCommand(
                        $"""
                        insert into kwestkarzbusinessdata.tire_pressure_specs (
                            vehicle_id, front_psi, rear_psi, front_left_psi, front_right_psi,
                            rear_left_psi, rear_right_psi, notes, photo_document_id, created_at, updated_at
                        )
                        values (
                            @vehicle_id, @front_psi, @rear_psi, @front_left_psi, @front_right_psi,
                            @rear_left_psi, @rear_right_psi, @notes, @photo_document_id, @created_at, @updated_at
                        )
                        on conflict (vehicle_id) do update
                        set front_psi = excluded.front_psi,
                            rear_psi = excluded.rear_psi,
                            front_left_psi = excluded.front_left_psi,
                            front_right_psi = excluded.front_right_psi,
                            rear_left_psi = excluded.rear_left_psi,
                            rear_right_psi = excluded.rear_right_psi,
                            notes = excluded.notes,
                            photo_document_id = excluded.photo_document_id,
                            updated_at = excluded.updated_at
                        returning {specColumns}
                        """,
                        connection
                    )

                command.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, spec.VehicleId) |> ignore
                command.Parameters.AddWithValue("front_psi", NpgsqlDbType.Integer, optionOrDbNull spec.FrontLeftPsi) |> ignore
                command.Parameters.AddWithValue("rear_psi", NpgsqlDbType.Integer, optionOrDbNull spec.RearLeftPsi) |> ignore
                command.Parameters.AddWithValue("front_left_psi", NpgsqlDbType.Integer, optionOrDbNull spec.FrontLeftPsi) |> ignore
                command.Parameters.AddWithValue("front_right_psi", NpgsqlDbType.Integer, optionOrDbNull spec.FrontRightPsi) |> ignore
                command.Parameters.AddWithValue("rear_left_psi", NpgsqlDbType.Integer, optionOrDbNull spec.RearLeftPsi) |> ignore
                command.Parameters.AddWithValue("rear_right_psi", NpgsqlDbType.Integer, optionOrDbNull spec.RearRightPsi) |> ignore
                command.Parameters.AddWithValue("notes", NpgsqlDbType.Text, optionOrDbNull spec.Notes) |> ignore
                command.Parameters.AddWithValue("photo_document_id", NpgsqlDbType.Uuid, optionOrDbNull spec.PhotoDocumentId) |> ignore
                command.Parameters.AddWithValue("created_at", NpgsqlDbType.TimestampTz, now) |> ignore
                command.Parameters.AddWithValue("updated_at", NpgsqlDbType.TimestampTz, now) |> ignore

                use! reader = command.ExecuteReaderAsync(cancellationToken)
                let! hasRow = reader.ReadAsync(cancellationToken)
                if not hasRow then return failwith "Tire pressure spec upsert did not return a row."
                else return mapSpec reader
            }

        member this.CreateLogAsync(log: NewTirePressureLog, cancellationToken: CancellationToken) : Task<TirePressureLog> =
            task {
                let! snapshot = (this :> ITirePressureRepository).GetSnapshotAsync(log.VehicleId, cancellationToken)
                let status = statusFor snapshot.Spec log
                let id = Guid.NewGuid()
                let now = DateTimeOffset.UtcNow

                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                use command =
                    new NpgsqlCommand(
                        $"""
                        insert into kwestkarzbusinessdata.tire_pressure_logs (
                            id, vehicle_id, measured_at, front_left_psi, front_right_psi, rear_left_psi, rear_right_psi,
                            status, notes, photo_document_id, created_at
                        )
                        values (
                            @id, @vehicle_id, @measured_at, @front_left_psi, @front_right_psi, @rear_left_psi, @rear_right_psi,
                            @status, @notes, @photo_document_id, @created_at
                        )
                        returning {logColumns}
                        """,
                        connection
                    )

                command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, id) |> ignore
                command.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, log.VehicleId) |> ignore
                command.Parameters.AddWithValue("measured_at", NpgsqlDbType.TimestampTz, log.MeasuredAt) |> ignore
                command.Parameters.AddWithValue("front_left_psi", NpgsqlDbType.Integer, optionOrDbNull log.FrontLeftPsi) |> ignore
                command.Parameters.AddWithValue("front_right_psi", NpgsqlDbType.Integer, optionOrDbNull log.FrontRightPsi) |> ignore
                command.Parameters.AddWithValue("rear_left_psi", NpgsqlDbType.Integer, optionOrDbNull log.RearLeftPsi) |> ignore
                command.Parameters.AddWithValue("rear_right_psi", NpgsqlDbType.Integer, optionOrDbNull log.RearRightPsi) |> ignore
                command.Parameters.AddWithValue("status", NpgsqlDbType.Text, TirePressureStatus.toStorageValue status) |> ignore
                command.Parameters.AddWithValue("notes", NpgsqlDbType.Text, optionOrDbNull log.Notes) |> ignore
                command.Parameters.AddWithValue("photo_document_id", NpgsqlDbType.Uuid, optionOrDbNull log.PhotoDocumentId) |> ignore
                command.Parameters.AddWithValue("created_at", NpgsqlDbType.TimestampTz, now) |> ignore

                use! reader = command.ExecuteReaderAsync(cancellationToken)
                let! hasRow = reader.ReadAsync(cancellationToken)
                if not hasRow then return failwith "Tire pressure log insert did not return a row."
                else return mapLog reader
            }
