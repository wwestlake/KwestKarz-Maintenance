namespace KwestKarz.Api

open System
open KwestKarz.Domain

type CreateMaintenanceRecordRequest =
    { EventType: string
      DatePerformed: DateOnly
      Odometer: int option
      PerformedBy: string option
      Cost: decimal option
      NextDueDate: DateOnly option
      NextDueOdometer: int option
      Notes: string option }

module CreateMaintenanceRecordRequest =
    let toDomain vehicleId (request: CreateMaintenanceRecordRequest) =
        { VehicleId = vehicleId
          EventType = request.EventType
          DatePerformed = request.DatePerformed
          Odometer = request.Odometer
          PerformedBy = request.PerformedBy
          Cost = request.Cost
          NextDueDate = request.NextDueDate
          NextDueOdometer = request.NextDueOdometer
          Notes = request.Notes }

type MaintenanceRecordResponse =
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

module MaintenanceRecordResponse =
    let fromDomain (record: MaintenanceRecord) =
        { Id = record.Id
          VehicleId = record.VehicleId
          EventType = record.EventType
          DatePerformed = record.DatePerformed
          Odometer = record.Odometer
          PerformedBy = record.PerformedBy
          Cost = record.Cost
          NextDueDate = record.NextDueDate
          NextDueOdometer = record.NextDueOdometer
          Notes = record.Notes
          CreatedAt = record.CreatedAt
          UpdatedAt = record.UpdatedAt }

type MaintenanceSummaryResponse =
    { Record: MaintenanceRecordResponse
      DueStatus: string }

type MaintenanceReceiptResponse =
    { Document: DocumentResponse
      AiText: string }

type VehicleDashboardResponse =
    { Vehicle: VehicleResponse
      CurrentLockBox: LockBoxResponse option
      Compliance: ComplianceRecordResponse array
      Documents: DocumentResponse array
      RecentMaintenance: MaintenanceRecordResponse array
      NextDue: MaintenanceSummaryResponse option
      AiContextSummary: string }
