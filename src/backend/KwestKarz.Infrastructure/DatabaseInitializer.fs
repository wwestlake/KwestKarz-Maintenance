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

                create table if not exists kwestkarzbusinessdata.documents (
                    id uuid primary key,
                    owner_type text not null,
                    owner_id uuid not null,
                    kind text not null,
                    original_file_name text not null,
                    content_type text not null,
                    storage_path text not null,
                    size_bytes bigint not null,
                    description text null,
                    created_at timestamptz not null,
                    constraint documents_owner_type_check check (
                        owner_type in ('Vehicle', 'MaintenanceRecord', 'DiagnosticReport', 'IncidentRecord')
                    ),
                    constraint documents_kind_check check (
                        kind in ('CarPhoto', 'Receipt', 'Obd2Report', 'Inspection', 'Insurance', 'Other')
                    )
                );

                create index if not exists ix_documents_owner
                    on kwestkarzbusinessdata.documents(owner_type, owner_id);
                """

            use! connection = dataSource.OpenConnectionAsync(cancellationToken)
            use command = new NpgsqlCommand(sql, connection)
            let! _ = command.ExecuteNonQueryAsync(cancellationToken)
            return ()
        }
