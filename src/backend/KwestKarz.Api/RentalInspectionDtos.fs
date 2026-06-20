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
