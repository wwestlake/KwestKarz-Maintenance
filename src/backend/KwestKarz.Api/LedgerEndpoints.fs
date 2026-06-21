namespace KwestKarz.Api

open System
open System.Threading.Tasks
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Npgsql
open NpgsqlTypes

module LedgerEndpoints =

    [<CLIMutable>]
    type Account =
        { Id: Guid
          Code: string
          Name: string
          AccountType: string }

    [<CLIMutable>]
    type LedgerEntry =
        { Id: Guid
          EntryDate: string
          Description: string
          AccountId: Guid
          AccountCode: string
          AccountName: string
          EntryType: string
          Amount: decimal
          VehicleId: Guid option
          JobId: Guid option
          Reference: string option
          PaymentStatus: string option
          PaidAt: DateTimeOffset option
          PaidBy: string option
          CreatedBy: string
          CreatedAt: DateTimeOffset }

    [<CLIMutable>]
    type CreateEntryRequest =
        { EntryDate: string
          Description: string
          AccountId: Guid
          EntryType: string
          Amount: decimal
          VehicleId: Guid option
          JobId: Guid option
          Reference: string option
          PaymentStatus: string option }

    [<CLIMutable>]
    type PnlLine =
        { AccountCode: string
          AccountName: string
          AccountType: string
          Total: decimal }

    [<CLIMutable>]
    type PnlReport =
        { PeriodStart: string
          PeriodEnd: string
          Income: PnlLine[]
          Expenses: PnlLine[]
          TotalIncome: decimal
          TotalExpenses: decimal
          NetIncome: decimal }

    let private readEntry (reader: NpgsqlDataReader) =
        { Id = reader.GetGuid(0)
          EntryDate = reader.GetFieldValue<DateOnly>(1).ToString("yyyy-MM-dd")
          Description = reader.GetString(2)
          AccountId = reader.GetGuid(3)
          AccountCode = reader.GetString(4)
          AccountName = reader.GetString(5)
          EntryType = reader.GetString(6)
          Amount = reader.GetDecimal(7)
          VehicleId = if reader.IsDBNull(8) then None else Some(reader.GetGuid(8))
          JobId = if reader.IsDBNull(9) then None else Some(reader.GetGuid(9))
          Reference = if reader.IsDBNull(10) then None else Some(reader.GetString(10))
          PaymentStatus = if reader.IsDBNull(11) then None else Some(reader.GetString(11))
          PaidAt = if reader.IsDBNull(12) then None else Some(reader.GetFieldValue<DateTimeOffset>(12))
          PaidBy = if reader.IsDBNull(13) then None else Some(reader.GetString(13))
          CreatedBy = reader.GetString(14)
          CreatedAt = reader.GetFieldValue<DateTimeOffset>(15) }

    let private entrySelect =
        """
        select e.id, e.entry_date, e.description, e.account_id,
               a.code, a.name, e.entry_type, e.amount,
               e.vehicle_id, e.job_id, e.reference,
               e.payment_status, e.paid_at, e.paid_by,
               e.created_by, e.created_at
        from kwestkarzbusinessdata.ledger_entries e
        join kwestkarzbusinessdata.accounts a on a.id = e.account_id
        """

    let internal createEntryAsync
        (connection: NpgsqlConnection)
        (entryDate: DateOnly)
        (description: string)
        (accountId: Guid)
        (entryType: string)
        (amount: decimal)
        (vehicleId: Guid option)
        (jobId: Guid option)
        (reference: string option)
        (paymentStatus: string option)
        (createdBy: string)
        (cancellationToken: Threading.CancellationToken) =
        task {
            use command =
                new NpgsqlCommand(
                    """
                    insert into kwestkarzbusinessdata.ledger_entries
                        (entry_date, description, account_id, entry_type, amount,
                         vehicle_id, job_id, reference, payment_status, created_by, created_at)
                    values (@date, @desc, @accountId, @type, @amount,
                            @vehicleId, @jobId, @ref, @paymentStatus, @createdBy, @now)
                    returning id
                    """,
                    connection
                )
            command.Parameters.AddWithValue("date", NpgsqlDbType.Date, entryDate) |> ignore
            command.Parameters.AddWithValue("desc", NpgsqlDbType.Text, description) |> ignore
            command.Parameters.AddWithValue("accountId", NpgsqlDbType.Uuid, accountId) |> ignore
            command.Parameters.AddWithValue("type", NpgsqlDbType.Text, entryType) |> ignore
            command.Parameters.AddWithValue("amount", NpgsqlDbType.Numeric, amount) |> ignore
            command.Parameters.AddWithValue("vehicleId", NpgsqlDbType.Uuid, vehicleId |> Option.map box |> Option.defaultValue (box DBNull.Value)) |> ignore
            command.Parameters.AddWithValue("jobId", NpgsqlDbType.Uuid, jobId |> Option.map box |> Option.defaultValue (box DBNull.Value)) |> ignore
            command.Parameters.AddWithValue("ref", NpgsqlDbType.Text, reference |> Option.map box |> Option.defaultValue (box DBNull.Value)) |> ignore
            command.Parameters.AddWithValue("paymentStatus", NpgsqlDbType.Text, paymentStatus |> Option.map box |> Option.defaultValue (box DBNull.Value)) |> ignore
            command.Parameters.AddWithValue("createdBy", NpgsqlDbType.Text, createdBy) |> ignore
            command.Parameters.AddWithValue("now", NpgsqlDbType.TimestampTz, DateTimeOffset.UtcNow) |> ignore
            let! _ = command.ExecuteNonQueryAsync(cancellationToken)
            return ()
        }

    let internal getLaborAccountId (connection: NpgsqlConnection) (cancellationToken: Threading.CancellationToken) =
        task {
            use cmd = new NpgsqlCommand("select id from kwestkarzbusinessdata.accounts where code = '5000'", connection)
            let! result = cmd.ExecuteScalarAsync(cancellationToken)
            return result :?> Guid
        }

    let mapLedgerEndpoints (app: WebApplication) =

        // GET /api/ledger/accounts
        app.MapGet(
            "/api/ledger/accounts",
            Func<NpgsqlDataSource, HttpContext, Task<IResult>>(fun dataSource httpContext ->
                task {
                    use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                    use cmd = new NpgsqlCommand(
                        "select id, code, name, account_type from kwestkarzbusinessdata.accounts order by code",
                        connection)
                    use! reader = cmd.ExecuteReaderAsync(httpContext.RequestAborted)
                    let results = ResizeArray<Account>()
                    while! reader.ReadAsync(httpContext.RequestAborted) do
                        results.Add({
                            Id = reader.GetGuid(0)
                            Code = reader.GetString(1)
                            Name = reader.GetString(2)
                            AccountType = reader.GetString(3) })
                    return Results.Ok(results.ToArray())
                })
        ) |> ignore

        // GET /api/ledger/entries?from=&to=&type=&accountId=
        app.MapGet(
            "/api/ledger/entries",
            Func<NpgsqlDataSource, HttpContext, Task<IResult>>(fun dataSource httpContext ->
                task {
                    let q = httpContext.Request.Query
                    let fromDate = q.["from"].ToString()
                    let toDate = q.["to"].ToString()
                    let entryType = q.["type"].ToString()
                    let accountId = q.["accountId"].ToString()

                    let filters = ResizeArray<string>()
                    if not (String.IsNullOrWhiteSpace(fromDate)) then filters.Add("e.entry_date >= @from")
                    if not (String.IsNullOrWhiteSpace(toDate)) then filters.Add("e.entry_date <= @to")
                    if not (String.IsNullOrWhiteSpace(entryType)) then filters.Add("e.entry_type = @type")
                    if not (String.IsNullOrWhiteSpace(accountId)) then filters.Add("e.account_id = @accountId")

                    let where = if filters.Count > 0 then "where " + String.Join(" and ", filters) else ""
                    use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                    use cmd = new NpgsqlCommand($"{entrySelect} {where} order by e.entry_date desc, e.created_at desc", connection)
                    if not (String.IsNullOrWhiteSpace(fromDate)) then cmd.Parameters.AddWithValue("from", NpgsqlDbType.Date, DateOnly.Parse(fromDate)) |> ignore
                    if not (String.IsNullOrWhiteSpace(toDate)) then cmd.Parameters.AddWithValue("to", NpgsqlDbType.Date, DateOnly.Parse(toDate)) |> ignore
                    if not (String.IsNullOrWhiteSpace(entryType)) then cmd.Parameters.AddWithValue("type", NpgsqlDbType.Text, entryType) |> ignore
                    if not (String.IsNullOrWhiteSpace(accountId)) then cmd.Parameters.AddWithValue("accountId", NpgsqlDbType.Uuid, Guid.Parse(accountId)) |> ignore

                    use! reader = cmd.ExecuteReaderAsync(httpContext.RequestAborted)
                    let results = ResizeArray<LedgerEntry>()
                    while! reader.ReadAsync(httpContext.RequestAborted) do
                        results.Add(readEntry reader)
                    return Results.Ok(results.ToArray())
                })
        ) |> ignore

        // POST /api/ledger/entries
        app.MapPost(
            "/api/ledger/entries",
            Func<CreateEntryRequest, NpgsqlDataSource, HttpContext, Task<IResult>>(fun request dataSource httpContext ->
                task {
                    let operator = let h = httpContext.Request.Headers["X-Operator"] in if h.Count = 0 then "unknown" else h.[0]
                    if String.IsNullOrWhiteSpace(request.Description) then
                        return Results.BadRequest("Description is required")
                    elif request.Amount <= 0m then
                        return Results.BadRequest("Amount must be greater than zero")
                    else
                        use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                        let entryDate =
                            if String.IsNullOrWhiteSpace(request.EntryDate) then DateOnly.FromDateTime(DateTime.UtcNow)
                            else DateOnly.Parse(request.EntryDate)
                        do! createEntryAsync connection entryDate request.Description request.AccountId
                                request.EntryType request.Amount request.VehicleId request.JobId
                                request.Reference request.PaymentStatus operator httpContext.RequestAborted

                        use cmd2 = new NpgsqlCommand($"{entrySelect} where e.created_by = @by order by e.created_at desc limit 1", connection)
                        cmd2.Parameters.AddWithValue("by", NpgsqlDbType.Text, operator) |> ignore
                        use! reader = cmd2.ExecuteReaderAsync(httpContext.RequestAborted)
                        let! _ = reader.ReadAsync(httpContext.RequestAborted)
                        return Results.Ok(readEntry reader)
                })
        ) |> ignore

        // GET /api/ledger/worker-earnings — labor entries with payment status
        app.MapGet(
            "/api/ledger/worker-earnings",
            Func<NpgsqlDataSource, HttpContext, Task<IResult>>(fun dataSource httpContext ->
                task {
                    use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                    use cmd = new NpgsqlCommand(
                        $"""
                        {entrySelect}
                        join kwestkarzbusinessdata.accounts a2 on a2.id = e.account_id and a2.code = '5000'
                        order by e.entry_date desc
                        """,
                        connection)
                    use! reader = cmd.ExecuteReaderAsync(httpContext.RequestAborted)
                    let results = ResizeArray<LedgerEntry>()
                    while! reader.ReadAsync(httpContext.RequestAborted) do
                        results.Add(readEntry reader)
                    return Results.Ok(results.ToArray())
                })
        ) |> ignore

        // POST /api/ledger/entries/{id}/mark-paid
        app.MapPost(
            "/api/ledger/entries/{entryId:guid}/mark-paid",
            Func<Guid, NpgsqlDataSource, HttpContext, Task<IResult>>(fun entryId dataSource httpContext ->
                task {
                    let operator = let h = httpContext.Request.Headers["X-Operator"] in if h.Count = 0 then "unknown" else h.[0]
                    use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                    use cmd = new NpgsqlCommand(
                        """
                        update kwestkarzbusinessdata.ledger_entries
                        set payment_status = 'paid', paid_at = @now, paid_by = @by
                        where id = @id and payment_status = 'unpaid'
                        """,
                        connection)
                    cmd.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, entryId) |> ignore
                    cmd.Parameters.AddWithValue("now", NpgsqlDbType.TimestampTz, DateTimeOffset.UtcNow) |> ignore
                    cmd.Parameters.AddWithValue("by", NpgsqlDbType.Text, operator) |> ignore
                    let! rows = cmd.ExecuteNonQueryAsync(httpContext.RequestAborted)
                    return if rows = 0 then Results.NotFound() else Results.Ok()
                })
        ) |> ignore

        // GET /api/ledger/pnl?from=&to=
        app.MapGet(
            "/api/ledger/pnl",
            Func<NpgsqlDataSource, HttpContext, Task<IResult>>(fun dataSource httpContext ->
                task {
                    let q = httpContext.Request.Query
                    let fromStr = q.["from"].ToString()
                    let toStr = q.["to"].ToString()
                    let now = DateTime.UtcNow
                    let fromDate = if String.IsNullOrWhiteSpace(fromStr) then DateOnly(now.Year, now.Month, 1) else DateOnly.Parse(fromStr)
                    let toDate = if String.IsNullOrWhiteSpace(toStr) then DateOnly.FromDateTime(now) else DateOnly.Parse(toStr)

                    use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                    use cmd = new NpgsqlCommand(
                        """
                        select a.code, a.name, a.account_type, coalesce(sum(e.amount), 0) as total
                        from kwestkarzbusinessdata.accounts a
                        left join kwestkarzbusinessdata.ledger_entries e
                            on e.account_id = a.id
                            and e.entry_date >= @from
                            and e.entry_date <= @to
                        where a.account_type in ('income', 'expense')
                        group by a.code, a.name, a.account_type
                        order by a.code
                        """,
                        connection)
                    cmd.Parameters.AddWithValue("from", NpgsqlDbType.Date, fromDate) |> ignore
                    cmd.Parameters.AddWithValue("to", NpgsqlDbType.Date, toDate) |> ignore
                    use! reader = cmd.ExecuteReaderAsync(httpContext.RequestAborted)
                    let lines = ResizeArray<PnlLine>()
                    while! reader.ReadAsync(httpContext.RequestAborted) do
                        lines.Add({
                            AccountCode = reader.GetString(0)
                            AccountName = reader.GetString(1)
                            AccountType = reader.GetString(2)
                            Total = reader.GetDecimal(3) })

                    let income = lines |> Seq.filter (fun l -> l.AccountType = "income") |> Seq.toArray
                    let expenses = lines |> Seq.filter (fun l -> l.AccountType = "expense") |> Seq.toArray
                    let totalIncome = income |> Array.sumBy (fun l -> l.Total)
                    let totalExpenses = expenses |> Array.sumBy (fun l -> l.Total)

                    return Results.Ok({
                        PeriodStart = fromDate.ToString("yyyy-MM-dd")
                        PeriodEnd = toDate.ToString("yyyy-MM-dd")
                        Income = income
                        Expenses = expenses
                        TotalIncome = totalIncome
                        TotalExpenses = totalExpenses
                        NetIncome = totalIncome - totalExpenses })
                })
        ) |> ignore

        app
