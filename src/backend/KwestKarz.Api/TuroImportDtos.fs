namespace KwestKarz.Api

open System

type TuroImportRecord =
    { Id: Guid
      OriginalFileName: string
      ImportedAt: DateTimeOffset
      RowCount: int
      InsertedCount: int
      UpdatedCount: int
      SkippedCount: int
      Notes: string option }

type TuroTripRecord =
    { Id: Guid
      ReservationId: string
      Guest: string option
      VehicleLabel: string option
      TripStart: DateTimeOffset option
      TripEnd: DateTimeOffset option
      TripStatus: string option
      CheckInOdometer: int option
      CheckOutOdometer: int option
      DistanceTraveled: int option
      TripDays: int option
      TripPrice: decimal option
      TotalEarnings: decimal option
      PickupLocation: string option
      ReturnLocation: string option }

type TuroTripImportVehicleSummary =
    { Vin: string option
      VehicleId: Guid option
      VehicleName: string option
      TuroVehicleId: string option
      ImportedTrips: int
      LatestOdometer: int option
      ImportedMiles: int }

type TuroTripImportResponse =
    { ImportId: Guid
      OriginalFileName: string
      RowCount: int
      InsertedCount: int
      UpdatedCount: int
      SkippedCount: int
      VehicleMatches: int
      VehicleSummaries: TuroTripImportVehicleSummary array }

type TuroMaintenanceSignal =
    { VehicleId: Guid option
      Vin: string option
      VehicleLabel: string
      ImportedTrips: int
      CompletedTrips: int
      ImportedMiles: int
      LatestTripEnd: DateTimeOffset option
      LatestImportedOdometer: int option
      LatestMaintenanceOdometer: int option
      MilesSinceLatestMaintenance: int option
      SuggestedActions: string array }
