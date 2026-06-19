namespace KwestKarz.Domain

open System
open System.Threading
open System.Threading.Tasks

type MaintenanceRecord =
    { Id: Guid
      VehicleId: Guid
      EventType: string
      DatePerformed: DateOnly
      Odometer: int option
      PerformedBy: string option
      Cost: decimal option
      NextDueDate: DateOnly option
      NextDueOdometer: int option
      Notes: string option
      CreatedAt: DateTimeOffset
      UpdatedAt: DateTimeOffset }

type NewMaintenanceRecord =
    { VehicleId: Guid
      EventType: string
      DatePerformed: DateOnly
      Odometer: int option
      PerformedBy: string option
      Cost: decimal option
      NextDueDate: DateOnly option
      NextDueOdometer: int option
      Notes: string option }

type MaintenanceDueStatus =
    | Ok
    | DueSoon
    | Overdue

module MaintenanceDueStatus =
    let toStorageValue status =
        match status with
        | Ok -> "OK"
        | DueSoon -> "Due Soon"
        | Overdue -> "Overdue"

type MaintenanceSummary =
    { Record: MaintenanceRecord
      DueStatus: MaintenanceDueStatus }

type IMaintenanceRepository =
    abstract member CreateAsync: record: NewMaintenanceRecord * cancellationToken: CancellationToken -> Task<MaintenanceRecord>
    abstract member ListForVehicleAsync: vehicleId: Guid * cancellationToken: CancellationToken -> Task<MaintenanceRecord list>
    abstract member ListRecentForVehicleAsync: vehicleId: Guid * limit: int * cancellationToken: CancellationToken -> Task<MaintenanceRecord list>
