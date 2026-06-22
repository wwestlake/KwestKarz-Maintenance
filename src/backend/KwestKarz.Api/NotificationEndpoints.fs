namespace KwestKarz.Api

open System
open System.Threading.Tasks
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Npgsql
open NpgsqlTypes

module NotificationEndpoints =

    [<CLIMutable>]
    type NotificationPrefsRequest =
        { NotifyByEmail: bool
          EmailAddress: string option }

    [<CLIMutable>]
    type NotificationLogEntry =
        { Id: Guid
          UserId: Guid option
          JobId: Guid option
          EventType: string
          Channel: string
          Recipient: string
          Subject: string
          Status: string
          Error: string option
          SentAt: DateTimeOffset }

    let mapNotificationEndpoints (app: WebApplication) =

        // GET /api/users/me/notifications — get my notification prefs
        app.MapGet(
            "/api/users/me/notifications",
            Func<NpgsqlDataSource, HttpContext, Task<IResult>>(fun dataSource httpContext ->
                task {
                    let uid = let c = httpContext.User.FindFirst("user_id") in if isNull c then "" else c.Value
                    if String.IsNullOrWhiteSpace(uid) then return Results.Unauthorized()
                    else
                        use! conn = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                        use cmd =
                            new NpgsqlCommand(
                                "select notify_by_email, email_address from kwestkarzbusinessdata.users where firebase_uid = @uid",
                                conn
                            )
                        cmd.Parameters.AddWithValue("uid", NpgsqlDbType.Text, uid) |> ignore
                        use! reader = cmd.ExecuteReaderAsync(httpContext.RequestAborted)
                        let! hasRow = reader.ReadAsync(httpContext.RequestAborted)
                        if not hasRow then return Results.NotFound()
                        else
                            return Results.Ok(
                                {| notifyByEmail = reader.GetBoolean(0)
                                   emailAddress = if reader.IsDBNull(1) then null else reader.GetString(1) |})
                })
        ) |> ignore

        // PUT /api/users/me/notifications — update my notification prefs
        app.MapPut(
            "/api/users/me/notifications",
            Func<NotificationPrefsRequest, NpgsqlDataSource, HttpContext, Task<IResult>>(fun prefs dataSource httpContext ->
                task {
                    let uid = let c = httpContext.User.FindFirst("user_id") in if isNull c then "" else c.Value
                    if String.IsNullOrWhiteSpace(uid) then return Results.Unauthorized()
                    else
                        use! conn = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                        use cmd =
                            new NpgsqlCommand(
                                """update kwestkarzbusinessdata.users
                                   set notify_by_email = @notify, email_address = @email, updated_at = now()
                                   where firebase_uid = @uid""",
                                conn
                            )
                        cmd.Parameters.AddWithValue("notify", NpgsqlDbType.Boolean, prefs.NotifyByEmail) |> ignore
                        cmd.Parameters.AddWithValue("email", NpgsqlDbType.Text, prefs.EmailAddress |> Option.map box |> Option.defaultValue (box DBNull.Value)) |> ignore
                        cmd.Parameters.AddWithValue("uid", NpgsqlDbType.Text, uid) |> ignore
                        let! rows = cmd.ExecuteNonQueryAsync(httpContext.RequestAborted)
                        if rows = 0 then return Results.NotFound()
                        else return Results.Ok({| saved = true |})
                })
        ) |> ignore

        // GET /api/notifications/log — admin: view notification history
        app.MapGet(
            "/api/notifications/log",
            Func<NpgsqlDataSource, HttpContext, Task<IResult>>(fun dataSource httpContext ->
                task {
                    use! conn = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                    use cmd =
                        new NpgsqlCommand(
                            """select id, user_id, job_id, event_type, channel, recipient, subject, status, error, sent_at
                               from kwestkarzbusinessdata.notification_log
                               order by sent_at desc
                               limit 200""",
                            conn
                        )
                    use! reader = cmd.ExecuteReaderAsync(httpContext.RequestAborted)
                    let results = ResizeArray<NotificationLogEntry>()
                    while! reader.ReadAsync(httpContext.RequestAborted) do
                        results.Add({
                            Id = reader.GetGuid(0)
                            UserId = if reader.IsDBNull(1) then None else Some(reader.GetGuid(1))
                            JobId = if reader.IsDBNull(2) then None else Some(reader.GetGuid(2))
                            EventType = reader.GetString(3)
                            Channel = reader.GetString(4)
                            Recipient = reader.GetString(5)
                            Subject = reader.GetString(6)
                            Status = reader.GetString(7)
                            Error = if reader.IsDBNull(8) then None else Some(reader.GetString(8))
                            SentAt = reader.GetFieldValue<DateTimeOffset>(9)
                        })
                    return Results.Ok(results.ToArray())
                })
        ) |> ignore

        app
