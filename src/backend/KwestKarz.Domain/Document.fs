namespace KwestKarz.Domain

open System
open System.Threading
open System.Threading.Tasks

type DocumentOwnerType =
    | Vehicle
    | MaintenanceRecord
    | DiagnosticReport
    | IncidentRecord

module DocumentOwnerType =
    let toStorageValue ownerType =
        match ownerType with
        | Vehicle -> "Vehicle"
        | MaintenanceRecord -> "MaintenanceRecord"
        | DiagnosticReport -> "DiagnosticReport"
        | IncidentRecord -> "IncidentRecord"

    let fromStorageValue value =
        match value with
        | "Vehicle" -> Vehicle
        | "MaintenanceRecord" -> MaintenanceRecord
        | "DiagnosticReport" -> DiagnosticReport
        | "IncidentRecord" -> IncidentRecord
        | _ -> invalidArg (nameof value) $"Unknown document owner type: {value}"

type DocumentKind =
    | CarPhoto
    | Receipt
    | Obd2Report
    | Inspection
    | Registration
    | Insurance
    | LicensePlate
    | Other

module DocumentKind =
    let toStorageValue kind =
        match kind with
        | CarPhoto -> "CarPhoto"
        | Receipt -> "Receipt"
        | Obd2Report -> "Obd2Report"
        | Inspection -> "Inspection"
        | Registration -> "Registration"
        | Insurance -> "Insurance"
        | LicensePlate -> "LicensePlate"
        | Other -> "Other"

    let fromStorageValue value =
        match value with
        | "CarPhoto" -> CarPhoto
        | "Receipt" -> Receipt
        | "Obd2Report" -> Obd2Report
        | "Inspection" -> Inspection
        | "Registration" -> Registration
        | "Insurance" -> Insurance
        | "LicensePlate" -> LicensePlate
        | "Other" -> Other
        | _ -> invalidArg (nameof value) $"Unknown document kind: {value}"

type StoredDocument =
    { Id: Guid
      OwnerType: DocumentOwnerType
      OwnerId: Guid
      Kind: DocumentKind
      OriginalFileName: string
      ContentType: string
      StoragePath: string
      SizeBytes: int64
      Description: string option
      CreatedBy: string option
      CreatedAt: DateTimeOffset }

type NewStoredDocument =
    { OwnerType: DocumentOwnerType
      OwnerId: Guid
      Kind: DocumentKind
      OriginalFileName: string
      ContentType: string
      StoragePath: string
      SizeBytes: int64
      Description: string option
      CreatedBy: string option
      ContentBytes: byte array option }

type StoredDocumentContent =
    { Document: StoredDocument
      ContentBytes: byte array option }

type IDocumentRepository =
    abstract member CreateAsync: document: NewStoredDocument * cancellationToken: CancellationToken -> Task<StoredDocument>
    abstract member FindAsync: id: Guid * cancellationToken: CancellationToken -> Task<StoredDocument option>
    abstract member FindContentAsync: id: Guid * cancellationToken: CancellationToken -> Task<StoredDocumentContent option>
    abstract member ListForOwnerAsync: ownerType: DocumentOwnerType * ownerId: Guid * cancellationToken: CancellationToken -> Task<StoredDocument list>
