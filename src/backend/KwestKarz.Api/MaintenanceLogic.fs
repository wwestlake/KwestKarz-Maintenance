namespace KwestKarz.Api

open System
open KwestKarz.Domain

type ServiceSchedule =
    { EventType: string        // display name used in suggestions
      MileInterval: int option // miles between services
      DayInterval: int option  // calendar days between services
      WarnMilesOut: int        // start warning this many miles before due
      WarnDaysOut: int }       // start warning this many days before due

module MaintenanceLogic =

    let defaultServiceSchedules: ServiceSchedule list =
        [ { EventType = "Oil Change"; MileInterval = Some 5000; DayInterval = Some 180; WarnMilesOut = 500; WarnDaysOut = 14 }
          { EventType = "Tire Rotation"; MileInterval = Some 7500; DayInterval = None; WarnMilesOut = 500; WarnDaysOut = 0 }
          { EventType = "Air Filter"; MileInterval = Some 15000; DayInterval = None; WarnMilesOut = 1000; WarnDaysOut = 0 }
          { EventType = "Cabin Air Filter"; MileInterval = Some 15000; DayInterval = None; WarnMilesOut = 1000; WarnDaysOut = 0 }
          { EventType = "Brake Inspection"; MileInterval = Some 20000; DayInterval = Some 365; WarnMilesOut = 2000; WarnDaysOut = 30 }
          { EventType = "Transmission Service"; MileInterval = Some 30000; DayInterval = None; WarnMilesOut = 2000; WarnDaysOut = 0 }
          { EventType = "Coolant Flush"; MileInterval = Some 30000; DayInterval = Some 730; WarnMilesOut = 2000; WarnDaysOut = 30 }
          { EventType = "Spark Plugs"; MileInterval = Some 30000; DayInterval = None; WarnMilesOut = 2000; WarnDaysOut = 0 }
          { EventType = "Wiper Blades"; MileInterval = None; DayInterval = Some 365; WarnMilesOut = 0; WarnDaysOut = 30 }
          { EventType = "Car Wash"; MileInterval = None; DayInterval = Some 7; WarnMilesOut = 0; WarnDaysOut = 1 } ]

    // serviceHistory keys are lowercase event_type strings
    // values are (lastDatePerformed, lastOdometer option)
    let predictMaintenanceActions
        (schedules: ServiceSchedule list)
        (today: DateOnly)
        (currentOdometer: int option)
        (serviceHistory: Map<string, DateOnly * int option>)
        : string array =
        schedules
        |> List.choose (fun s ->
            let key = s.EventType.ToLowerInvariant()
            let lastDate, lastOdometer =
                match serviceHistory |> Map.tryFind key with
                | Some(d, o) -> Some d, o
                | None -> None, None

            let mileAlert =
                match s.MileInterval, currentOdometer with
                | Some interval, Some current ->
                    match lastOdometer with
                    | Some last ->
                        let due = last + interval
                        if current >= due then
                            Some $"overdue by {current - due:N0} mi"
                        elif current >= due - s.WarnMilesOut then
                            Some $"due in {due - current:N0} mi"
                        else None
                    | None ->
                        if current >= interval then Some "no service record — confirm last service"
                        else None
                | _ -> None

            let dateAlert =
                match s.DayInterval, lastDate with
                | Some days, Some last ->
                    let due = last.AddDays(days)
                    let daysOver = today.DayNumber - due.DayNumber
                    if today >= due then
                        let plural = if daysOver = 1 then "" else "s"
                        Some $"overdue by {daysOver} day{plural}"
                    elif today.DayNumber >= due.DayNumber - s.WarnDaysOut then
                        let daysLeft = due.DayNumber - today.DayNumber
                        let plural = if daysLeft = 1 then "" else "s"
                        Some $"due in {daysLeft} day{plural}"
                    else None
                | _ -> None

            match mileAlert, dateAlert with
            | Some m, Some d -> Some $"{s.EventType}: {m}; {d}"
            | Some m, None -> Some $"{s.EventType}: {m}"
            | None, Some d -> Some $"{s.EventType}: {d}"
            | None, None -> None)
        |> List.toArray

    let dueStatus (today: DateOnly) (currentOdometer: int option) (record: MaintenanceRecord) =
        let dateStatus =
            match record.NextDueDate with
            | None -> MaintenanceDueStatus.Ok
            | Some dueDate when dueDate < today -> MaintenanceDueStatus.Overdue
            | Some dueDate when dueDate <= today.AddDays(14) -> MaintenanceDueStatus.DueSoon
            | Some _ -> MaintenanceDueStatus.Ok

        let odometerStatus =
            match record.NextDueOdometer, currentOdometer with
            | Some dueOdometer, Some odometer when odometer >= dueOdometer -> MaintenanceDueStatus.Overdue
            | Some dueOdometer, Some odometer when odometer >= dueOdometer - 500 -> MaintenanceDueStatus.DueSoon
            | _ -> MaintenanceDueStatus.Ok

        match dateStatus, odometerStatus with
        | MaintenanceDueStatus.Overdue, _
        | _, MaintenanceDueStatus.Overdue -> MaintenanceDueStatus.Overdue
        | MaintenanceDueStatus.DueSoon, _
        | _, MaintenanceDueStatus.DueSoon -> MaintenanceDueStatus.DueSoon
        | _ -> MaintenanceDueStatus.Ok

    let nextDue today currentOdometer (records: MaintenanceRecord list) =
        records
        |> List.filter (fun record -> record.NextDueDate.IsSome || record.NextDueOdometer.IsSome)
        |> List.map (fun (record: MaintenanceRecord) -> { Record = record; DueStatus = dueStatus today currentOdometer record })
        |> List.sortBy (fun summary ->
            let severity =
                match summary.DueStatus with
                | MaintenanceDueStatus.Overdue -> 0
                | MaintenanceDueStatus.DueSoon -> 1
                | MaintenanceDueStatus.Ok -> 2

            severity,
            summary.Record.NextDueDate |> Option.defaultValue DateOnly.MaxValue,
            summary.Record.NextDueOdometer |> Option.defaultValue Int32.MaxValue)
        |> List.tryHead

    let dashboardContext (vehicle: Vehicle) (documents: StoredDocument list) (maintenance: MaintenanceRecord list) nextDueItem =
        let year = vehicle.Year |> Option.map string |> Option.defaultValue "Unknown year"
        let make = vehicle.Make |> Option.defaultValue "Unknown make"
        let model = vehicle.Model |> Option.defaultValue "Unknown model"

        let vehicleLine =
            $"{year} {make} {model} VIN {vehicle.Vin}"

        let dueLine =
            match nextDueItem with
            | None -> "No upcoming maintenance due item is recorded."
            | Some summary ->
                let dueDate = summary.Record.NextDueDate |> Option.map string |> Option.defaultValue "none"
                let dueOdometer = summary.Record.NextDueOdometer |> Option.map string |> Option.defaultValue "none"
                let status = MaintenanceDueStatus.toStorageValue summary.DueStatus
                $"Next due: {summary.Record.EventType}, status {status}, due date {dueDate}, due odometer {dueOdometer}."

        let maintenanceLine =
            if List.isEmpty maintenance then
                "No maintenance records are logged yet."
            else
                let latest = maintenance |> List.head
                let odometer = latest.Odometer |> Option.map string |> Option.defaultValue "unknown"
                $"Latest maintenance: {latest.EventType} on {latest.DatePerformed} at odometer {odometer}."

        let documentLine =
            $"Attached documents: {documents.Length}."

        String.Join(" ", [| vehicleLine; dueLine; maintenanceLine; documentLine |])
