namespace KwestKarz.Api

open System
open KwestKarz.Domain

type CreateVehicleRequest =
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
      Status: string option
      TuroListingId: string option
      TuroListingStatus: string option
      TuroListingUrl: string option
      CurrentOdometer: int option
      CurrentOdometerRecordedAt: DateTimeOffset option
      FleetPositionNumber: string option
      Notes: string option }

module CreateVehicleRequest =
    let toDomain (request: CreateVehicleRequest) : NewVehicle =
        { Vin = request.Vin
          Year = request.Year
          Make = request.Make
          Model = request.Model
          Trim = request.Trim
          Color = request.Color
          LicensePlate = request.LicensePlate
          LicensePlateState = request.LicensePlateState
          AcquisitionDate = request.AcquisitionDate
          PurchasePrice = request.PurchasePrice
          Status = request.Status |> Option.map VehicleStatus.fromStorageValue |> Option.defaultValue VehicleStatus.Active
          TuroListingId = request.TuroListingId
          TuroListingStatus = request.TuroListingStatus
          TuroListingUrl = request.TuroListingUrl
          CurrentOdometer = request.CurrentOdometer
          CurrentOdometerRecordedAt = request.CurrentOdometerRecordedAt
          FleetPositionNumber = request.FleetPositionNumber
          Notes = request.Notes }

type UpdateVehicleRequest =
    { Color: string option
      LicensePlate: string option
      LicensePlateState: string option
      Status: string option
      TuroListingUrl: string option
      CurrentOdometer: int option
      CurrentOdometerRecordedAt: DateTimeOffset option
      FleetPositionNumber: string option
      Notes: string option }

module UpdateVehicleRequest =
    let toDomain (request: UpdateVehicleRequest) : UpdateVehicle =
        { Color = request.Color
          LicensePlate = request.LicensePlate
          LicensePlateState = request.LicensePlateState
          Status = request.Status |> Option.map VehicleStatus.fromStorageValue |> Option.defaultValue VehicleStatus.Active
          TuroListingUrl = request.TuroListingUrl
          CurrentOdometer = request.CurrentOdometer
          CurrentOdometerRecordedAt = request.CurrentOdometerRecordedAt
          FleetPositionNumber = request.FleetPositionNumber
          Notes = request.Notes }

type VehicleResponse =
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
      Status: string
      TuroListingId: string option
      TuroListingStatus: string option
      TuroListingUrl: string option
      CurrentOdometer: int option
      CurrentOdometerRecordedAt: DateTimeOffset option
      FleetPositionNumber: string option
      Notes: string option
      CreatedAt: DateTimeOffset
      UpdatedAt: DateTimeOffset }

module VehicleResponse =
    let fromDomain (vehicle: Vehicle) : VehicleResponse =
        { Id = vehicle.Id
          Vin = vehicle.Vin
          Year = vehicle.Year
          Make = vehicle.Make
          Model = vehicle.Model
          Trim = vehicle.Trim
          Color = vehicle.Color
          LicensePlate = vehicle.LicensePlate
          LicensePlateState = vehicle.LicensePlateState
          AcquisitionDate = vehicle.AcquisitionDate
          PurchasePrice = vehicle.PurchasePrice
          Status = VehicleStatus.toStorageValue vehicle.Status
          TuroListingId = vehicle.TuroListingId
          TuroListingStatus = vehicle.TuroListingStatus
          TuroListingUrl = vehicle.TuroListingUrl
          CurrentOdometer = vehicle.CurrentOdometer
          CurrentOdometerRecordedAt = vehicle.CurrentOdometerRecordedAt
          FleetPositionNumber = vehicle.FleetPositionNumber
          Notes = vehicle.Notes
          CreatedAt = vehicle.CreatedAt
          UpdatedAt = vehicle.UpdatedAt }

type PublicVehicleResponse =
    { Id: Guid
      Year: int option
      Make: string option
      Model: string option
      Trim: string option
      Color: string option
      Status: string
      TuroListingStatus: string option
      TuroListingUrl: string option
      FleetPositionNumber: string option }

module PublicVehicleResponse =
    let fromDomain (vehicle: Vehicle) : PublicVehicleResponse =
        { Id = vehicle.Id
          Year = vehicle.Year
          Make = vehicle.Make
          Model = vehicle.Model
          Trim = vehicle.Trim
          Color = vehicle.Color
          Status = VehicleStatus.toStorageValue vehicle.Status
          TuroListingStatus = vehicle.TuroListingStatus
          TuroListingUrl = vehicle.TuroListingUrl
          FleetPositionNumber = vehicle.FleetPositionNumber }
