namespace KwestKarz.Api

open System
open System.Globalization
open System.Threading.Tasks
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Npgsql
open NpgsqlTypes

module ReportsEndpoints =
    type VehicleReportRow =
        { VehicleId: Guid option
          Label: string
          Vin: string option
          LicensePlate: string option
          Status: string
          CurrentOdometer: int option
          TripCount: int64
          CompletedTrips: int64
          CancelledTrips: int64
          TripEarnings: decimal
          MissingEarnings: int64
          CompletedMiles: int64
          MissingMiles: int64
          LedgerIncome: decimal
          LedgerExpenses: decimal
          LedgerEntries: int64
          MaintenanceCount: int64
          MaintenanceCost: decimal
          MissingMaintenanceCosts: int64 }

    let parsePeriod (fromText: string) (toText: string) =
        let parse value = DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None)
        match parse fromText, parse toText with
        | (true, fromDate), (true, toDate) when fromDate <= toDate -> Ok (fromDate, toDate)
        | _ -> Error "Choose valid From and To dates (YYYY-MM-DD), with From on or before To."

    // Aggregate each source BEFORE joining so multiple trips, entries and services cannot multiply totals.
    // Include unmatched records as an explicit fleet row rather than silently dropping their amounts.
    let reportSql = """
        with trips as (
            select vehicle_id, count(*) as trip_count,
                count(*) filter (where lower(trim(trip_status)) = 'completed') as completed,
                count(*) filter (where lower(trip_status) like '%cancel%') as cancelled,
                coalesce(sum(total_earnings), 0) as earnings,
                count(*) filter (where total_earnings is null) as missing_earnings,
                coalesce(sum(distance_traveled) filter (where lower(trim(trip_status)) = 'completed' and distance_traveled >= 0), 0) as miles,
                count(*) filter (where lower(trim(trip_status)) = 'completed' and (distance_traveled is null or distance_traveled < 0)) as missing_miles
            from kwestkarzbusinessdata.turo_trip_earnings
            where (trip_start at time zone 'America/Detroit')::date between @from and @to
            group by vehicle_id
        ), ledger as (
            select vehicle_id, count(*) as entry_count,
                coalesce(sum(amount) filter (where entry_type = 'income'), 0) as income,
                coalesce(sum(amount) filter (where entry_type = 'expense'), 0) as expenses
            from kwestkarzbusinessdata.ledger_entries
            where entry_date between @from and @to
            group by vehicle_id
        ), maintenance as (
            select vehicle_id, count(*) as service_count, coalesce(sum(cost), 0) as cost,
                count(*) filter (where cost is null) as missing_costs
            from kwestkarzbusinessdata.maintenance_records
            where date_performed between @from and @to
            group by vehicle_id
        ), fleet as (
            select id, coalesce(nullif(concat_ws(' ', year, make, model), ''), vin) as label,
                vin, license_plate, status, current_odometer
            from kwestkarzbusinessdata.vehicles
            union all
            select null::uuid, 'Unassigned', null, null, 'Unassigned', null::integer
            where exists (select 1 from trips where vehicle_id is null)
               or exists (select 1 from ledger where vehicle_id is null)
        )
        select v.id, v.label, v.vin, v.license_plate, v.status, v.current_odometer,
            coalesce(t.trip_count, 0), coalesce(t.completed, 0), coalesce(t.cancelled, 0),
            coalesce(t.earnings, 0), coalesce(t.missing_earnings, 0), coalesce(t.miles, 0), coalesce(t.missing_miles, 0),
            coalesce(l.income, 0), coalesce(l.expenses, 0), coalesce(l.entry_count, 0),
            coalesce(m.service_count, 0), coalesce(m.cost, 0), coalesce(m.missing_costs, 0)
        from fleet v
        left join trips t on t.vehicle_id is not distinct from v.id
        left join ledger l on l.vehicle_id is not distinct from v.id
        left join maintenance m on m.vehicle_id = v.id
        order by v.id is null, v.label, v.license_plate, v.id
        """

    let readReportRow (reader: NpgsqlDataReader) =
        { VehicleId = if reader.IsDBNull(0) then None else Some(reader.GetGuid(0))
          Label = reader.GetString(1)
          Vin = if reader.IsDBNull(2) then None else Some(reader.GetString(2))
          LicensePlate = if reader.IsDBNull(3) then None else Some(reader.GetString(3))
          Status = reader.GetString(4)
          CurrentOdometer = if reader.IsDBNull(5) then None else Some(reader.GetInt32(5))
          TripCount = reader.GetInt64(6)
          CompletedTrips = reader.GetInt64(7)
          CancelledTrips = reader.GetInt64(8)
          TripEarnings = reader.GetDecimal(9)
          MissingEarnings = reader.GetInt64(10)
          CompletedMiles = reader.GetInt64(11)
          MissingMiles = reader.GetInt64(12)
          LedgerIncome = reader.GetDecimal(13)
          LedgerExpenses = reader.GetDecimal(14)
          LedgerEntries = reader.GetInt64(15)
          MaintenanceCount = reader.GetInt64(16)
          MaintenanceCost = reader.GetDecimal(17)
          MissingMaintenanceCosts = reader.GetInt64(18) }

    let mapReportsEndpoints (app: WebApplication) =
        app.MapGet("/api/reports/vehicles",
            Func<NpgsqlDataSource, HttpContext, Task<IResult>>(fun dataSource context -> task {
                let role = context.Request.Headers["X-Role"].ToString()
                if role <> "admin" && role <> "manager" then
                    return Results.Forbid()
                else
                    match parsePeriod (context.Request.Query["from"].ToString()) (context.Request.Query["to"].ToString()) with
                    | Error message -> return Results.BadRequest(message)
                    | Ok (fromDate, toDate) ->
                        use! connection = dataSource.OpenConnectionAsync(context.RequestAborted)
                        use command = new NpgsqlCommand(reportSql, connection)
                        command.Parameters.AddWithValue("from", NpgsqlDbType.Date, fromDate) |> ignore
                        command.Parameters.AddWithValue("to", NpgsqlDbType.Date, toDate) |> ignore
                        use! reader = command.ExecuteReaderAsync(context.RequestAborted)
                        let rows = ResizeArray<VehicleReportRow>()
                        while! reader.ReadAsync(context.RequestAborted) do
                            rows.Add(readReportRow reader)
                        return Results.Ok({| periodStart = fromDate.ToString("yyyy-MM-dd")
                                             periodEnd = toDate.ToString("yyyy-MM-dd")
                                             generatedAt = DateTimeOffset.UtcNow
                                             rows = rows.ToArray() |})
            })).RequireAuthorization() |> ignore
        app
