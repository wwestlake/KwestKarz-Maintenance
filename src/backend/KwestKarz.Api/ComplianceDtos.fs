namespace KwestKarz.Api

open System

type ComplianceRecordResponse =
    { Id: Guid
      VehicleId: Guid
      RecordType: string
      Provider: string option
      PolicyNumber: string option
      DocumentNumber: string option
      PlateNumber: string option
      PlateState: string option
      Vin: string option
      StickerMonth: string option
      StickerYear: int option
      SerialNumber: string option
      EffectiveDate: DateOnly option
      ExpirationDate: DateOnly option
      DocumentId: Guid option
      Notes: string option
      DueStatus: string
      CreatedAt: DateTimeOffset
      UpdatedAt: DateTimeOffset }

type CompliancePhotoScanResponse =
    { Record: ComplianceRecordResponse
      AiText: string }

type PhotoScanJobResponse =
    { Id: Guid
      VehicleId: Guid option
      ScanType: string
      RecordType: string option
      Status: string
      Message: string option
      DocumentId: Guid option
      ResultRecordId: Guid option
      AiText: string option
      Error: string option
      CreatedAt: DateTimeOffset
      UpdatedAt: DateTimeOffset
      CompletedAt: DateTimeOffset option }

type UpdateComplianceRecordRequest =
    { Provider: string option
      PolicyNumber: string option
      DocumentNumber: string option
      PlateNumber: string option
      PlateState: string option
      Vin: string option
      StickerMonth: string option
      StickerYear: int option
      SerialNumber: string option
      EffectiveDate: DateOnly option
      ExpirationDate: DateOnly option
      Notes: string option }
