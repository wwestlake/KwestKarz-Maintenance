namespace KwestKarz.Infrastructure

open System
open System.Threading
open System.Threading.Tasks
open KwestKarz.Domain
open Npgsql
open NpgsqlTypes

type PostgresVehiclePhotoRepository(dataSource: NpgsqlDataSource) =
    let mapPhoto (reader: NpgsqlDataReader) =
        { Id = reader.GetGuid(reader.GetOrdinal("id"))
          VehicleId = reader.GetGuid(reader.GetOrdinal("vehicle_id"))
          ContentType = reader.GetString(reader.GetOrdinal("content_type"))
          OriginalFileName = reader.GetString(reader.GetOrdinal("original_file_name"))
          SizeBytes = reader.GetInt64(reader.GetOrdinal("size_bytes"))
          IsPrimary = reader.GetBoolean(reader.GetOrdinal("is_primary"))
          DisplayOrder = reader.GetInt32(reader.GetOrdinal("display_order"))
          CreatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("created_at"))
          CreatedBy =
            let ordinal = reader.GetOrdinal("created_by")
            if reader.IsDBNull(ordinal) then None else Some(reader.GetString(ordinal)) }

    interface IVehiclePhotoRepository with
        member _.ListByVehicleAsync(vehicleId: Guid, cancellationToken: CancellationToken) : Task<VehiclePhoto list> =
            task {
                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                use command =
                    new NpgsqlCommand(
                        """
                        select id, vehicle_id, content_type, original_file_name, size_bytes, is_primary, display_order, created_at, created_by
                        from kwestkarzbusinessdata.vehicle_photos
                        where vehicle_id = @vehicle_id
                        order by display_order asc, created_at asc
                        """,
                        connection
                    )

                command.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, vehicleId) |> ignore
                use! reader = command.ExecuteReaderAsync(cancellationToken)
                let photos = ResizeArray<VehiclePhoto>()

                while reader.Read() do
                    photos.Add(mapPhoto reader)

                return List.ofSeq photos
            }

        member _.GetPrimaryAsync(vehicleId: Guid, cancellationToken: CancellationToken) : Task<VehiclePhoto option> =
            task {
                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                use command =
                    new NpgsqlCommand(
                        """
                        select id, vehicle_id, content_type, original_file_name, size_bytes, is_primary, display_order, created_at, created_by
                        from kwestkarzbusinessdata.vehicle_photos
                        where vehicle_id = @vehicle_id and is_primary = true
                        limit 1
                        """,
                        connection
                    )

                command.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, vehicleId) |> ignore
                use! reader = command.ExecuteReaderAsync(cancellationToken)

                if reader.Read() then
                    return Some(mapPhoto reader)
                else
                    return None
            }

        member _.AddPhotoAsync(vehicleId: Guid, photo: VehiclePhoto, blob: byte array, cancellationToken: CancellationToken) : Task<VehiclePhoto> =
            task {
                let id = Guid.NewGuid()
                let now = DateTimeOffset.UtcNow

                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                use command =
                    new NpgsqlCommand(
                        """
                        insert into kwestkarzbusinessdata.vehicle_photos
                            (id, vehicle_id, photo_blob, content_type, original_file_name, size_bytes, is_primary, display_order, created_at, created_by)
                        values
                            (@id, @vehicle_id, @photo_blob, @content_type, @original_file_name, @size_bytes, @is_primary, @display_order, @created_at, @created_by)
                        """,
                        connection
                    )

                command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, id) |> ignore
                command.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, vehicleId) |> ignore
                command.Parameters.AddWithValue("photo_blob", NpgsqlDbType.Bytea, blob) |> ignore
                command.Parameters.AddWithValue("content_type", NpgsqlDbType.Text, photo.ContentType) |> ignore
                command.Parameters.AddWithValue("original_file_name", NpgsqlDbType.Text, photo.OriginalFileName) |> ignore
                command.Parameters.AddWithValue("size_bytes", NpgsqlDbType.Bigint, blob.Length) |> ignore
                command.Parameters.AddWithValue("is_primary", NpgsqlDbType.Boolean, photo.IsPrimary) |> ignore
                command.Parameters.AddWithValue("display_order", NpgsqlDbType.Integer, photo.DisplayOrder) |> ignore
                command.Parameters.AddWithValue("created_at", NpgsqlDbType.TimestampTz, now) |> ignore
                command.Parameters.AddWithValue("created_by", NpgsqlDbType.Text, photo.CreatedBy |> Option.toObj) |> ignore

                let! _ = command.ExecuteNonQueryAsync(cancellationToken)

                return { Id = id
                         VehicleId = vehicleId
                         ContentType = photo.ContentType
                         OriginalFileName = photo.OriginalFileName
                         SizeBytes = int64 blob.Length
                         IsPrimary = photo.IsPrimary
                         DisplayOrder = photo.DisplayOrder
                         CreatedAt = now
                         CreatedBy = photo.CreatedBy }
            }

        member _.GetPhotoContentAsync(photoId: Guid, vehicleId: Guid, cancellationToken: CancellationToken) : Task<byte array option> =
            task {
                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                use command =
                    new NpgsqlCommand(
                        """
                        select photo_blob
                        from kwestkarzbusinessdata.vehicle_photos
                        where id = @id and vehicle_id = @vehicle_id
                        limit 1
                        """,
                        connection
                    )

                command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, photoId) |> ignore
                command.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, vehicleId) |> ignore
                use! reader = command.ExecuteReaderAsync(cancellationToken)

                if reader.Read() then
                    let ordinal = reader.GetOrdinal("photo_blob")
                    if reader.IsDBNull(ordinal) then
                        return None
                    else
                        return Some(reader.GetFieldValue<byte array>(ordinal))
                else
                    return None
            }

        member _.SetPrimaryAsync(photoId: Guid, vehicleId: Guid, cancellationToken: CancellationToken) : Task<unit> =
            task {
                use! connection = dataSource.OpenConnectionAsync(cancellationToken)

                // First, clear any existing primary for this vehicle
                use clearCommand =
                    new NpgsqlCommand(
                        """
                        update kwestkarzbusinessdata.vehicle_photos
                        set is_primary = false
                        where vehicle_id = @vehicle_id
                        """,
                        connection
                    )
                clearCommand.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, vehicleId) |> ignore
                let! _ = clearCommand.ExecuteNonQueryAsync(cancellationToken)

                // Then set the new primary
                use setCommand =
                    new NpgsqlCommand(
                        """
                        update kwestkarzbusinessdata.vehicle_photos
                        set is_primary = true
                        where id = @id and vehicle_id = @vehicle_id
                        """,
                        connection
                    )
                setCommand.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, photoId) |> ignore
                setCommand.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, vehicleId) |> ignore
                let! _ = setCommand.ExecuteNonQueryAsync(cancellationToken)

                return ()
            }
