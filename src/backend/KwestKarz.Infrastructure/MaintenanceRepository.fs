namespace KwestKarz.Infrastructure

open System
open System.Threading
open System.Threading.Tasks
open KwestKarz.Domain
open Npgsql
open NpgsqlTypes

type PostgresMaintenanceRepository(dataSource: NpgsqlDataSource) =
    let optionOrDbNull value =
        match value with
        | Some x -> box x
        | None -> box DBNull.Value

    let getOption (reader: NpgsqlDataReader) name getter =
        let ordinal = reader.GetOrdinal(name)
        if reader.IsDBNull(ordinal) then None else Some(getter ordinal)

    let mapRecord (reader: NpgsqlDataReader) =
        { Id = reader.GetGuid(reader.GetOrdinal("id"))
          VehicleId = reader.GetGuid(reader.GetOrdinal("vehicle_id"))
          EventType = reader.GetString(reader.GetOrdinal("event_type"))
          DatePerformed = reader.GetFieldValue<DateOnly>(reader.GetOrdinal("date_performed"))
          Odometer = getOption reader "odometer" reader.GetInt32
          PerformedBy = getOption reader "performed_by" reader.GetString
          Cost = getOption reader "cost" reader.GetDecimal
          NextDueDate = getOption reader "next_due_date" reader.GetFieldValue<DateOnly>
          NextDueOdometer = getOption reader "next_due_odometer" reader.GetInt32
          Notes = getOption reader "notes" reader.GetString
          CreatedBy = getOption reader "created_by" reader.GetString
          CreatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("created_at"))
          UpdatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("updated_at")) }

    let selectColumns =
        """
        id, vehicle_id, event_type, date_performed, odometer, performed_by,
        cost, next_due_date, next_due_odometer, notes, created_by, created_at, updated_at
        """

    let addParameters (command: NpgsqlCommand) (record: NewMaintenanceRecord) (id: Guid) (now: DateTimeOffset) =
        command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, id) |> ignore
        command.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, record.VehicleId) |> ignore
        command.Parameters.AddWithValue("event_type", NpgsqlDbType.Text, record.EventType.Trim()) |> ignore
        command.Parameters.AddWithValue("date_performed", NpgsqlDbType.Date, record.DatePerformed) |> ignore
        command.Parameters.AddWithValue("odometer", NpgsqlDbType.Integer, optionOrDbNull record.Odometer) |> ignore
        command.Parameters.AddWithValue("performed_by", NpgsqlDbType.Text, optionOrDbNull record.PerformedBy) |> ignore
        command.Parameters.AddWithValue("cost", NpgsqlDbType.Numeric, optionOrDbNull record.Cost) |> ignore
        command.Parameters.AddWithValue("next_due_date", NpgsqlDbType.Date, optionOrDbNull record.NextDueDate) |> ignore
        command.Parameters.AddWithValue("next_due_odometer", NpgsqlDbType.Integer, optionOrDbNull record.NextDueOdometer) |> ignore
        command.Parameters.AddWithValue("notes", NpgsqlDbType.Text, optionOrDbNull record.Notes) |> ignore
        command.Parameters.AddWithValue("created_by", NpgsqlDbType.Text, optionOrDbNull record.CreatedBy) |> ignore
        command.Parameters.AddWithValue("created_at", NpgsqlDbType.TimestampTz, now) |> ignore
        command.Parameters.AddWithValue("updated_at", NpgsqlDbType.TimestampTz, now) |> ignore

    interface IMaintenanceRepository with
        member _.CreateAsync(record: NewMaintenanceRecord, cancellationToken: CancellationToken) : Task<MaintenanceRecord> =
            task {
                let id = Guid.NewGuid()
                let now = DateTimeOffset.UtcNow

                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                use command =
                    new NpgsqlCommand(
                        $"""
                        insert into kwestkarzbusinessdata.maintenance_records (
                            id, vehicle_id, event_type, date_performed, odometer, performed_by,
                            cost, next_due_date, next_due_odometer, notes, created_by, created_at, updated_at
                        )
                        values (
                            @id, @vehicle_id, @event_type, @date_performed, @odometer, @performed_by,
                            @cost, @next_due_date, @next_due_odometer, @notes, @created_by, @created_at, @updated_at
                        )
                        returning {selectColumns}
                        """,
                        connection
                    )

                addParameters command record id now
                use! reader = command.ExecuteReaderAsync(cancellationToken)
                let! hasRow = reader.ReadAsync(cancellationToken)

                if not hasRow then
                    return failwith "Maintenance insert did not return a row."
                else
                    return mapRecord reader
            }

        member _.ListForVehicleAsync(vehicleId: Guid, cancellationToken: CancellationToken) : Task<MaintenanceRecord list> =
            task {
                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                use command =
                    new NpgsqlCommand(
                        $"select {selectColumns} from kwestkarzbusinessdata.maintenance_records where vehicle_id = @vehicle_id order by date_performed desc, created_at desc",
                        connection
                    )

                command.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, vehicleId) |> ignore
                use! reader = command.ExecuteReaderAsync(cancellationToken)
                let records = ResizeArray<MaintenanceRecord>()
                let mutable keepReading = true

                while keepReading do
                    let! hasRow = reader.ReadAsync(cancellationToken)
                    if hasRow then records.Add(mapRecord reader) else keepReading <- false

                return List.ofSeq records
            }

        member _.ListRecentForVehicleAsync(vehicleId: Guid, limit: int, cancellationToken: CancellationToken) : Task<MaintenanceRecord list> =
            task {
                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                use command =
                    new NpgsqlCommand(
                        $"select {selectColumns} from kwestkarzbusinessdata.maintenance_records where vehicle_id = @vehicle_id order by date_performed desc, created_at desc limit @limit",
                        connection
                    )

                command.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, vehicleId) |> ignore
                command.Parameters.AddWithValue("limit", NpgsqlDbType.Integer, max 1 limit) |> ignore
                use! reader = command.ExecuteReaderAsync(cancellationToken)
                let records = ResizeArray<MaintenanceRecord>()
                let mutable keepReading = true

                while keepReading do
                    let! hasRow = reader.ReadAsync(cancellationToken)
                    if hasRow then records.Add(mapRecord reader) else keepReading <- false

                return List.ofSeq records
            }
