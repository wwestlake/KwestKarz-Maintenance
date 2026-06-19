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

                create table if not exists kwestkarzbusinessdata.lock_boxes (
                    id uuid primary key,
                    box_number integer not null unique,
                    serial_number text null,
                    combo text not null,
                    style text not null,
                    status text not null,
                    notes text null,
                    created_at timestamptz not null,
                    updated_at timestamptz not null,
                    constraint lock_boxes_number_check check (
                        box_number > 0 and box_number <> 13
                    ),
                    constraint lock_boxes_style_check check (
                        style in ('Mechanical Keypad', 'Dial', 'Other')
                    ),
                    constraint lock_boxes_status_check check (
                        status in ('Available', 'Assigned', 'Lost', 'Retired')
                    )
                );

                create index if not exists ix_lock_boxes_status
                    on kwestkarzbusinessdata.lock_boxes(status);

                create table if not exists kwestkarzbusinessdata.lock_box_assignments (
                    id uuid primary key,
                    lock_box_id uuid not null references kwestkarzbusinessdata.lock_boxes(id) on delete cascade,
                    vehicle_id uuid not null references kwestkarzbusinessdata.vehicles(id) on delete cascade,
                    assigned_at timestamptz not null,
                    unassigned_at timestamptz null,
                    notes text null
                );

                create unique index if not exists ux_lock_box_assignments_current_box
                    on kwestkarzbusinessdata.lock_box_assignments(lock_box_id)
                    where unassigned_at is null;

                create unique index if not exists ux_lock_box_assignments_current_vehicle
                    on kwestkarzbusinessdata.lock_box_assignments(vehicle_id)
                    where unassigned_at is null;

                create index if not exists ix_lock_box_assignments_vehicle
                    on kwestkarzbusinessdata.lock_box_assignments(vehicle_id, assigned_at desc);

                insert into kwestkarzbusinessdata.lock_boxes (
                    id, box_number, combo, style, status, notes, created_at, updated_at
                )
                select ('00000000-0000-0000-0000-' || lpad(box_number::text, 12, '0'))::uuid,
                       box_number, '',
                       case when box_number in (14, 15, 16) then 'Dial' else 'Mechanical Keypad' end,
                       'Available',
                       'Seeded starter inventory. Box 13 intentionally skipped.', now(), now()
                from (values
                    (1), (2), (3), (4), (5), (6), (7), (8),
                    (9), (10), (11), (12), (14), (15), (16)
                ) as seed(box_number)
                on conflict (box_number) do nothing;

                update kwestkarzbusinessdata.lock_boxes
                set style = case when box_number in (14, 15, 16) then 'Dial' else 'Mechanical Keypad' end,
                    updated_at = now()
                where (box_number between 1 and 12 and style <> 'Mechanical Keypad')
                   or (box_number in (14, 15, 16) and style <> 'Dial');

                create table if not exists kwestkarzbusinessdata.maintenance_records (
                    id uuid primary key,
                    vehicle_id uuid not null references kwestkarzbusinessdata.vehicles(id) on delete cascade,
                    event_type text not null,
                    date_performed date not null,
                    odometer integer null,
                    performed_by text null,
                    cost numeric(12, 2) null,
                    next_due_date date null,
                    next_due_odometer integer null,
                    notes text null,
                    created_at timestamptz not null,
                    updated_at timestamptz not null
                );

                create index if not exists ix_maintenance_records_vehicle
                    on kwestkarzbusinessdata.maintenance_records(vehicle_id, date_performed desc, created_at desc);

                create table if not exists kwestkarzbusinessdata.tire_pressure_specs (
                    vehicle_id uuid primary key references kwestkarzbusinessdata.vehicles(id) on delete cascade,
                    front_psi integer null,
                    rear_psi integer null,
                    front_left_psi integer null,
                    front_right_psi integer null,
                    rear_left_psi integer null,
                    rear_right_psi integer null,
                    notes text null,
                    photo_document_id uuid null,
                    created_at timestamptz not null,
                    updated_at timestamptz not null,
                    constraint tire_pressure_specs_front_check check (front_psi is null or front_psi between 15 and 80),
                    constraint tire_pressure_specs_rear_check check (rear_psi is null or rear_psi between 15 and 80),
                    constraint tire_pressure_specs_fl_check check (front_left_psi is null or front_left_psi between 15 and 80),
                    constraint tire_pressure_specs_fr_check check (front_right_psi is null or front_right_psi between 15 and 80),
                    constraint tire_pressure_specs_rl_check check (rear_left_psi is null or rear_left_psi between 15 and 80),
                    constraint tire_pressure_specs_rr_check check (rear_right_psi is null or rear_right_psi between 15 and 80)
                );

                alter table kwestkarzbusinessdata.tire_pressure_specs
                    add column if not exists front_left_psi integer null,
                    add column if not exists front_right_psi integer null,
                    add column if not exists rear_left_psi integer null,
                    add column if not exists rear_right_psi integer null;

                update kwestkarzbusinessdata.tire_pressure_specs
                set front_left_psi = coalesce(front_left_psi, front_psi),
                    front_right_psi = coalesce(front_right_psi, front_psi),
                    rear_left_psi = coalesce(rear_left_psi, rear_psi),
                    rear_right_psi = coalesce(rear_right_psi, rear_psi)
                where front_left_psi is null
                   or front_right_psi is null
                   or rear_left_psi is null
                   or rear_right_psi is null;

                create table if not exists kwestkarzbusinessdata.tire_pressure_logs (
                    id uuid primary key,
                    vehicle_id uuid not null references kwestkarzbusinessdata.vehicles(id) on delete cascade,
                    measured_at timestamptz not null,
                    front_left_psi integer null,
                    front_right_psi integer null,
                    rear_left_psi integer null,
                    rear_right_psi integer null,
                    status text not null,
                    notes text null,
                    photo_document_id uuid null,
                    created_at timestamptz not null,
                    constraint tire_pressure_logs_status_check check (status in ('Green', 'Yellow', 'Red')),
                    constraint tire_pressure_logs_fl_check check (front_left_psi is null or front_left_psi between 0 and 100),
                    constraint tire_pressure_logs_fr_check check (front_right_psi is null or front_right_psi between 0 and 100),
                    constraint tire_pressure_logs_rl_check check (rear_left_psi is null or rear_left_psi between 0 and 100),
                    constraint tire_pressure_logs_rr_check check (rear_right_psi is null or rear_right_psi between 0 and 100)
                );

                create index if not exists ix_tire_pressure_logs_vehicle
                    on kwestkarzbusinessdata.tire_pressure_logs(vehicle_id, measured_at desc, created_at desc);

                create table if not exists kwestkarzbusinessdata.documents (
                    id uuid primary key,
                    owner_type text not null,
                    owner_id uuid not null,
                    kind text not null,
                    original_file_name text not null,
                    content_type text not null,
                    storage_path text not null,
                    size_bytes bigint not null,
                    content_bytes bytea null,
                    description text null,
                    created_at timestamptz not null,
                    constraint documents_owner_type_check check (
                        owner_type in ('Vehicle', 'MaintenanceRecord', 'DiagnosticReport', 'IncidentRecord')
                    ),
                    constraint documents_kind_check check (
                        kind in ('CarPhoto', 'Receipt', 'Obd2Report', 'Inspection', 'Insurance', 'Other')
                    )
                );

                alter table kwestkarzbusinessdata.documents
                    add column if not exists content_bytes bytea null;

                create index if not exists ix_documents_owner
                    on kwestkarzbusinessdata.documents(owner_type, owner_id);
                """

            use! connection = dataSource.OpenConnectionAsync(cancellationToken)
            use command = new NpgsqlCommand(sql, connection)
            let! _ = command.ExecuteNonQueryAsync(cancellationToken)
            return ()
        }
