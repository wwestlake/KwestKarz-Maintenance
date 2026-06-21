namespace KwestKarz.Infrastructure

open System
open System.Threading
open System.Threading.Tasks
open KwestKarz.Domain
open Npgsql
open NpgsqlTypes

type PostgresVehicleRepository(dataSource: NpgsqlDataSource) =
    let optionOrDbNull value =
        match value with
        | Some x -> box x
        | None -> box DBNull.Value

    let getOption (reader: NpgsqlDataReader) name getter =
        let ordinal = reader.GetOrdinal(name)
        if reader.IsDBNull(ordinal) then None else Some(getter ordinal)

    let mapVehicle (reader: NpgsqlDataReader) =
        { Id = reader.GetGuid(reader.GetOrdinal("id"))
          Vin = reader.GetString(reader.GetOrdinal("vin"))
          Year = getOption reader "year" reader.GetInt32
          Make = getOption reader "make" reader.GetString
          Model = getOption reader "model" reader.GetString
          Trim = getOption reader "trim" reader.GetString
          Color = getOption reader "color" reader.GetString
          LicensePlate = getOption reader "license_plate" reader.GetString
          LicensePlateState = getOption reader "license_plate_state" reader.GetString
          AcquisitionDate = getOption reader "acquisition_date" reader.GetFieldValue<DateOnly>
          PurchasePrice = getOption reader "purchase_price" reader.GetDecimal
          Status = reader.GetString(reader.GetOrdinal("status")) |> VehicleStatus.fromStorageValue
          TuroListingId = getOption reader "turo_listing_id" reader.GetString
          TuroListingStatus = getOption reader "turo_listing_status" reader.GetString
          CurrentOdometer = getOption reader "current_odometer" reader.GetInt32
          CurrentOdometerRecordedAt = getOption reader "current_odometer_recorded_at" reader.GetFieldValue<DateTimeOffset>
          FleetPositionNumber = getOption reader "fleet_position_number" reader.GetString
          Notes = getOption reader "notes" reader.GetString
          CreatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("created_at"))
          UpdatedAt = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("updated_at")) }

    let selectColumns =
        """
        id, vin, year, make, model, trim, color, license_plate, license_plate_state,
        acquisition_date, purchase_price, status, turo_listing_id, turo_listing_status,
        current_odometer, current_odometer_recorded_at, fleet_position_number, notes,
        created_at, updated_at
        """

    let addVehicleParameters (command: NpgsqlCommand) (vehicle: NewVehicle) (id: Guid) (now: DateTimeOffset) =
        command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, id) |> ignore
        command.Parameters.AddWithValue("vin", NpgsqlDbType.Varchar, vehicle.Vin.Trim().ToUpperInvariant()) |> ignore
        command.Parameters.AddWithValue("year", NpgsqlDbType.Integer, optionOrDbNull vehicle.Year) |> ignore
        command.Parameters.AddWithValue("make", NpgsqlDbType.Text, optionOrDbNull vehicle.Make) |> ignore
        command.Parameters.AddWithValue("model", NpgsqlDbType.Text, optionOrDbNull vehicle.Model) |> ignore
        command.Parameters.AddWithValue("trim", NpgsqlDbType.Text, optionOrDbNull vehicle.Trim) |> ignore
        command.Parameters.AddWithValue("color", NpgsqlDbType.Text, optionOrDbNull vehicle.Color) |> ignore
        command.Parameters.AddWithValue("license_plate", NpgsqlDbType.Text, optionOrDbNull vehicle.LicensePlate) |> ignore
        command.Parameters.AddWithValue("license_plate_state", NpgsqlDbType.Text, optionOrDbNull vehicle.LicensePlateState) |> ignore
        command.Parameters.AddWithValue("acquisition_date", NpgsqlDbType.Date, optionOrDbNull vehicle.AcquisitionDate) |> ignore
        command.Parameters.AddWithValue("purchase_price", NpgsqlDbType.Numeric, optionOrDbNull vehicle.PurchasePrice) |> ignore
        command.Parameters.AddWithValue("status", NpgsqlDbType.Text, VehicleStatus.toStorageValue vehicle.Status) |> ignore
        command.Parameters.AddWithValue("turo_listing_id", NpgsqlDbType.Text, optionOrDbNull vehicle.TuroListingId) |> ignore
        command.Parameters.AddWithValue("turo_listing_status", NpgsqlDbType.Text, optionOrDbNull vehicle.TuroListingStatus) |> ignore
        command.Parameters.AddWithValue("current_odometer", NpgsqlDbType.Integer, optionOrDbNull vehicle.CurrentOdometer) |> ignore
        command.Parameters.AddWithValue("current_odometer_recorded_at", NpgsqlDbType.TimestampTz, optionOrDbNull vehicle.CurrentOdometerRecordedAt) |> ignore
        command.Parameters.AddWithValue("fleet_position_number", NpgsqlDbType.Text, optionOrDbNull vehicle.FleetPositionNumber) |> ignore
        command.Parameters.AddWithValue("notes", NpgsqlDbType.Text, optionOrDbNull vehicle.Notes) |> ignore
        command.Parameters.AddWithValue("created_at", NpgsqlDbType.TimestampTz, now) |> ignore
        command.Parameters.AddWithValue("updated_at", NpgsqlDbType.TimestampTz, now) |> ignore

    interface IVehicleRepository with
        member _.ListAsync(cancellationToken: CancellationToken) : Task<Vehicle list> =
            task {
                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                use command =
                    new NpgsqlCommand(
                        $"select {selectColumns} from kwestkarzbusinessdata.vehicles order by fleet_position_number nulls last, vin",
                        connection
                    )

                use! reader = command.ExecuteReaderAsync(cancellationToken)
                let vehicles = ResizeArray<Vehicle>()
                let mutable keepReading = true

                while keepReading do
                    let! hasRow = reader.ReadAsync(cancellationToken)
                    if hasRow then vehicles.Add(mapVehicle reader) else keepReading <- false

                return List.ofSeq vehicles
            }

        member _.FindByIdAsync(id: Guid, cancellationToken: CancellationToken) : Task<Vehicle option> =
            task {
                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                use command =
                    new NpgsqlCommand(
                        $"select {selectColumns} from kwestkarzbusinessdata.vehicles where id = @id",
                        connection
                    )

                command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, id) |> ignore
                use! reader = command.ExecuteReaderAsync(cancellationToken)
                let! hasRow = reader.ReadAsync(cancellationToken)
                return if hasRow then Some(mapVehicle reader) else None
            }

        member _.FindByVinAsync(vin: string, cancellationToken: CancellationToken) : Task<Vehicle option> =
            task {
                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                use command =
                    new NpgsqlCommand(
                        $"select {selectColumns} from kwestkarzbusinessdata.vehicles where vin = @vin",
                        connection
                    )

                command.Parameters.AddWithValue("vin", NpgsqlDbType.Varchar, vin.Trim().ToUpperInvariant()) |> ignore
                use! reader = command.ExecuteReaderAsync(cancellationToken)
                let! hasRow = reader.ReadAsync(cancellationToken)
                return if hasRow then Some(mapVehicle reader) else None
            }

        member _.UpdateAsync(id: Guid, update: UpdateVehicle, cancellationToken: CancellationToken) : Task<Vehicle option> =
            task {
                let now = DateTimeOffset.UtcNow

                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                use command =
                    new NpgsqlCommand(
                        $"""
                        update kwestkarzbusinessdata.vehicles set
                            color = @color,
                            license_plate = @license_plate,
                            license_plate_state = @license_plate_state,
                            status = @status,
                            current_odometer = @current_odometer,
                            current_odometer_recorded_at = @current_odometer_recorded_at,
                            fleet_position_number = @fleet_position_number,
                            notes = @notes,
                            updated_at = @updated_at
                        where id = @id
                        returning {selectColumns}
                        """,
                        connection
                    )

                command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, id) |> ignore
                command.Parameters.AddWithValue("color", NpgsqlDbType.Text, optionOrDbNull update.Color) |> ignore
                command.Parameters.AddWithValue("license_plate", NpgsqlDbType.Text, optionOrDbNull update.LicensePlate) |> ignore
                command.Parameters.AddWithValue("license_plate_state", NpgsqlDbType.Text, optionOrDbNull update.LicensePlateState) |> ignore
                command.Parameters.AddWithValue("status", NpgsqlDbType.Text, VehicleStatus.toStorageValue update.Status) |> ignore
                command.Parameters.AddWithValue("current_odometer", NpgsqlDbType.Integer, optionOrDbNull update.CurrentOdometer) |> ignore
                command.Parameters.AddWithValue("current_odometer_recorded_at", NpgsqlDbType.TimestampTz, optionOrDbNull update.CurrentOdometerRecordedAt) |> ignore
                command.Parameters.AddWithValue("fleet_position_number", NpgsqlDbType.Text, optionOrDbNull update.FleetPositionNumber) |> ignore
                command.Parameters.AddWithValue("notes", NpgsqlDbType.Text, optionOrDbNull update.Notes) |> ignore
                command.Parameters.AddWithValue("updated_at", NpgsqlDbType.TimestampTz, now) |> ignore

                use! reader = command.ExecuteReaderAsync(cancellationToken)
                let! hasRow = reader.ReadAsync(cancellationToken)
                return if hasRow then Some(mapVehicle reader) else None
            }

        member _.CreateAsync(vehicle: NewVehicle, cancellationToken: CancellationToken) : Task<Vehicle> =
            task {
                let id = Guid.NewGuid()
                let now = DateTimeOffset.UtcNow

                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                use command =
                    new NpgsqlCommand(
                        $"""
                        insert into kwestkarzbusinessdata.vehicles (
                            id, vin, year, make, model, trim, color, license_plate, license_plate_state,
                            acquisition_date, purchase_price, status, turo_listing_id, turo_listing_status,
                            current_odometer, current_odometer_recorded_at, fleet_position_number, notes,
                            created_at, updated_at
                        )
                        values (
                            @id, @vin, @year, @make, @model, @trim, @color, @license_plate, @license_plate_state,
                            @acquisition_date, @purchase_price, @status, @turo_listing_id, @turo_listing_status,
                            @current_odometer, @current_odometer_recorded_at, @fleet_position_number, @notes,
                            @created_at, @updated_at
                        )
                        returning {selectColumns}
                        """,
                        connection
                    )

                addVehicleParameters command vehicle id now
                use! reader = command.ExecuteReaderAsync(cancellationToken)
                let! hasRow = reader.ReadAsync(cancellationToken)

                if not hasRow then
                    return failwith "Vehicle insert did not return a row."
                else
                    return mapVehicle reader
            }
