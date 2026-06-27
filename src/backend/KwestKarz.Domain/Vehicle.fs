namespace KwestKarz.Domain

open System
open System.Threading
open System.Threading.Tasks

type VehicleStatus =
    | Active
    | Inactive
    | InShop
    | Staging
    | Sold

module VehicleStatus =
    let toStorageValue status =
        match status with
        | Active -> "Active"
        | Inactive -> "Inactive"
        | InShop -> "In Shop"
        | Staging -> "Staging"
        | Sold -> "Sold"

    let fromStorageValue value =
        match value with
        | "Active" -> Active
        | "Inactive" -> Inactive
        | "In Shop" -> InShop
        | "Staging" -> Staging
        | "Sold" -> Sold
        | _ -> invalidArg (nameof value) $"Unknown vehicle status: {value}"

type Vehicle =
    { Id: Guid
      Vin: string
      Year: int option
      Make: string option
      Model: string option
      Trim: string option
      Color: string option
      LicensePlate: string option
      LicensePlateState: string option
      AcquisitionDate: DateOnly option
      PurchasePrice: decimal option
      Status: VehicleStatus
      TuroListingId: string option
      TuroListingStatus: string option
      TuroListingUrl: string option
      CurrentOdometer: int option
      CurrentOdometerRecordedAt: DateTimeOffset option
      FleetPositionNumber: string option
      Notes: string option
      CreatedAt: DateTimeOffset
      UpdatedAt: DateTimeOffset }

type NewVehicle =
    { Vin: string
      Year: int option
      Make: string option
      Model: string option
      Trim: string option
      Color: string option
      LicensePlate: string option
      LicensePlateState: string option
      AcquisitionDate: DateOnly option
      PurchasePrice: decimal option
      Status: VehicleStatus
      TuroListingId: string option
      TuroListingStatus: string option
      TuroListingUrl: string option
      CurrentOdometer: int option
      CurrentOdometerRecordedAt: DateTimeOffset option
      FleetPositionNumber: string option
      Notes: string option }

type UpdateVehicle =
    { Color: string option
      LicensePlate: string option
      LicensePlateState: string option
      Status: VehicleStatus
      TuroListingUrl: string option
      CurrentOdometer: int option
      CurrentOdometerRecordedAt: DateTimeOffset option
      FleetPositionNumber: string option
      Notes: string option }

type IVehicleRepository =
    abstract member ListAsync: cancellationToken: CancellationToken -> Task<Vehicle list>
    abstract member FindByIdAsync: id: Guid * cancellationToken: CancellationToken -> Task<Vehicle option>
    abstract member FindByVinAsync: vin: string * cancellationToken: CancellationToken -> Task<Vehicle option>
    abstract member CreateAsync: vehicle: NewVehicle * cancellationToken: CancellationToken -> Task<Vehicle>
    abstract member UpdateAsync: id: Guid * update: UpdateVehicle * cancellationToken: CancellationToken -> Task<Vehicle option>
