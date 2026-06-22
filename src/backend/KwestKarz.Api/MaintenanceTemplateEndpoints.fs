namespace KwestKarz.Api

open System
open System.Threading.Tasks
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Npgsql
open NpgsqlTypes

module MaintenanceTemplateEndpoints =

    [<CLIMutable>]
    type TemplateResponse =
        { Id: Guid
          EventType: string
          MileInterval: int option
          DayInterval: int option
          WarnMilesOut: int
          WarnDaysOut: int
          Description: string option
          IsActive: bool
          SortOrder: int }

    [<CLIMutable>]
    type SaveTemplateRequest =
        { EventType: string
          MileInterval: int option
          DayInterval: int option
          WarnMilesOut: int
          WarnDaysOut: int
          Description: string option
          IsActive: bool
          SortOrder: int }

    let private readTemplate (reader: NpgsqlDataReader) =
        { Id = reader.GetGuid(0)
          EventType = reader.GetString(1)
          MileInterval = if reader.IsDBNull(2) then None else Some(reader.GetInt32(2))
          DayInterval = if reader.IsDBNull(3) then None else Some(reader.GetInt32(3))
          WarnMilesOut = reader.GetInt32(4)
          WarnDaysOut = reader.GetInt32(5)
          Description = if reader.IsDBNull(6) then None else Some(reader.GetString(6))
          IsActive = reader.GetBoolean(7)
          SortOrder = reader.GetInt32(8) }

    let internal loadSchedulesAsync (dataSource: NpgsqlDataSource) (cancellationToken: Threading.CancellationToken) =
        task {
            use! connection = dataSource.OpenConnectionAsync(cancellationToken)
            use cmd = new NpgsqlCommand(
                """select event_type, mile_interval, day_interval, warn_miles_out, warn_days_out
                   from kwestkarzbusinessdata.maintenance_templates
                   where is_active = true
                   order by sort_order""",
                connection)
            use! reader = cmd.ExecuteReaderAsync(cancellationToken)
            let results = ResizeArray<ServiceSchedule>()
            while! reader.ReadAsync(cancellationToken) do
                results.Add({
                    EventType = reader.GetString(0)
                    MileInterval = if reader.IsDBNull(1) then None else Some(reader.GetInt32(1))
                    DayInterval = if reader.IsDBNull(2) then None else Some(reader.GetInt32(2))
                    WarnMilesOut = reader.GetInt32(3)
                    WarnDaysOut = reader.GetInt32(4) })
            return results |> Seq.toList
        }

    let mapMaintenanceTemplateEndpoints (app: WebApplication) =

        // GET /api/maintenance/templates — all active templates (public to all users)
        app.MapGet(
            "/api/maintenance/templates",
            Func<NpgsqlDataSource, HttpContext, Task<IResult>>(fun dataSource httpContext ->
                task {
                    use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                    use cmd = new NpgsqlCommand(
                        """select id, event_type, mile_interval, day_interval, warn_miles_out, warn_days_out,
                                  description, is_active, sort_order
                           from kwestkarzbusinessdata.maintenance_templates
                           where is_active = true
                           order by sort_order""",
                        connection)
                    use! reader = cmd.ExecuteReaderAsync(httpContext.RequestAborted)
                    let results = ResizeArray<TemplateResponse>()
                    while! reader.ReadAsync(httpContext.RequestAborted) do
                        results.Add(readTemplate reader)
                    return Results.Ok(results.ToArray())
                })
        ) |> ignore

        // GET /api/maintenance/templates/all — includes inactive (admin only)
        app.MapGet(
            "/api/maintenance/templates/all",
            Func<NpgsqlDataSource, HttpContext, Task<IResult>>(fun dataSource httpContext ->
                task {
                    use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                    use cmd = new NpgsqlCommand(
                        """select id, event_type, mile_interval, day_interval, warn_miles_out, warn_days_out,
                                  description, is_active, sort_order
                           from kwestkarzbusinessdata.maintenance_templates
                           order by sort_order""",
                        connection)
                    use! reader = cmd.ExecuteReaderAsync(httpContext.RequestAborted)
                    let results = ResizeArray<TemplateResponse>()
                    while! reader.ReadAsync(httpContext.RequestAborted) do
                        results.Add(readTemplate reader)
                    return Results.Ok(results.ToArray())
                })
        ) |> ignore

        // POST /api/maintenance/templates — admin creates new template
        app.MapPost(
            "/api/maintenance/templates",
            Func<SaveTemplateRequest, NpgsqlDataSource, HttpContext, Task<IResult>>(fun request dataSource httpContext ->
                task {
                    if String.IsNullOrWhiteSpace(request.EventType) then
                        return Results.BadRequest("EventType is required")
                    else
                        use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                        use cmd = new NpgsqlCommand(
                            """insert into kwestkarzbusinessdata.maintenance_templates
                                   (event_type, mile_interval, day_interval, warn_miles_out, warn_days_out,
                                    description, is_active, sort_order, created_at, updated_at)
                               values (@eventType, @mileInterval, @dayInterval, @warnMiles, @warnDays,
                                       @desc, @isActive, @sortOrder, @now, @now)
                               returning id, event_type, mile_interval, day_interval, warn_miles_out, warn_days_out,
                                         description, is_active, sort_order""",
                            connection)
                        cmd.Parameters.AddWithValue("eventType", NpgsqlDbType.Text, request.EventType) |> ignore
                        cmd.Parameters.AddWithValue("mileInterval", NpgsqlDbType.Integer, request.MileInterval |> Option.map box |> Option.defaultValue (box DBNull.Value)) |> ignore
                        cmd.Parameters.AddWithValue("dayInterval", NpgsqlDbType.Integer, request.DayInterval |> Option.map box |> Option.defaultValue (box DBNull.Value)) |> ignore
                        cmd.Parameters.AddWithValue("warnMiles", NpgsqlDbType.Integer, request.WarnMilesOut) |> ignore
                        cmd.Parameters.AddWithValue("warnDays", NpgsqlDbType.Integer, request.WarnDaysOut) |> ignore
                        cmd.Parameters.AddWithValue("desc", NpgsqlDbType.Text, request.Description |> Option.map box |> Option.defaultValue (box DBNull.Value)) |> ignore
                        cmd.Parameters.AddWithValue("isActive", NpgsqlDbType.Boolean, request.IsActive) |> ignore
                        cmd.Parameters.AddWithValue("sortOrder", NpgsqlDbType.Integer, request.SortOrder) |> ignore
                        cmd.Parameters.AddWithValue("now", NpgsqlDbType.TimestampTz, DateTimeOffset.UtcNow) |> ignore
                        use! reader = cmd.ExecuteReaderAsync(httpContext.RequestAborted)
                        let! _ = reader.ReadAsync(httpContext.RequestAborted)
                        return Results.Ok(readTemplate reader)
                })
        ) |> ignore

        // PUT /api/maintenance/templates/{id}
        app.MapPut(
            "/api/maintenance/templates/{templateId:guid}",
            Func<Guid, SaveTemplateRequest, NpgsqlDataSource, HttpContext, Task<IResult>>(fun templateId request dataSource httpContext ->
                task {
                    use! connection = dataSource.OpenConnectionAsync(httpContext.RequestAborted)
                    use cmd = new NpgsqlCommand(
                        """update kwestkarzbusinessdata.maintenance_templates
                           set event_type = @eventType, mile_interval = @mileInterval, day_interval = @dayInterval,
                               warn_miles_out = @warnMiles, warn_days_out = @warnDays, description = @desc,
                               is_active = @isActive, sort_order = @sortOrder, updated_at = @now
                           where id = @id
                           returning id, event_type, mile_interval, day_interval, warn_miles_out, warn_days_out,
                                     description, is_active, sort_order""",
                        connection)
                    cmd.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, templateId) |> ignore
                    cmd.Parameters.AddWithValue("eventType", NpgsqlDbType.Text, request.EventType) |> ignore
                    cmd.Parameters.AddWithValue("mileInterval", NpgsqlDbType.Integer, request.MileInterval |> Option.map box |> Option.defaultValue (box DBNull.Value)) |> ignore
                    cmd.Parameters.AddWithValue("dayInterval", NpgsqlDbType.Integer, request.DayInterval |> Option.map box |> Option.defaultValue (box DBNull.Value)) |> ignore
                    cmd.Parameters.AddWithValue("warnMiles", NpgsqlDbType.Integer, request.WarnMilesOut) |> ignore
                    cmd.Parameters.AddWithValue("warnDays", NpgsqlDbType.Integer, request.WarnDaysOut) |> ignore
                    cmd.Parameters.AddWithValue("desc", NpgsqlDbType.Text, request.Description |> Option.map box |> Option.defaultValue (box DBNull.Value)) |> ignore
                    cmd.Parameters.AddWithValue("isActive", NpgsqlDbType.Boolean, request.IsActive) |> ignore
                    cmd.Parameters.AddWithValue("sortOrder", NpgsqlDbType.Integer, request.SortOrder) |> ignore
                    cmd.Parameters.AddWithValue("now", NpgsqlDbType.TimestampTz, DateTimeOffset.UtcNow) |> ignore
                    use! reader = cmd.ExecuteReaderAsync(httpContext.RequestAborted)
                    let! hasRow = reader.ReadAsync(httpContext.RequestAborted)
                    if not hasRow then return Results.NotFound()
                    else return Results.Ok(readTemplate reader)
                })
        ) |> ignore

        app
