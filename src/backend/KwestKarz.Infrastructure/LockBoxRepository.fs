namespace KwestKarz.Infrastructure

open System
open System.Threading
open System.Threading.Tasks
open KwestKarz.Domain
open Npgsql
open NpgsqlTypes

type PostgresLockBoxRepository(dataSource: NpgsqlDataSource) as this =
    let optionOrDbNull value =
        match value with
        | Some x -> box x
        | None -> box DBNull.Value

    let getOption (reader: NpgsqlDataReader) name getter =
        let ordinal = reader.GetOrdinal(name)
        if reader.IsDBNull(ordinal) then None else Some(getter ordinal)

    let mapLockBox (reader: NpgsqlDataReader) =
        { Id = reader.GetGuid(reader.GetOrdinal("id"))
          BoxNumber = reader.GetInt32(reader.GetOrdinal("box_number"))
          SerialNumber = getOption reader "serial_number" reader.GetString
          Combo = reader.GetString(reader.GetOrdinal("combo"))
          Style = reader.GetString(reader.GetOrdinal("style")) |> LockBoxStyle.fromStorageValue
          Status = reader.GetString(reader.GetOrdinal("status")) |> LockBoxStatus.fromStorageValue
          Notes = getOption reader "notes" reader.GetString
          CurrentVehicleId = getOption reader "current_vehicle_id" reader.GetGuid
          CurrentVehicleVin = getOption reader "current_vehicle_vin" reader.GetString
          CurrentVehicleLabel = getOption reader "current_vehicle_label" reader.GetString
          AssignedAt = getOption reader "assigned_at" reader.GetFieldValue<DateTimeOffset>
          CreatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("created_at"))
          UpdatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("updated_at")) }

    let selectColumns =
        """
        lb.id, lb.box_number, lb.serial_number, lb.combo, lb.style, lb.status, lb.notes,
        current_assignment.vehicle_id as current_vehicle_id,
        v.vin as current_vehicle_vin,
        concat_ws(' ', v.year::text, v.make, v.model, v.trim) as current_vehicle_label,
        current_assignment.assigned_at,
        lb.created_at, lb.updated_at
        """

    let fromClause =
        """
        from kwestkarzbusinessdata.lock_boxes lb
        left join lateral (
            select vehicle_id, assigned_at
            from kwestkarzbusinessdata.lock_box_assignments lba
            where lba.lock_box_id = lb.id and lba.unassigned_at is null
            order by lba.assigned_at desc
            limit 1
        ) current_assignment on true
        left join kwestkarzbusinessdata.vehicles v on v.id = current_assignment.vehicle_id
        """

    let addLockBoxFields (command: NpgsqlCommand) (serialNumber: string option) (combo: string) style status (notes: string option) =
        command.Parameters.AddWithValue("serial_number", NpgsqlDbType.Text, optionOrDbNull serialNumber) |> ignore
        command.Parameters.AddWithValue("combo", NpgsqlDbType.Text, combo.Trim()) |> ignore
        command.Parameters.AddWithValue("style", NpgsqlDbType.Text, LockBoxStyle.toStorageValue style) |> ignore
        command.Parameters.AddWithValue("status", NpgsqlDbType.Text, LockBoxStatus.toStorageValue status) |> ignore
        command.Parameters.AddWithValue("notes", NpgsqlDbType.Text, optionOrDbNull notes) |> ignore

    interface ILockBoxRepository with
        member _.ListAsync(cancellationToken: CancellationToken) : Task<LockBox list> =
            task {
                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                use command =
                    new NpgsqlCommand(
                        $"select {selectColumns} {fromClause} order by lb.box_number",
                        connection
                    )

                use! reader = command.ExecuteReaderAsync(cancellationToken)
                let lockBoxes = ResizeArray<LockBox>()
                let mutable keepReading = true

                while keepReading do
                    let! hasRow = reader.ReadAsync(cancellationToken)
                    if hasRow then lockBoxes.Add(mapLockBox reader) else keepReading <- false

                return List.ofSeq lockBoxes
            }

        member _.FindCurrentForVehicleAsync(vehicleId: Guid, cancellationToken: CancellationToken) : Task<LockBox option> =
            task {
                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                use command =
                    new NpgsqlCommand(
                        $"""
                        select {selectColumns}
                        {fromClause}
                        where current_assignment.vehicle_id = @vehicle_id
                        limit 1
                        """,
                        connection
                    )

                command.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, vehicleId) |> ignore
                use! reader = command.ExecuteReaderAsync(cancellationToken)
                let! hasRow = reader.ReadAsync(cancellationToken)
                return if hasRow then Some(mapLockBox reader) else None
            }

        member _.CreateAsync(lockBox: NewLockBox, cancellationToken: CancellationToken) : Task<LockBox> =
            task {
                let id = Guid.NewGuid()
                let now = DateTimeOffset.UtcNow

                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                use command =
                    new NpgsqlCommand(
                        $"""
                        insert into kwestkarzbusinessdata.lock_boxes (
                            id, box_number, serial_number, combo, style, status, notes, created_at, updated_at
                        )
                        values (
                            @id, @box_number, @serial_number, @combo, @style, @status, @notes, @created_at, @updated_at
                        )
                        returning id
                        """,
                        connection
                    )

                command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, id) |> ignore
                command.Parameters.AddWithValue("box_number", NpgsqlDbType.Integer, lockBox.BoxNumber) |> ignore
                addLockBoxFields command lockBox.SerialNumber lockBox.Combo lockBox.Style lockBox.Status lockBox.Notes
                command.Parameters.AddWithValue("created_at", NpgsqlDbType.TimestampTz, now) |> ignore
                command.Parameters.AddWithValue("updated_at", NpgsqlDbType.TimestampTz, now) |> ignore

                let! _ = command.ExecuteScalarAsync(cancellationToken)
                let! lockBoxes = (this :> ILockBoxRepository).ListAsync(cancellationToken)
                return lockBoxes |> List.find (fun item -> item.Id = id)
            }

        member _.UpdateAsync(lockBoxId: Guid, lockBox: UpdateLockBox, cancellationToken: CancellationToken) : Task<LockBox option> =
            task {
                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                use command =
                    new NpgsqlCommand(
                        """
                        update kwestkarzbusinessdata.lock_boxes
                        set serial_number = @serial_number,
                            combo = @combo,
                            style = @style,
                            status = @status,
                            notes = @notes,
                            updated_at = @updated_at
                        where id = @id
                        """,
                        connection
                    )

                command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, lockBoxId) |> ignore
                addLockBoxFields command lockBox.SerialNumber lockBox.Combo lockBox.Style lockBox.Status lockBox.Notes
                command.Parameters.AddWithValue("updated_at", NpgsqlDbType.TimestampTz, DateTimeOffset.UtcNow) |> ignore
                let! rows = command.ExecuteNonQueryAsync(cancellationToken)

                if rows = 0 then
                    return None
                else
                    let! lockBoxes = (this :> ILockBoxRepository).ListAsync(cancellationToken)
                    return lockBoxes |> List.tryFind (fun item -> item.Id = lockBoxId)
            }

        member _.AssignToVehicleAsync(assignment: NewLockBoxAssignment, cancellationToken: CancellationToken) : Task<LockBox option> =
            task {
                let now = DateTimeOffset.UtcNow

                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                use! transaction = connection.BeginTransactionAsync(cancellationToken)

                use closeVehicleCommand =
                    new NpgsqlCommand(
                        """
                        update kwestkarzbusinessdata.lock_box_assignments
                        set unassigned_at = @now
                        where vehicle_id = @vehicle_id and unassigned_at is null
                        """,
                        connection,
                        transaction
                    )

                closeVehicleCommand.Parameters.AddWithValue("now", NpgsqlDbType.TimestampTz, now) |> ignore
                closeVehicleCommand.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, assignment.VehicleId) |> ignore
                let! _ = closeVehicleCommand.ExecuteNonQueryAsync(cancellationToken)

                use closeBoxCommand =
                    new NpgsqlCommand(
                        """
                        update kwestkarzbusinessdata.lock_box_assignments
                        set unassigned_at = @now
                        where lock_box_id = @lock_box_id and unassigned_at is null
                        """,
                        connection,
                        transaction
                    )

                closeBoxCommand.Parameters.AddWithValue("now", NpgsqlDbType.TimestampTz, now) |> ignore
                closeBoxCommand.Parameters.AddWithValue("lock_box_id", NpgsqlDbType.Uuid, assignment.LockBoxId) |> ignore
                let! _ = closeBoxCommand.ExecuteNonQueryAsync(cancellationToken)

                use insertCommand =
                    new NpgsqlCommand(
                        """
                        insert into kwestkarzbusinessdata.lock_box_assignments (
                            id, lock_box_id, vehicle_id, assigned_at, notes
                        )
                        values (@id, @lock_box_id, @vehicle_id, @assigned_at, @notes)
                        """,
                        connection,
                        transaction
                    )

                insertCommand.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, Guid.NewGuid()) |> ignore
                insertCommand.Parameters.AddWithValue("lock_box_id", NpgsqlDbType.Uuid, assignment.LockBoxId) |> ignore
                insertCommand.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, assignment.VehicleId) |> ignore
                insertCommand.Parameters.AddWithValue("assigned_at", NpgsqlDbType.TimestampTz, now) |> ignore
                insertCommand.Parameters.AddWithValue("notes", NpgsqlDbType.Text, optionOrDbNull assignment.Notes) |> ignore
                let! _ = insertCommand.ExecuteNonQueryAsync(cancellationToken)

                use updateCommand =
                    new NpgsqlCommand(
                        """
                        update kwestkarzbusinessdata.lock_boxes
                        set status = 'Assigned', updated_at = @now
                        where id = @lock_box_id
                        """,
                        connection,
                        transaction
                    )

                updateCommand.Parameters.AddWithValue("now", NpgsqlDbType.TimestampTz, now) |> ignore
                updateCommand.Parameters.AddWithValue("lock_box_id", NpgsqlDbType.Uuid, assignment.LockBoxId) |> ignore
                let! _ = updateCommand.ExecuteNonQueryAsync(cancellationToken)

                do! transaction.CommitAsync(cancellationToken)

                let! lockBoxes = (this :> ILockBoxRepository).ListAsync(cancellationToken)
                return lockBoxes |> List.tryFind (fun item -> item.Id = assignment.LockBoxId)
            }

        member _.UnassignAsync(lockBoxId: Guid, notes: string option, cancellationToken: CancellationToken) : Task<LockBox option> =
            task {
                let now = DateTimeOffset.UtcNow

                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                use! transaction = connection.BeginTransactionAsync(cancellationToken)
                use closeCommand =
                    new NpgsqlCommand(
                        """
                        update kwestkarzbusinessdata.lock_box_assignments
                        set unassigned_at = @now,
                            notes = coalesce(@notes, notes)
                        where lock_box_id = @lock_box_id and unassigned_at is null
                        """,
                        connection,
                        transaction
                    )

                closeCommand.Parameters.AddWithValue("now", NpgsqlDbType.TimestampTz, now) |> ignore
                closeCommand.Parameters.AddWithValue("notes", NpgsqlDbType.Text, optionOrDbNull notes) |> ignore
                closeCommand.Parameters.AddWithValue("lock_box_id", NpgsqlDbType.Uuid, lockBoxId) |> ignore
                let! _ = closeCommand.ExecuteNonQueryAsync(cancellationToken)

                use updateCommand =
                    new NpgsqlCommand(
                        """
                        update kwestkarzbusinessdata.lock_boxes
                        set status = 'Available', updated_at = @now
                        where id = @lock_box_id
                        """,
                        connection,
                        transaction
                    )

                updateCommand.Parameters.AddWithValue("now", NpgsqlDbType.TimestampTz, now) |> ignore
                updateCommand.Parameters.AddWithValue("lock_box_id", NpgsqlDbType.Uuid, lockBoxId) |> ignore
                let! rows = updateCommand.ExecuteNonQueryAsync(cancellationToken)
                do! transaction.CommitAsync(cancellationToken)

                if rows = 0 then
                    return None
                else
                    let! lockBoxes = (this :> ILockBoxRepository).ListAsync(cancellationToken)
                    return lockBoxes |> List.tryFind (fun item -> item.Id = lockBoxId)
            }
