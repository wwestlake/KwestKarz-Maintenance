module Tests

open System
open Xunit
open KwestKarz.Api
open KwestKarz.Domain
open Npgsql
open NpgsqlTypes

[<Theory>]
[<InlineData("2026-01-01", "2026-12-31", true)>]
[<InlineData("2026-01-01", "2026-01-01", true)>]
[<InlineData("2026-02-29", "2026-03-01", false)>]
[<InlineData("2026-03-01", "2026-01-01", false)>]
[<InlineData("", "2026-01-01", false)>]
[<InlineData("1/1/2026", "2026-01-01", false)>]
let ``report dates must be explicit valid ordered ISO dates`` fromDate toDate valid =
    Assert.Equal(valid, ReportsEndpoints.parsePeriod fromDate toDate |> Result.isOk)

let private vehicle: Vehicle =
    { Id = Guid.NewGuid(); Vin = "TESTVIN"; Year = Some 2023; Make = Some "Chevrolet"; Model = Some "Blazer"
      Trim = None; BodyClass = Some "Sport Utility Vehicle [SUV]/Multipurpose Vehicle [MPV]"
      Transmission = None; Color = Some "Blue"; LicensePlate = None; LicensePlateState = None
      AcquisitionDate = None; PurchasePrice = None; Status = VehicleStatus.Active
      TuroListingId = None; TuroListingStatus = None; TuroListingUrl = None
      CurrentOdometer = None; CurrentOdometerRecordedAt = None; FleetPositionNumber = None
      Notes = None; Description = Some "Original description"; CreatedAt = DateTimeOffset.UtcNow; UpdatedAt = DateTimeOffset.UtcNow }

let private decode: VinDecodeResult =
    { Vin = "TESTVIN"; Year = None; Make = None; Model = None; Trim = None; VehicleType = None
      BodyClass = None; TransmissionStyle = None; EngineCylinders = Some "4"; DisplacementL = Some "2.0"
      FuelTypePrimary = Some "Gasoline"; DriveType = Some "FWD/Front-Wheel Drive"; Doors = Some "4"
      Seats = Some "5"; EngineHP = None; ErrorCode = None; ErrorText = None }

[<Fact>]
let ``description uses readable specifications and grammatical seating`` () =
    let description = VehicleEndpoints.buildGeneratedDescription vehicle decode
    Assert.Contains("2023 Chevrolet Blazer", description)
    Assert.Contains("sport utility vehicle in blue", description)
    Assert.Contains("2.0L 4-cylinder engine", description)
    Assert.Contains("front-wheel drive", description)
    Assert.Contains("4 doors and seating for 5", description)
    Assert.DoesNotContain("[SUV]", description)
    Assert.Equal(Some "Original description", vehicle.Description)

[<Fact>]
let ``description handles absent mechanical details`` () =
    let sparse = { decode with EngineCylinders = None; DisplacementL = None; FuelTypePrimary = None; DriveType = None; Doors = None; Seats = None }
    let description = VehicleEndpoints.buildGeneratedDescription vehicle sparse
    Assert.DoesNotContain("Features include", description)
    Assert.DoesNotContain("seating", description)

type LocalDatabaseFactAttribute() as this =
    inherit FactAttribute()
    do if String.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("KWESTKARZ_TEST_DATABASE")) then
           this.Skip <- "Set KWESTKARZ_TEST_DATABASE to a local PostgreSQL connection string to run database report verification."

