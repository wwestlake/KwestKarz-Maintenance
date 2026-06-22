namespace KwestKarz.Api

open System
open System.Threading.Tasks
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Npgsql
open NpgsqlTypes

module UserEndpoints =

    [<CLIMutable>]
    type UserProfile =
        { Id: Guid
          FirebaseUid: string
          Phone: string
          DisplayName: string option
          Role: string
          Status: string
          CreatedAt: DateTimeOffset }

    [<CLIMutable>]
    type ApproveUserRequest =
        { Role: string }

    [<CLIMutable>]
    type UpdateDisplayNameRequest =
        { DisplayName: string }

    let private findUserByUid (connection: NpgsqlConnection) (uid: string) (cancellationToken: Threading.CancellationToken) =
        task {
            use command =
                new NpgsqlCommand(
                    """
                    select id, firebase_uid, phone, display_name, role, status, created_at
                    from kwestkarzbusinessdata.users
                    where firebase_uid = @uid
                    """,
                    connection
                )
            command.Parameters.AddWithValue("uid", NpgsqlDbType.Text, uid) |> ignore
            use! reader = command.ExecuteReaderAsync(cancellationToken)
            let! hasRow = reader.ReadAsync(cancellationToken)
            if not hasRow then return None
            else
                return Some {
                    Id = reader.GetGuid(0)
                    FirebaseUid = reader.GetString(1)
                    Phone = reader.GetString(2)
                    DisplayName = if reader.IsDBNull(3) then None else Some(reader.GetString(3))
                    Role = reader.GetString(4)
                    Status = reader.GetString(5)
                    CreatedAt = reader.GetFieldValue<DateTimeOffset>(6) }
        }

    let internal findUserByUidAsync (dataSource: NpgsqlDataSource) (uid: string) (cancellationToken: Threading.CancellationToken) =
        task {
            use! connection = dataSource.OpenConnectionAsync(cancellationToken)
            return! findUserByUid connection uid cancellationToken
        }

    let mapUserEndpoints (adminPhone: string) (app: WebApplication) =
        let group = app.MapGroup("/api/users")

        // Register or retrieve own profile — accessible to all authenticated users including pending
        group.MapPost(
            "/me",
            Func<NpgsqlDataSource, HttpContext, Task<IResult>>(fun dataSource httpContext ->
                task {
                    let uid = let c = httpContext.User.FindFirst("user_id") in if isNull c then "" else c.Value
                    let phone = let pc = httpContext.User.FindFirst("phone_number") in if isNull pc then "" else pc.Value

                    if String.IsNullOrWhiteSpace(uid) then
                        return Results.Unauthorized()
                    else
                        use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                        let! existing = findUserByUid connection uid httpContext.RequestAborted

                        match existing with
                        | Some user -> return Results.Ok(user)
                        | None ->
                            let phoneVal = if String.IsNullOrWhiteSpace(phone) then "unknown" else phone
                            let isBootstrapAdmin = not (String.IsNullOrWhiteSpace(adminPhone)) && phoneVal = adminPhone
                            let role = if isBootstrapAdmin then "admin" else "worker"
                            let status = if isBootstrapAdmin then "active" else "pending"

                            use command =
                                new NpgsqlCommand(
                                    """
                                    insert into kwestkarzbusinessdata.users
                                        (firebase_uid, phone, role, status, created_at, updated_at)
                                    values (@uid, @phone, @role, @status, @now, @now)
                                    returning id, firebase_uid, phone, display_name, role, status, created_at
                                    """,
                                    connection
                                )
                            command.Parameters.AddWithValue("uid", NpgsqlDbType.Text, uid) |> ignore
                            command.Parameters.AddWithValue("phone", NpgsqlDbType.Text, phoneVal) |> ignore
                            command.Parameters.AddWithValue("role", NpgsqlDbType.Text, role) |> ignore
                            command.Parameters.AddWithValue("status", NpgsqlDbType.Text, status) |> ignore
                            command.Parameters.AddWithValue("now", NpgsqlDbType.TimestampTz, DateTimeOffset.UtcNow) |> ignore
                            use! reader = command.ExecuteReaderAsync(httpContext.RequestAborted)
                            let! _ = reader.ReadAsync(httpContext.RequestAborted)
                            let user = {
                                Id = reader.GetGuid(0)
                                FirebaseUid = reader.GetString(1)
                                Phone = reader.GetString(2)
                                DisplayName = None
                                Role = reader.GetString(4)
                                Status = reader.GetString(5)
                                CreatedAt = reader.GetFieldValue<DateTimeOffset>(6) }
                            return Results.Ok(user)
                })
        )
        |> ignore

        group.MapGet(
            "/me",
            Func<NpgsqlDataSource, HttpContext, Task<IResult>>(fun dataSource httpContext ->
                task {
                    let uid = let c = httpContext.User.FindFirst("user_id") in if isNull c then "" else c.Value
                    if String.IsNullOrWhiteSpace(uid) then
                        return Results.Unauthorized()
                    else
                        let! user = findUserByUidAsync dataSource uid httpContext.RequestAborted
                        return
                            match user with
                            | Some u -> Results.Ok(u)
                            | None -> Results.NotFound()
                })
        )
        |> ignore

        group.MapPut(
            "/me/display-name",
            Func<UpdateDisplayNameRequest, NpgsqlDataSource, HttpContext, Task<IResult>>(fun request dataSource httpContext ->
                task {
                    let uid = let c = httpContext.User.FindFirst("user_id") in if isNull c then "" else c.Value
                    if String.IsNullOrWhiteSpace(uid) then
                        return Results.Unauthorized()
                    else
                        use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                        use command =
                            new NpgsqlCommand(
                                """
                                update kwestkarzbusinessdata.users
                                set display_name = @name, updated_at = @now
                                where firebase_uid = @uid
                                returning id, firebase_uid, phone, display_name, role, status, created_at
                                """,
                                connection
                            )
                        let nameVal = if String.IsNullOrWhiteSpace(request.DisplayName) then box DBNull.Value else box request.DisplayName
                        command.Parameters.AddWithValue("name", NpgsqlDbType.Text, nameVal) |> ignore
                        command.Parameters.AddWithValue("now", NpgsqlDbType.TimestampTz, DateTimeOffset.UtcNow) |> ignore
                        command.Parameters.AddWithValue("uid", NpgsqlDbType.Text, uid) |> ignore
                        use! reader = command.ExecuteReaderAsync(httpContext.RequestAborted)
                        let! hasRow = reader.ReadAsync(httpContext.RequestAborted)
                        if not hasRow then return Results.NotFound()
                        else
                            let user = {
                                Id = reader.GetGuid(0)
                                FirebaseUid = reader.GetString(1)
                                Phone = reader.GetString(2)
                                DisplayName = if reader.IsDBNull(3) then None else Some(reader.GetString(3))
                                Role = reader.GetString(4)
                                Status = reader.GetString(5)
                                CreatedAt = reader.GetFieldValue<DateTimeOffset>(6) }
                            return Results.Ok(user)
                })
        )
        |> ignore

        // Admin endpoints
        group.MapGet(
            "/",
            Func<NpgsqlDataSource, HttpContext, Task<IResult>>(fun dataSource httpContext ->
                task {
                    use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                    use command =
                        new NpgsqlCommand(
                            "select id, firebase_uid, phone, display_name, role, status, created_at from kwestkarzbusinessdata.users order by created_at desc",
                            connection
                        )
                    use! reader = command.ExecuteReaderAsync(httpContext.RequestAborted)
                    let results = ResizeArray<UserProfile>()
                    while! reader.ReadAsync(httpContext.RequestAborted) do
                        results.Add({
                            Id = reader.GetGuid(0)
                            FirebaseUid = reader.GetString(1)
                            Phone = reader.GetString(2)
                            DisplayName = if reader.IsDBNull(3) then None else Some(reader.GetString(3))
                            Role = reader.GetString(4)
                            Status = reader.GetString(5)
                            CreatedAt = reader.GetFieldValue<DateTimeOffset>(6) })
                    return Results.Ok(results.ToArray())
                })
        )
        |> ignore

        group.MapGet(
            "/pending",
            Func<NpgsqlDataSource, HttpContext, Task<IResult>>(fun dataSource httpContext ->
                task {
                    use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                    use command =
                        new NpgsqlCommand(
                            "select id, firebase_uid, phone, display_name, role, status, created_at from kwestkarzbusinessdata.users where status = 'pending' order by created_at asc",
                            connection
                        )
                    use! reader = command.ExecuteReaderAsync(httpContext.RequestAborted)
                    let results = ResizeArray<UserProfile>()
                    while! reader.ReadAsync(httpContext.RequestAborted) do
                        results.Add({
                            Id = reader.GetGuid(0)
                            FirebaseUid = reader.GetString(1)
                            Phone = reader.GetString(2)
                            DisplayName = if reader.IsDBNull(3) then None else Some(reader.GetString(3))
                            Role = reader.GetString(4)
                            Status = reader.GetString(5)
                            CreatedAt = reader.GetFieldValue<DateTimeOffset>(6) })
                    return Results.Ok(results.ToArray())
                })
        )
        |> ignore

        group.MapPost(
            "/{userId:guid}/approve",
            Func<Guid, ApproveUserRequest, NpgsqlDataSource, HttpContext, Task<IResult>>(fun userId request dataSource httpContext ->
                task {
                    let role = if String.IsNullOrWhiteSpace(request.Role) then "worker" else request.Role
                    use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                    use command =
                        new NpgsqlCommand(
                            "update kwestkarzbusinessdata.users set status = 'active', role = @role, updated_at = @now where id = @id",
                            connection
                        )
                    command.Parameters.AddWithValue("role", NpgsqlDbType.Text, role) |> ignore
                    command.Parameters.AddWithValue("now", NpgsqlDbType.TimestampTz, DateTimeOffset.UtcNow) |> ignore
                    command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, userId) |> ignore
                    let! rows = command.ExecuteNonQueryAsync(httpContext.RequestAborted)
                    return if rows = 0 then Results.NotFound() else Results.Ok({| approved = true |})
                })
        )
        |> ignore

        group.MapPost(
            "/{userId:guid}/suspend",
            Func<Guid, NpgsqlDataSource, HttpContext, Task<IResult>>(fun userId dataSource httpContext ->
                task {
                    use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                    use command =
                        new NpgsqlCommand(
                            "update kwestkarzbusinessdata.users set status = 'suspended', updated_at = @now where id = @id",
                            connection
                        )
                    command.Parameters.AddWithValue("now", NpgsqlDbType.TimestampTz, DateTimeOffset.UtcNow) |> ignore
                    command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, userId) |> ignore
                    let! rows = command.ExecuteNonQueryAsync(httpContext.RequestAborted)
                    return if rows = 0 then Results.NotFound() else Results.Ok({| suspended = true |})
                })
        )
        |> ignore

        app
