namespace KwestKarz.Api

open System

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
