namespace KwestKarz.Infrastructure

open System.Threading
open System.Threading.Tasks
open Npgsql

type DatabaseInitializer(dataSource: NpgsqlDataSource) =
    member _.EnsureCreatedAsync(cancellationToken: CancellationToken) : Task =
        task {
            let sql =
                """
                create schema if not exists kwestkarzbusinessdata;

                create table if not exists kwestkarzbusinessdata.vehicles (
                    id uuid primary key,
                    vin varchar(17) not null unique,
                    year integer null,
                    make text null,
                    model text null,
                    trim text null,
                    color text null,
                    license_plate text null,
                    license_plate_state text null,
                    acquisition_date date null,
                    purchase_price numeric(12, 2) null,
                    status text not null,
                    turo_listing_id text null,
                    turo_listing_status text null,
                    current_odometer integer null,
                    current_odometer_recorded_at timestamptz null,
                    fleet_position_number text null,
                    notes text null,
                    created_at timestamptz not null,
                    updated_at timestamptz not null,
                    constraint vehicles_status_check check (
                        status in ('Active', 'Inactive', 'In Shop', 'Staging', 'Sold')
                    )
                );

                create index if not exists ix_vehicles_status
                    on kwestkarzbusinessdata.vehicles(status);
                """

            use! connection = dataSource.OpenConnectionAsync(cancellationToken)
            use command = new NpgsqlCommand(sql, connection)
            let! _ = command.ExecuteNonQueryAsync(cancellationToken)
            return ()
        }
