namespace KwestKarz.Api

open System
open KwestKarz.Domain

module MaintenanceLogic =
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
