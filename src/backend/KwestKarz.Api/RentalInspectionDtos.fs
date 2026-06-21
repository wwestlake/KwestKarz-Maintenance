namespace KwestKarz.Api

open System

type RentalInspectionPhotoResponse =
    { Id: Guid
      InspectionId: Guid
      SlotKey: string
      DocumentId: Guid
      Notes: string option
      CreatedAt: DateTimeOffset }

type RentalInspectionResponse =
    { Id: Guid
      WorkflowId: Guid option
      VehicleId: Guid
      InspectionKind: string
      Odometer: int option
      FuelLevel: string option
      DamageFound: bool option
      Status: string
      Notes: string option
      CreatedAt: DateTimeOffset
      UpdatedAt: DateTimeOffset
      Photos: RentalInspectionPhotoResponse array }

type SaveRentalInspectionRequest =
    { VehicleId: Guid option
      InspectionKind: string option
      Odometer: int option
      FuelLevel: string option
      DamageFound: bool option
      Status: string option
      Notes: string option }

type InspectionReportPhotoResponse =
    { SlotKey: string
      SlotLabel: string
      DocumentId: Guid
      Notes: string option }

type InspectionReportResponse =
    { InspectionId: Guid
      InspectionKind: string
      Status: string
      InspectedAt: DateTimeOffset
      Odometer: int option
      FuelLevel: string option
      DamageFound: bool option
      Notes: string option
      VehicleId: Guid
      VehicleYear: int option
      VehicleMake: string option
      VehicleModel: string option
      VehicleVin: string
      VehicleColor: string option
      VehiclePlate: string option
      VehiclePlateState: string option
      Photos: InspectionReportPhotoResponse array }
