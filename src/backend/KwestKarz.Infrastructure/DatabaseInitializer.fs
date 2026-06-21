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
                        kind in ('CarPhoto', 'Receipt', 'Obd2Report', 'Inspection', 'Registration', 'Insurance', 'LicensePlate', 'Other')
                    )
                );

                alter table kwestkarzbusinessdata.documents
                    add column if not exists content_bytes bytea null;

                alter table kwestkarzbusinessdata.documents
                    drop constraint if exists documents_kind_check;

                alter table kwestkarzbusinessdata.documents
                    add constraint documents_kind_check check (
                        kind in ('CarPhoto', 'Receipt', 'Obd2Report', 'Inspection', 'Registration', 'Insurance', 'LicensePlate', 'Other')
                    );

                create index if not exists ix_documents_owner
                    on kwestkarzbusinessdata.documents(owner_type, owner_id);

                create table if not exists kwestkarzbusinessdata.vehicle_compliance_records (
                    id uuid primary key,
                    vehicle_id uuid not null references kwestkarzbusinessdata.vehicles(id) on delete cascade,
                    record_type text not null,
                    provider text null,
                    policy_number text null,
                    document_number text null,
                    plate_number text null,
                    plate_state text null,
                    vin text null,
                    sticker_month text null,
                    sticker_year integer null,
                    serial_number text null,
                    effective_date date null,
                    expiration_date date null,
                    document_id uuid null references kwestkarzbusinessdata.documents(id) on delete set null,
                    notes text null,
                    created_at timestamptz not null,
                    updated_at timestamptz not null,
                    constraint vehicle_compliance_records_type_check check (
                        record_type in ('Registration', 'Insurance', 'LicensePlate')
                    )
                );

                create index if not exists ix_vehicle_compliance_records_vehicle
                    on kwestkarzbusinessdata.vehicle_compliance_records(vehicle_id, record_type, updated_at desc);

                alter table kwestkarzbusinessdata.vehicle_compliance_records
                    add column if not exists vin text null,
                    add column if not exists sticker_month text null,
                    add column if not exists sticker_year integer null,
                    add column if not exists serial_number text null;

                create table if not exists kwestkarzbusinessdata.system_logs (
                    id uuid primary key,
                    logged_at timestamptz not null,
                    level text not null,
                    source text not null,
                    method text null,
                    path text null,
                    status_code integer null,
                    elapsed_ms integer null,
                    message text null,
                    exception text null
                );

                create index if not exists ix_system_logs_logged_at
                    on kwestkarzbusinessdata.system_logs(logged_at desc);

                create table if not exists kwestkarzbusinessdata.scan_jobs (
                    id uuid primary key,
                    vehicle_id uuid null references kwestkarzbusinessdata.vehicles(id) on delete cascade,
                    scan_type text not null,
                    record_type text null,
                    status text not null,
                    message text null,
                    document_id uuid null references kwestkarzbusinessdata.documents(id) on delete set null,
                    result_record_id uuid null,
                    ai_text text null,
                    error text null,
                    created_at timestamptz not null,
                    updated_at timestamptz not null,
                    completed_at timestamptz null,
                    constraint scan_jobs_status_check check (
                        status in ('Queued', 'Processing', 'Succeeded', 'Failed')
                    )
                );

                create index if not exists ix_scan_jobs_vehicle
                    on kwestkarzbusinessdata.scan_jobs(vehicle_id, created_at desc);

                create index if not exists ix_scan_jobs_status
                    on kwestkarzbusinessdata.scan_jobs(status, updated_at desc);

                create table if not exists kwestkarzbusinessdata.workflow_instances (
                    id uuid primary key,
                    workflow_type text not null,
                    title text not null,
                    status text not null,
                    vehicle_id uuid null references kwestkarzbusinessdata.vehicles(id) on delete set null,
                    current_step_key text not null,
                    created_at timestamptz not null,
                    updated_at timestamptz not null,
                    completed_at timestamptz null,
                    canceled_at timestamptz null,
                    constraint workflow_instances_type_check check (
                        workflow_type in ('AddVehicle', 'RentalInspection', 'PreRentalInspection', 'PostRentalInspection', 'MaintenanceIntake', 'DamageReview', 'ComplianceRenewal', 'TechnicalCheck')
                    ),
                    constraint workflow_instances_status_check check (
                        status in ('Draft', 'InProgress', 'Waiting', 'Complete', 'Canceled')
                    )
                );

                create index if not exists ix_workflow_instances_status
                    on kwestkarzbusinessdata.workflow_instances(status, updated_at desc);

                create index if not exists ix_workflow_instances_vehicle
                    on kwestkarzbusinessdata.workflow_instances(vehicle_id, updated_at desc);

                alter table kwestkarzbusinessdata.workflow_instances
                    drop constraint if exists workflow_instances_type_check;

                alter table kwestkarzbusinessdata.workflow_instances
                    add constraint workflow_instances_type_check check (
                        workflow_type in ('AddVehicle', 'RentalInspection', 'PreRentalInspection', 'PostRentalInspection', 'MaintenanceIntake', 'DamageReview', 'ComplianceRenewal', 'TechnicalCheck')
                    );

                create table if not exists kwestkarzbusinessdata.workflow_steps (
                    id uuid primary key,
                    workflow_id uuid not null references kwestkarzbusinessdata.workflow_instances(id) on delete cascade,
                    step_key text not null,
                    title text not null,
                    status text not null,
                    sort_order integer not null,
                    data jsonb not null default '{}'::jsonb,
                    created_at timestamptz not null,
                    updated_at timestamptz not null,
                    constraint workflow_steps_status_check check (
                        status in ('NotStarted', 'InProgress', 'NeedsReview', 'Complete', 'Skipped', 'Problem')
                    )
                );

                create unique index if not exists ux_workflow_steps_workflow_step
                    on kwestkarzbusinessdata.workflow_steps(workflow_id, step_key);

                create index if not exists ix_workflow_steps_workflow
                    on kwestkarzbusinessdata.workflow_steps(workflow_id, sort_order);

                create table if not exists kwestkarzbusinessdata.workflow_events (
                    id uuid primary key,
                    workflow_id uuid not null references kwestkarzbusinessdata.workflow_instances(id) on delete cascade,
                    step_key text null,
                    event_type text not null,
                    message text null,
                    data jsonb not null default '{}'::jsonb,
                    created_at timestamptz not null
                );

                create index if not exists ix_workflow_events_workflow
                    on kwestkarzbusinessdata.workflow_events(workflow_id, created_at desc);

                create table if not exists kwestkarzbusinessdata.diagnostic_reports (
                    id uuid primary key,
                    vehicle_id uuid not null references kwestkarzbusinessdata.vehicles(id) on delete cascade,
                    workflow_id uuid null references kwestkarzbusinessdata.workflow_instances(id) on delete set null,
                    document_id uuid null references kwestkarzbusinessdata.documents(id) on delete set null,
                    reported_at timestamptz not null,
                    file_name text not null,
                    ai_summary text not null,
                    created_at timestamptz not null
                );

                create index if not exists ix_diagnostic_reports_vehicle
                    on kwestkarzbusinessdata.diagnostic_reports(vehicle_id, reported_at desc);

                create table if not exists kwestkarzbusinessdata.rental_inspections (
                    id uuid primary key,
                    workflow_id uuid null references kwestkarzbusinessdata.workflow_instances(id) on delete set null,
                    vehicle_id uuid not null references kwestkarzbusinessdata.vehicles(id) on delete cascade,
                    inspection_kind text not null,
                    odometer integer null,
                    fuel_level text null,
                    damage_found boolean null,
                    status text not null,
                    notes text null,
                    created_at timestamptz not null,
                    updated_at timestamptz not null,
                    constraint rental_inspections_kind_check check (
                        inspection_kind in ('Pre', 'Post', 'Both')
                    ),
                    constraint rental_inspections_status_check check (
                        status in ('Draft', 'NeedsReview', 'Complete')
                    )
                );

                create unique index if not exists ux_rental_inspections_workflow
                    on kwestkarzbusinessdata.rental_inspections(workflow_id)
                    where workflow_id is not null;

                create index if not exists ix_rental_inspections_vehicle
                    on kwestkarzbusinessdata.rental_inspections(vehicle_id, updated_at desc);

                create table if not exists kwestkarzbusinessdata.rental_inspection_photos (
                    id uuid primary key,
                    inspection_id uuid not null references kwestkarzbusinessdata.rental_inspections(id) on delete cascade,
                    slot_key text not null,
                    document_id uuid not null references kwestkarzbusinessdata.documents(id) on delete cascade,
                    notes text null,
                    created_at timestamptz not null,
                    constraint rental_inspection_photos_slot_check check (
                        slot_key in ('front', 'rear', 'driverSide', 'passengerSide', 'frontInterior', 'rearInterior', 'trunkCargo', 'odometerDashboard', 'damage')
                    )
                );

                create unique index if not exists ux_rental_inspection_photos_slot
                    on kwestkarzbusinessdata.rental_inspection_photos(inspection_id, slot_key);

                create table if not exists kwestkarzbusinessdata.turo_trip_earning_imports (
                    id uuid primary key,
                    original_file_name text not null,
                    imported_at timestamptz not null,
                    row_count integer not null,
                    inserted_count integer not null,
                    updated_count integer not null,
                    skipped_count integer not null,
                    notes text null
                );

                create table if not exists kwestkarzbusinessdata.turo_trip_earnings (
                    id uuid primary key,
                    reservation_id text not null unique,
                    vehicle_id uuid null references kwestkarzbusinessdata.vehicles(id) on delete set null,
                    import_id uuid not null references kwestkarzbusinessdata.turo_trip_earning_imports(id) on delete cascade,
                    guest text null,
                    vehicle_label text null,
                    vehicle_name text null,
                    turo_vehicle_id text null,
                    vin varchar(17) null,
                    trip_start timestamptz null,
                    trip_end timestamptz null,
                    pickup_location text null,
                    return_location text null,
                    trip_status text null,
                    check_in_odometer integer null,
                    check_out_odometer integer null,
                    distance_traveled integer null,
                    trip_days integer null,
                    trip_price numeric(12, 2) null,
                    total_earnings numeric(12, 2) null,
                    raw_data jsonb not null default '{}'::jsonb,
                    created_at timestamptz not null,
                    updated_at timestamptz not null
                );

                create index if not exists ix_turo_trip_earnings_vehicle
                    on kwestkarzbusinessdata.turo_trip_earnings(vehicle_id, trip_end desc);

                create index if not exists ix_turo_trip_earnings_vin
                    on kwestkarzbusinessdata.turo_trip_earnings(vin, trip_end desc);

                create index if not exists ix_turo_trip_earnings_status
                    on kwestkarzbusinessdata.turo_trip_earnings(trip_status);

                alter table if exists kwestkarzbusinessdata.maintenance_records
                    add column if not exists created_by text null;

                alter table if exists kwestkarzbusinessdata.workflow_events
                    add column if not exists created_by text null;

                alter table if exists kwestkarzbusinessdata.documents
                    add column if not exists created_by text null;

                create table if not exists kwestkarzbusinessdata.users (
                    id uuid primary key default gen_random_uuid(),
                    firebase_uid text not null unique,
                    phone text not null,
                    display_name text null,
                    role text not null default 'worker' check (role in ('admin', 'manager', 'worker')),
                    status text not null default 'pending',
                    created_at timestamptz not null default now(),
                    updated_at timestamptz not null default now()
                );

                create index if not exists ix_users_firebase_uid
                    on kwestkarzbusinessdata.users(firebase_uid);

                create table if not exists kwestkarzbusinessdata.jobs (
                    id uuid primary key default gen_random_uuid(),
                    title text not null,
                    description text null,
                    amount numeric(10,2) not null default 0,
                    status text not null default 'open' check (status in ('open', 'claimed', 'complete', 'canceled')),
                    created_by text not null,
                    claimed_by_id uuid null references kwestkarzbusinessdata.users(id),
                    claimed_at timestamptz null,
                    completed_at timestamptz null,
                    created_at timestamptz not null default now(),
                    updated_at timestamptz not null default now()
                );

                create index if not exists ix_jobs_status
                    on kwestkarzbusinessdata.jobs(status);

                create table if not exists kwestkarzbusinessdata.accounts (
                    id uuid primary key default gen_random_uuid(),
                    code text not null unique,
                    name text not null,
                    account_type text not null check (account_type in ('income', 'expense', 'asset', 'liability', 'equity')),
                    is_system boolean not null default false,
                    created_at timestamptz not null default now()
                );

                insert into kwestkarzbusinessdata.accounts (code, name, account_type, is_system) values
                    ('4000', 'Turo Rental Income',        'income',  true),
                    ('4100', 'Other Income',              'income',  true),
                    ('5000', 'Labor / Worker Wages',      'expense', true),
                    ('5100', 'Maintenance & Repairs',     'expense', true),
                    ('5200', 'Fuel',                      'expense', true),
                    ('5300', 'Insurance',                 'expense', true),
                    ('5400', 'Registration & Licensing',  'expense', true),
                    ('5500', 'Cleaning & Detailing',      'expense', true),
                    ('5600', 'Tires',                     'expense', true),
                    ('5700', 'Parts & Supplies',          'expense', true),
                    ('5800', 'Turo Platform Fees',        'expense', true),
                    ('5900', 'Miscellaneous Expense',     'expense', true)
                on conflict (code) do nothing;

                create table if not exists kwestkarzbusinessdata.ledger_entries (
                    id uuid primary key default gen_random_uuid(),
                    entry_date date not null,
                    description text not null,
                    account_id uuid not null references kwestkarzbusinessdata.accounts(id),
                    entry_type text not null check (entry_type in ('income', 'expense')),
                    amount numeric(12,2) not null check (amount > 0),
                    vehicle_id uuid null references kwestkarzbusinessdata.vehicles(id),
                    job_id uuid null references kwestkarzbusinessdata.jobs(id),
                    reference text null,
                    payment_status text null check (payment_status in ('unpaid', 'paid')),
                    paid_at timestamptz null,
                    paid_by text null,
                    created_by text not null,
                    created_at timestamptz not null default now()
                );

                create index if not exists ix_ledger_entry_date
                    on kwestkarzbusinessdata.ledger_entries(entry_date desc);

                create index if not exists ix_ledger_job_id
                    on kwestkarzbusinessdata.ledger_entries(job_id)
                    where job_id is not null;
                """

            use! connection = dataSource.OpenConnectionAsync(cancellationToken)
            use command = new NpgsqlCommand(sql, connection)
            let! _ = command.ExecuteNonQueryAsync(cancellationToken)
            return ()
        }
