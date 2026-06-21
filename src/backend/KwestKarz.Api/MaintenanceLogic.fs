namespace KwestKarz.Api

open System
open System.IO
open System.Text
open KwestKarz.Domain
open UglyToad.PdfPig

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

    let truncate (max: int) (s: string) =
        if s.Length <= max then s else s.[..max - 1]

    let richAiContext
        (vehicle: Vehicle)
        (maintenance: MaintenanceRecord list)
        (nextDueItem: MaintenanceSummary option)
        (diagnosticReports: DiagnosticReport list)
        (documents: StoredDocument list) =

        let nl = System.Environment.NewLine

        let vehicleSection =
            let year = vehicle.Year |> Option.map string |> Option.defaultValue "unknown"
            let make = vehicle.Make |> Option.defaultValue "unknown"
            let model = vehicle.Model |> Option.defaultValue "unknown"
            let trim = vehicle.Trim |> Option.defaultValue ""
            let odometer = vehicle.CurrentOdometer |> Option.map (fun o -> $"{o:N0} miles") |> Option.defaultValue "unknown"
            let plate = vehicle.LicensePlate |> Option.defaultValue "unknown"
            let state = vehicle.LicensePlateState |> Option.defaultValue ""
            $"VEHICLE: {year} {make} {model} {trim} | VIN: {vehicle.Vin} | Odometer: {odometer} | Plate: {plate} {state} | Status: {VehicleStatus.toStorageValue vehicle.Status}"

        let maintenanceSection =
            if List.isEmpty maintenance then
                "MAINTENANCE HISTORY: No records logged."
            else
                let rows =
                    maintenance
                    |> List.truncate 20
                    |> List.map (fun r ->
                        let odo = r.Odometer |> Option.map (fun o -> $" @ {o:N0} mi") |> Option.defaultValue ""
                        let cost = r.Cost |> Option.map (fun c -> $" ${c:F2}") |> Option.defaultValue ""
                        let notes = r.Notes |> Option.map (fun n -> $" — {truncate 120 n}") |> Option.defaultValue ""
                        $"  • {r.DatePerformed} {r.EventType}{odo}{cost}{notes}")
                    |> String.concat nl
                $"MAINTENANCE HISTORY (most recent first):{nl}{rows}"

        let dueSection =
            match nextDueItem with
            | None -> "NEXT DUE: Nothing scheduled."
            | Some s ->
                let dueDate = s.Record.NextDueDate |> Option.map string |> Option.defaultValue "—"
                let dueOdo = s.Record.NextDueOdometer |> Option.map (fun o -> $"{o:N0} mi") |> Option.defaultValue "—"
                let status = MaintenanceDueStatus.toStorageValue s.DueStatus
                $"NEXT DUE: {s.Record.EventType} [{status}] — date: {dueDate}, odometer: {dueOdo}"

        let obd2Section =
            if List.isEmpty diagnosticReports then
                "OBD2 REPORTS: None on file."
            else
                let rows =
                    diagnosticReports
                    |> List.truncate 3
                    |> List.map (fun r ->
                        $"  • {r.ReportedAt:u} {r.FileName}{nl}    {truncate 400 r.AiSummary}")
                    |> String.concat nl
                $"OBD2 DIAGNOSTIC REPORTS (most recent first):{nl}{rows}"

        let documentSection =
            if List.isEmpty documents then
                "DOCUMENTS: None attached."
            else
                let rows =
                    documents
                    |> List.truncate 10
                    |> List.map (fun d -> $"  • {DocumentKind.toStorageValue d.Kind}: {d.OriginalFileName} ({d.SizeBytes} bytes)")
                    |> String.concat nl
                $"DOCUMENTS:{nl}{rows}"

        String.concat (nl + nl) [| vehicleSection; maintenanceSection; dueSection; obd2Section; documentSection |]

    let extractPdfText (contentBytes: byte array) =
        use stream = new MemoryStream(contentBytes)
        use document = PdfDocument.Open(stream)
        let builder = StringBuilder()

        for page in document.GetPages() do
            builder.AppendLine($"--- Page {page.Number} ---") |> ignore
            builder.AppendLine(page.Text) |> ignore

        builder.ToString().Trim()

    let obd2Prompt (fileName: string) (pdfText: string) =
        $"""
Read this OBD2 diagnostic scan report text from {fileName}. Return JSON only with fields:
vin, odometer, scanDate, scanner, reportStatus, codes, readiness, freezeFrame, summary, severity, recommendedActions, notes.

codes must be an array of objects with module, code, description, status, severity, recommendedAction.
readiness must list any monitor/readiness results visible in the report.
severity must be Green, Yellow, or Red.
Use Green only when no diagnostic trouble codes or readiness problems are shown.
Use Yellow for stored/pending/history issues needing review.
Use Red for active drivability, safety, emissions, ABS, airbag/SRS, brake, overheating, or charging faults.
Do not invent missing data. If the text is incomplete or OCR/PDF extraction is messy, explain uncertainty in notes.

Report text:
{truncate 18000 pdfText}
"""
