namespace KwestKarz.Api

open System
open System.Threading.Tasks
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Npgsql
open NpgsqlTypes

module JobEndpoints =

    [<CLIMutable>]
    type JobResponse =
        { Id: Guid
          Title: string
          Description: string option
          Amount: decimal
          Status: string
          CreatedBy: string
          ClaimedByName: string option
          ClaimedAt: DateTimeOffset option
          CompletedAt: DateTimeOffset option
          CreatedAt: DateTimeOffset }

    [<CLIMutable>]
    type CreateJobRequest =
        { Title: string
          Description: string option
          Amount: decimal }

    [<CLIMutable>]
    type CompleteJobRequest =
        { Notes: string option }

    let private readJob (reader: NpgsqlDataReader) =
        { Id = reader.GetGuid(0)
          Title = reader.GetString(1)
          Description = if reader.IsDBNull(2) then None else Some(reader.GetString(2))
          Amount = reader.GetDecimal(3)
          Status = reader.GetString(4)
          CreatedBy = reader.GetString(5)
          ClaimedByName = if reader.IsDBNull(6) then None else Some(reader.GetString(6))
          ClaimedAt = if reader.IsDBNull(7) then None else Some(reader.GetFieldValue<DateTimeOffset>(7))
          CompletedAt = if reader.IsDBNull(8) then None else Some(reader.GetFieldValue<DateTimeOffset>(8))
          CreatedAt = reader.GetFieldValue<DateTimeOffset>(9) }

    let private jobSelect =
        """
        select j.id, j.title, j.description, j.amount, j.status, j.created_by,
               coalesce(u.display_name, u.phone) as claimed_by_name,
               j.claimed_at, j.completed_at, j.created_at
        from kwestkarzbusinessdata.jobs j
        left join kwestkarzbusinessdata.users u on u.id = j.claimed_by_id
        """

    let mapJobEndpoints (notifConfig: NotificationService.NotificationConfig) (app: WebApplication) =
        let group = app.MapGroup("/api/jobs")

        // POST /api/jobs — admin/manager creates a job
        group.MapPost(
            "/",
            Func<CreateJobRequest, NpgsqlDataSource, HttpContext, Task<IResult>>(fun request dataSource httpContext ->
                task {
                    let operator = let h = httpContext.Request.Headers["X-Operator"] in if h.Count = 0 then "unknown" else h.[0]
                    if String.IsNullOrWhiteSpace(request.Title) then
                        return Results.BadRequest("Title is required")
                    else
                        use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                        use command =
                            new NpgsqlCommand(
                                """
                                insert into kwestkarzbusinessdata.jobs
                                    (title, description, amount, created_by, created_at, updated_at)
                                values (@title, @desc, @amount, @createdBy, @now, @now)
                                returning id, title, description, amount, status, created_by,
                                          null::text, null::timestamptz, null::timestamptz, created_at
                                """,
                                connection
                            )
                        command.Parameters.AddWithValue("title", NpgsqlDbType.Text, request.Title) |> ignore
                        command.Parameters.AddWithValue("desc", NpgsqlDbType.Text, request.Description |> Option.map box |> Option.defaultValue (box DBNull.Value)) |> ignore
                        command.Parameters.AddWithValue("amount", NpgsqlDbType.Numeric, request.Amount) |> ignore
                        command.Parameters.AddWithValue("createdBy", NpgsqlDbType.Text, operator) |> ignore
                        command.Parameters.AddWithValue("now", NpgsqlDbType.TimestampTz, DateTimeOffset.UtcNow) |> ignore
                        use! reader = command.ExecuteReaderAsync(httpContext.RequestAborted)
                        let! _ = reader.ReadAsync(httpContext.RequestAborted)
                        let job = readJob reader
                        // fire-and-forget: notify opted-in helpers and admin
                        NotificationService.notifyHelpersJobPosted notifConfig dataSource job.Id job.Title job.Description |> ignore
                        return Results.Ok(job)
                })
        ) |> ignore

        // GET /api/jobs — workers see open + their own; admins/managers see all
        group.MapGet(
            "/",
            Func<NpgsqlDataSource, HttpContext, Task<IResult>>(fun dataSource httpContext ->
                task {
                    let role = httpContext.Request.Headers["X-Role"].ToString()
                    let uid = let c = httpContext.User.FindFirst("user_id") in if isNull c then "" else c.Value
                    use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                    let sql =
                        if role = "admin" || role = "manager" then
                            $"{jobSelect} order by j.created_at desc"
                        else
                            $"""
                            {jobSelect}
                            where j.status = 'open'
                               or (j.claimed_by_id = (select id from kwestkarzbusinessdata.users where firebase_uid = @uid))
                            order by j.created_at desc
                            """
                    use command = new NpgsqlCommand(sql, connection)
                    if role <> "admin" && role <> "manager" then
                        command.Parameters.AddWithValue("uid", NpgsqlDbType.Text, uid) |> ignore
                    use! reader = command.ExecuteReaderAsync(httpContext.RequestAborted)
                    let results = ResizeArray<JobResponse>()
                    while! reader.ReadAsync(httpContext.RequestAborted) do
                        results.Add(readJob reader)
                    return Results.Ok(results.ToArray())
                })
        ) |> ignore

        // GET /api/jobs/{id}
        group.MapGet(
            "/{jobId:guid}",
            Func<Guid, NpgsqlDataSource, HttpContext, Task<IResult>>(fun jobId dataSource httpContext ->
                task {
                    use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                    use command = new NpgsqlCommand($"{jobSelect} where j.id = @id", connection)
                    command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, jobId) |> ignore
                    use! reader = command.ExecuteReaderAsync(httpContext.RequestAborted)
                    let! hasRow = reader.ReadAsync(httpContext.RequestAborted)
                    if not hasRow then return Results.NotFound()
                    else return Results.Ok(readJob reader)
                })
        ) |> ignore

        // POST /api/jobs/{id}/claim — first worker wins, atomic
        group.MapPost(
            "/{jobId:guid}/claim",
            Func<Guid, NpgsqlDataSource, HttpContext, Task<IResult>>(fun jobId dataSource httpContext ->
                task {
                    let uid = let c = httpContext.User.FindFirst("user_id") in if isNull c then "" else c.Value
                    if String.IsNullOrWhiteSpace(uid) then
                        return Results.Unauthorized()
                    else
                        use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                        use command =
                            new NpgsqlCommand(
                                """
                                update kwestkarzbusinessdata.jobs
                                set status = 'claimed',
                                    claimed_by_id = (select id from kwestkarzbusinessdata.users where firebase_uid = @uid),
                                    claimed_at = @now,
                                    updated_at = @now
                                where id = @id and status = 'open'
                                """,
                                connection
                            )
                        command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, jobId) |> ignore
                        command.Parameters.AddWithValue("uid", NpgsqlDbType.Text, uid) |> ignore
                        command.Parameters.AddWithValue("now", NpgsqlDbType.TimestampTz, DateTimeOffset.UtcNow) |> ignore
                        let! rows = command.ExecuteNonQueryAsync(httpContext.RequestAborted)
                        if rows = 0 then
                            return Results.Conflict("Job already claimed or not found")
                        else
                            use command2 = new NpgsqlCommand($"{jobSelect} where j.id = @id", connection)
                            command2.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, jobId) |> ignore
                            use! reader = command2.ExecuteReaderAsync(httpContext.RequestAborted)
                            let! _ = reader.ReadAsync(httpContext.RequestAborted)
                            let job = readJob reader
                            let claimedBy = job.ClaimedByName |> Option.defaultValue "Unknown"
                            NotificationService.notifyAdminJobClaimed notifConfig dataSource jobId job.Title claimedBy |> ignore
                            return Results.Ok(job)
                })
        ) |> ignore

        // POST /api/jobs/{id}/complete — marks job done and auto-creates labor ledger entry
        group.MapPost(
            "/{jobId:guid}/complete",
            Func<Guid, NpgsqlDataSource, HttpContext, Task<IResult>>(fun jobId dataSource httpContext ->
                task {
                    let operator = let h = httpContext.Request.Headers["X-Operator"] in if h.Count = 0 then "unknown" else h.[0]
                    use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)

                    // fetch job details first
                    use fetchCmd = new NpgsqlCommand(
                        "select title, amount from kwestkarzbusinessdata.jobs where id = @id and status = 'claimed'",
                        connection)
                    fetchCmd.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, jobId) |> ignore
                    use! reader = fetchCmd.ExecuteReaderAsync(httpContext.RequestAborted)
                    let! hasRow = reader.ReadAsync(httpContext.RequestAborted)
                    if not hasRow then
                        return Results.BadRequest("Job is not in claimed state")
                    else
                        let jobTitle = reader.GetString(0)
                        let jobAmount = reader.GetDecimal(1)
                        do! reader.DisposeAsync()

                        use completeCmd =
                            new NpgsqlCommand(
                                """
                                update kwestkarzbusinessdata.jobs
                                set status = 'complete', completed_at = @now, updated_at = @now
                                where id = @id
                                """,
                                connection
                            )
                        completeCmd.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, jobId) |> ignore
                        completeCmd.Parameters.AddWithValue("now", NpgsqlDbType.TimestampTz, DateTimeOffset.UtcNow) |> ignore
                        let! _ = completeCmd.ExecuteNonQueryAsync(httpContext.RequestAborted)

                        // auto-create labor expense entry if amount > 0
                        if jobAmount > 0m then
                            let! laborAccountId = LedgerEndpoints.getLaborAccountId connection httpContext.RequestAborted
                            do! LedgerEndpoints.createEntryAsync
                                    connection
                                    (DateOnly.FromDateTime(DateTime.UtcNow))
                                    $"Job completed: {jobTitle}"
                                    laborAccountId
                                    "expense"
                                    jobAmount
                                    None
                                    (Some jobId)
                                    None
                                    (Some "unpaid")
                                    operator
                                    httpContext.RequestAborted

                        NotificationService.notifyAdminJobCompleted notifConfig dataSource jobId jobTitle operator |> ignore
                        return Results.Ok({| completed = true |})
                })
        ) |> ignore

        // POST /api/jobs/{id}/cancel — admin/manager only
        group.MapPost(
            "/{jobId:guid}/cancel",
            Func<Guid, NpgsqlDataSource, HttpContext, Task<IResult>>(fun jobId dataSource httpContext ->
                task {
                    use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                    use command =
                        new NpgsqlCommand(
                            """
                            update kwestkarzbusinessdata.jobs
                            set status = 'canceled', updated_at = @now
                            where id = @id and status <> 'complete'
                            """,
                            connection
                        )
                    command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, jobId) |> ignore
                    command.Parameters.AddWithValue("now", NpgsqlDbType.TimestampTz, DateTimeOffset.UtcNow) |> ignore
                    let! rows = command.ExecuteNonQueryAsync(httpContext.RequestAborted)
                    return if rows = 0 then Results.NotFound() else Results.Ok()
                })
        ) |> ignore

        app
