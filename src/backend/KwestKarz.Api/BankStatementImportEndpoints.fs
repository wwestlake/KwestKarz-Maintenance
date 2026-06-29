namespace KwestKarz.Api

open System
open System.Collections.Generic
open System.Globalization
open System.IO
open System.Text.Json
open System.Threading.Tasks
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Microsoft.VisualBasic.FileIO
open Npgsql
open NpgsqlTypes

module BankStatementImportEndpoints =
    let private optionOrDbNull value =
        match value with
        | Some value -> box value
        | None -> box DBNull.Value

    let private textOrNone (value: string) =
        if String.IsNullOrWhiteSpace(value) then None else Some(value.Trim())

    let private isAdmin (httpContext: HttpContext) =
        httpContext.Request.Headers["X-Role"].ToString() = "admin"

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

    let private toRecord (reader: NpgsqlDataReader) =
        let ordinal name = reader.GetOrdinal(name)
        { Id = reader.GetGuid(ordinal "id")
          StatementYear = reader.GetInt32(ordinal "statement_year")
          BankName = reader.GetString(ordinal "bank_name")
          AccountNumber = reader.GetString(ordinal "account_number")
          AccountNickname =
              let idx = ordinal "account_nickname"
              if reader.IsDBNull(idx) then None else Some(reader.GetString(idx))
          OriginalFileName = reader.GetString(ordinal "original_file_name")
          ImportedAt = reader.GetFieldValue<DateTimeOffset>(ordinal "imported_at")
          RowCount = reader.GetInt32(ordinal "row_count")
          StoredRowCount = reader.GetInt32(ordinal "stored_row_count")
          Notes =
              let idx = ordinal "notes"
              if reader.IsDBNull(idx) then None else Some(reader.GetString(idx))
          CreatedBy =
              let idx = ordinal "created_by"
              if reader.IsDBNull(idx) then None else Some(reader.GetString(idx)) }

    let mapBankStatementImportEndpoints (app: WebApplication) =
        let group = app.MapGroup("/api/imports/bank-statements")

        group.MapPost(
            "/",
            Func<NpgsqlDataSource, HttpContext, Task<IResult>>(fun dataSource httpContext ->
                task {
                    if not (isAdmin httpContext) then
                        return Results.StatusCode(StatusCodes.Status403Forbidden)
                    else
                        let! form = httpContext.Request.ReadFormAsync(httpContext.RequestAborted)
                        let file = form.Files.GetFile("file")
                        let bankName = form["bankName"].ToString() |> textOrNone
                        let accountNumber = form["accountNumber"].ToString() |> textOrNone
                        let accountNickname = form["accountNickname"].ToString() |> textOrNone
                        let statementYear =
                            match form["statementYear"].ToString() |> textOrNone with
                            | None -> DateTimeOffset.UtcNow.Year
                            | Some value ->
                                let mutable parsed = 0
                                if Int32.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, &parsed) then parsed
                                else DateTimeOffset.UtcNow.Year
                        let notes = form["notes"].ToString() |> textOrNone

                        if isNull file || file.Length = 0L then
                            return Results.BadRequest("A multipart form file named 'file' is required.")
                        elif bankName.IsNone then
                            return Results.BadRequest("Bank name is required.")
                        elif accountNumber.IsNone then
                            return Results.BadRequest("Account number is required.")
                        else
                            use memory = new MemoryStream()
                            use stream = file.OpenReadStream()
                            do! stream.CopyToAsync(memory, httpContext.RequestAborted)

                            let rows = readCsvRows(memory.ToArray())
                            let importId = Guid.NewGuid()
                            let now = DateTimeOffset.UtcNow
                            let creator = httpContext.Request.Headers["X-Operator"].ToString()
                            let bankName = bankName.Value
                            let accountNumber = accountNumber.Value
                            let storedRowCount = rows.Length

                            use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                            use transaction = connection.BeginTransaction()
                            try
                                use createImportCommand =
                                    new NpgsqlCommand(
                                        """
                                        insert into kwestkarzbusinessdata.bank_statement_imports (
                                            id, statement_year, bank_name, account_number, account_nickname,
                                            original_file_name, imported_at, row_count, stored_row_count,
                                            notes, created_by
                                        )
                                        values (
                                            @id, @statement_year, @bank_name, @account_number, @account_nickname,
                                            @original_file_name, @imported_at, @row_count, @stored_row_count,
                                            @notes, @created_by
                                        )
                                        """,
                                        connection,
                                        transaction
                                    )
                                createImportCommand.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, importId) |> ignore
                                createImportCommand.Parameters.AddWithValue("statement_year", NpgsqlDbType.Integer, statementYear) |> ignore
                                createImportCommand.Parameters.AddWithValue("bank_name", NpgsqlDbType.Text, bankName) |> ignore
                                createImportCommand.Parameters.AddWithValue("account_number", NpgsqlDbType.Text, accountNumber) |> ignore
                                createImportCommand.Parameters.AddWithValue("account_nickname", NpgsqlDbType.Text, optionOrDbNull accountNickname) |> ignore
                                createImportCommand.Parameters.AddWithValue("original_file_name", NpgsqlDbType.Text, file.FileName) |> ignore
                                createImportCommand.Parameters.AddWithValue("imported_at", NpgsqlDbType.TimestampTz, now) |> ignore
                                createImportCommand.Parameters.AddWithValue("row_count", NpgsqlDbType.Integer, rows.Length) |> ignore
                                createImportCommand.Parameters.AddWithValue("stored_row_count", NpgsqlDbType.Integer, storedRowCount) |> ignore
                                createImportCommand.Parameters.AddWithValue("notes", NpgsqlDbType.Text, optionOrDbNull notes) |> ignore
                                createImportCommand.Parameters.AddWithValue("created_by", NpgsqlDbType.Text, creator) |> ignore
                                let! _ = createImportCommand.ExecuteNonQueryAsync(httpContext.RequestAborted)

                                for index, row in rows |> Array.indexed do
                                    use insertRowCommand =
                                        new NpgsqlCommand(
                                            """
                                            insert into kwestkarzbusinessdata.bank_statement_import_rows (
                                                id, import_id, row_index, raw_data, created_at
                                            )
                                            values (
                                                @id, @import_id, @row_index, @raw_data::jsonb, @created_at
                                            )
                                            """,
                                            connection,
                                            transaction
                                        )
                                    insertRowCommand.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, Guid.NewGuid()) |> ignore
                                    insertRowCommand.Parameters.AddWithValue("import_id", NpgsqlDbType.Uuid, importId) |> ignore
                                    insertRowCommand.Parameters.AddWithValue("row_index", NpgsqlDbType.Integer, index + 1) |> ignore
                                    insertRowCommand.Parameters.AddWithValue("raw_data", NpgsqlDbType.Text, JsonSerializer.Serialize(row)) |> ignore
                                    insertRowCommand.Parameters.AddWithValue("created_at", NpgsqlDbType.TimestampTz, now) |> ignore
                                    let! _ = insertRowCommand.ExecuteNonQueryAsync(httpContext.RequestAborted)
                                    ()

                                do! transaction.CommitAsync(httpContext.RequestAborted)

                                return
                                    Results.Ok(
                                        { Id = importId
                                          StatementYear = statementYear
                                          BankName = bankName
                                          AccountNumber = accountNumber
                                          AccountNickname = accountNickname
                                          OriginalFileName = file.FileName
                                          ImportedAt = now
                                          RowCount = rows.Length
                                          StoredRowCount = storedRowCount
                                          Notes = notes
                                          CreatedBy = Some creator })
                            with ex ->
                                do! transaction.RollbackAsync(httpContext.RequestAborted)
                                return Results.Problem($"Bank statement import failed: {ex.Message}")
                })
        )
        |> ignore

        group.MapGet(
            "/",
            Func<NpgsqlDataSource, HttpContext, Task<IResult>>(fun dataSource httpContext ->
                task {
                    if not (isAdmin httpContext) then
                        return Results.StatusCode(StatusCodes.Status403Forbidden)
                    else
                        use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                        use command =
                            new NpgsqlCommand(
                                """
                                select id, statement_year, bank_name, account_number, account_nickname,
                                       original_file_name, imported_at, row_count, stored_row_count,
                                       notes, created_by
                                from kwestkarzbusinessdata.bank_statement_imports
                                order by imported_at desc
                                limit 50
                                """,
                                connection
                            )
                        use! reader = command.ExecuteReaderAsync(httpContext.RequestAborted)
                        let results = ResizeArray<BankStatementImportRecord>()
                        while! reader.ReadAsync(httpContext.RequestAborted) do
                            results.Add(toRecord reader)
                        return Results.Ok(results.ToArray())
                })
        )
        |> ignore

        app
