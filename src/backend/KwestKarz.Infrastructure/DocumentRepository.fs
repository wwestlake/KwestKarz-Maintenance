namespace KwestKarz.Infrastructure

open System
open System.Threading
open System.Threading.Tasks
open KwestKarz.Domain
open Npgsql
open NpgsqlTypes

type PostgresDocumentRepository(dataSource: NpgsqlDataSource) =
    let optionOrDbNull value =
        match value with
        | Some x -> box x
        | None -> box DBNull.Value

    let getOption (reader: NpgsqlDataReader) name getter =
        let ordinal = reader.GetOrdinal(name)
        if reader.IsDBNull(ordinal) then None else Some(getter ordinal)

    let mapDocument (reader: NpgsqlDataReader) =
        { Id = reader.GetGuid(reader.GetOrdinal("id"))
          OwnerType = reader.GetString(reader.GetOrdinal("owner_type")) |> DocumentOwnerType.fromStorageValue
          OwnerId = reader.GetGuid(reader.GetOrdinal("owner_id"))
          Kind = reader.GetString(reader.GetOrdinal("kind")) |> DocumentKind.fromStorageValue
          OriginalFileName = reader.GetString(reader.GetOrdinal("original_file_name"))
          ContentType = reader.GetString(reader.GetOrdinal("content_type"))
          StoragePath = reader.GetString(reader.GetOrdinal("storage_path"))
          SizeBytes = reader.GetInt64(reader.GetOrdinal("size_bytes"))
          Description = getOption reader "description" reader.GetString
          CreatedBy = getOption reader "created_by" reader.GetString
          CreatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("created_at")) }

    let selectColumns =
        """
        id, owner_type, owner_id, kind, original_file_name, content_type,
        storage_path, size_bytes, description, created_by, created_at
        """

    let contentColumns =
        """
        id, owner_type, owner_id, kind, original_file_name, content_type,
        storage_path, size_bytes, description, created_by, created_at, content_bytes
        """

    interface IDocumentRepository with
        member _.CreateAsync(document: NewStoredDocument, cancellationToken: CancellationToken) : Task<StoredDocument> =
            task {
                let id = Guid.NewGuid()
                let now = DateTimeOffset.UtcNow

                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                use command =
                    new NpgsqlCommand(
                        $"""
                        insert into kwestkarzbusinessdata.documents (
                            id, owner_type, owner_id, kind, original_file_name, content_type,
                            storage_path, size_bytes, content_bytes, description, created_by, created_at
                        )
                        values (
                            @id, @owner_type, @owner_id, @kind, @original_file_name, @content_type,
                            @storage_path, @size_bytes, @content_bytes, @description, @created_by, @created_at
                        )
                        returning {selectColumns}
                        """,
                        connection
                    )

                command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, id) |> ignore
                command.Parameters.AddWithValue("owner_type", NpgsqlDbType.Text, DocumentOwnerType.toStorageValue document.OwnerType) |> ignore
                command.Parameters.AddWithValue("owner_id", NpgsqlDbType.Uuid, document.OwnerId) |> ignore
                command.Parameters.AddWithValue("kind", NpgsqlDbType.Text, DocumentKind.toStorageValue document.Kind) |> ignore
                command.Parameters.AddWithValue("original_file_name", NpgsqlDbType.Text, document.OriginalFileName) |> ignore
                command.Parameters.AddWithValue("content_type", NpgsqlDbType.Text, document.ContentType) |> ignore
                command.Parameters.AddWithValue("storage_path", NpgsqlDbType.Text, document.StoragePath) |> ignore
                command.Parameters.AddWithValue("size_bytes", NpgsqlDbType.Bigint, document.SizeBytes) |> ignore
                command.Parameters.AddWithValue("content_bytes", NpgsqlDbType.Bytea, optionOrDbNull document.ContentBytes) |> ignore
                command.Parameters.AddWithValue("description", NpgsqlDbType.Text, optionOrDbNull document.Description) |> ignore
                command.Parameters.AddWithValue("created_by", NpgsqlDbType.Text, optionOrDbNull document.CreatedBy) |> ignore
                command.Parameters.AddWithValue("created_at", NpgsqlDbType.TimestampTz, now) |> ignore

                use! reader = command.ExecuteReaderAsync(cancellationToken)
                let! hasRow = reader.ReadAsync(cancellationToken)

                if not hasRow then
                    return failwith "Document insert did not return a row."
                else
                    return mapDocument reader
            }

        member _.FindAsync(id: Guid, cancellationToken: CancellationToken) : Task<StoredDocument option> =
            task {
                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                use command =
                    new NpgsqlCommand(
                        $"select {selectColumns} from kwestkarzbusinessdata.documents where id = @id",
                        connection
                    )

                command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, id) |> ignore
                use! reader = command.ExecuteReaderAsync(cancellationToken)
                let! hasRow = reader.ReadAsync(cancellationToken)
                return if hasRow then Some(mapDocument reader) else None
            }

        member _.FindContentAsync(id: Guid, cancellationToken: CancellationToken) : Task<StoredDocumentContent option> =
            task {
                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                use command =
                    new NpgsqlCommand(
                        $"select {contentColumns} from kwestkarzbusinessdata.documents where id = @id",
                        connection
                    )

                command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, id) |> ignore
                use! reader = command.ExecuteReaderAsync(cancellationToken)
                let! hasRow = reader.ReadAsync(cancellationToken)

                if not hasRow then
                    return None
                else
                    let contentOrdinal = reader.GetOrdinal("content_bytes")
                    let contentBytes =
                        if reader.IsDBNull(contentOrdinal) then
                            None
                        else
                            Some(reader.GetFieldValue<byte array>(contentOrdinal))

                    return Some { Document = mapDocument reader; ContentBytes = contentBytes }
            }

        member _.ListForOwnerAsync(ownerType: DocumentOwnerType, ownerId: Guid, cancellationToken: CancellationToken) : Task<StoredDocument list> =
            task {
                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                use command =
                    new NpgsqlCommand(
                        $"select {selectColumns} from kwestkarzbusinessdata.documents where owner_type = @owner_type and owner_id = @owner_id order by created_at desc",
                        connection
                    )

                command.Parameters.AddWithValue("owner_type", NpgsqlDbType.Text, DocumentOwnerType.toStorageValue ownerType) |> ignore
                command.Parameters.AddWithValue("owner_id", NpgsqlDbType.Uuid, ownerId) |> ignore
                use! reader = command.ExecuteReaderAsync(cancellationToken)
                let documents = ResizeArray<StoredDocument>()
                let mutable keepReading = true

                while keepReading do
                    let! hasRow = reader.ReadAsync(cancellationToken)
                    if hasRow then documents.Add(mapDocument reader) else keepReading <- false

                return List.ofSeq documents
            }