[<LocalDatabaseFact>]
let ``report aggregates complete history without multiplying sources and preserves unassigned amounts`` () =
    let connectionString = Environment.GetEnvironmentVariable("KWESTKARZ_TEST_DATABASE")
    let config = NpgsqlConnectionStringBuilder(connectionString)
    Assert.Contains(config.Host, [| "localhost"; "127.0.0.1"; "::1" |])
    use connection = new NpgsqlConnection(connectionString)
    connection.Open()
    use transaction = connection.BeginTransaction()
    let schema = "report_test_" + Guid.NewGuid().ToString("N")
    let vehicleId = Guid.NewGuid()
    use setup = new NpgsqlCommand($"""
        create schema {schema};
        create table {schema}.vehicles(id uuid, year int, make text, model text, vin text, license_plate text, status text, current_odometer int);
        create table {schema}.turo_trip_earnings(vehicle_id uuid, trip_start timestamptz, trip_status text, total_earnings numeric, distance_traveled int);
        create table {schema}.ledger_entries(vehicle_id uuid, entry_date date, entry_type text, amount numeric);
        create table {schema}.maintenance_records(vehicle_id uuid, date_performed date, cost numeric);
        insert into {schema}.vehicles values (@id, 2023, 'Chevrolet', 'Blazer', 'VIN1', 'PLATE1', 'Active', 20000),
            (gen_random_uuid(), 2022, 'Chevrolet', 'Blazer', 'VIN2', 'PLATE2', 'Inactive', null);
        insert into {schema}.turo_trip_earnings select @id, '2026-01-01 12:00Z', 'Completed', 10, 10 from generate_series(1,101);
        insert into {schema}.turo_trip_earnings values
            (@id, '2026-01-01 12:00Z', 'Guest cancellation', 5, 999),
            (@id, '2026-01-01 12:00Z', 'Completed', null, null),
            (@id, '2026-01-02 04:59Z', 'Completed', 2, 2),
            (@id, '2026-01-02 05:00Z', 'Completed', 9000, 9000),
            (@id, '2026-01-01 04:59Z', 'Completed', 9000, 9000),
            (@id, null, 'Completed', 9000, 9000),
            (null, '2026-01-01 12:00Z', 'Host cancellation', 3, null);
        insert into {schema}.ledger_entries values (@id, '2026-01-01', 'income', 40),
            (@id, '2026-01-01', 'expense', 10), (null, '2026-01-01', 'expense', 7),
            (@id, '2026-01-02', 'income', 9000);
        insert into {schema}.maintenance_records values (@id, '2026-01-01', 25), (@id, '2026-01-01', null), (@id, '2026-01-02', 9000);
        """, connection, transaction)
    setup.Parameters.AddWithValue("id", vehicleId) |> ignore
    setup.ExecuteNonQuery() |> ignore
    use command = new NpgsqlCommand(ReportsEndpoints.reportSql.Replace("kwestkarzbusinessdata", schema), connection, transaction)
    command.Parameters.AddWithValue("from", NpgsqlDbType.Date, DateOnly(2026, 1, 1)) |> ignore
    command.Parameters.AddWithValue("to", NpgsqlDbType.Date, DateOnly(2026, 1, 1)) |> ignore
    use reader = command.ExecuteReader() :?> NpgsqlDataReader
    let rows = ResizeArray<ReportsEndpoints.VehicleReportRow>()
    while reader.Read() do rows.Add(ReportsEndpoints.readReportRow reader)
    reader.Close()
    Assert.Equal(3, rows.Count)
    let car = rows |> Seq.find (fun row -> row.VehicleId = Some vehicleId)
    Assert.Equal(104L, car.TripCount)
    Assert.Equal(103L, car.CompletedTrips)
    Assert.Equal(1L, car.CancelledTrips)
    Assert.Equal(1017m, car.TripEarnings)
    Assert.Equal(1L, car.MissingEarnings)
    Assert.Equal(1012L, car.CompletedMiles)
    Assert.Equal(1L, car.MissingMiles)
    Assert.Equal(40m, car.LedgerIncome)
    Assert.Equal(10m, car.LedgerExpenses)
    Assert.Equal(2L, car.LedgerEntries)
    Assert.Equal(2L, car.MaintenanceCount)
    Assert.Equal(25m, car.MaintenanceCost)
    Assert.Equal(1L, car.MissingMaintenanceCosts)
    let unassigned = rows |> Seq.find (fun row -> row.VehicleId.IsNone)
    Assert.Equal(3m, unassigned.TripEarnings)
    Assert.Equal(7m, unassigned.LedgerExpenses)
    let empty = rows |> Seq.find (fun row -> row.Vin = Some "VIN2")
    Assert.Equal(0L, empty.TripCount)
    Assert.Equal(0m, empty.LedgerIncome)
    transaction.Rollback()
