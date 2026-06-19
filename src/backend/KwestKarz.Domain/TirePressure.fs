namespace KwestKarz.Domain

open System
open System.Threading
open System.Threading.Tasks

type TirePressureStatus =
    | Green
    | Yellow
    | Red

module TirePressureStatus =
    let toStorageValue status =
        match status with
        | Green -> "Green"
        | Yellow -> "Yellow"
        | Red -> "Red"

    let fromStorageValue value =
        match value with
        | "Green" -> Green
        | "Yellow" -> Yellow
        | "Red" -> Red
        | _ -> invalidArg (nameof value) $"Unknown tire pressure status: {value}"

type TirePressureSpec =
    { VehicleId: Guid
      FrontPsi: int option
      RearPsi: int option
      Notes: string option
      PhotoDocumentId: Guid option
      CreatedAt: DateTimeOffset
      UpdatedAt: DateTimeOffset }

type UpsertTirePressureSpec =
    { VehicleId: Guid
      FrontPsi: int option
      RearPsi: int option
      Notes: string option
      PhotoDocumentId: Guid option }

type TirePressureLog =
    { Id: Guid
      VehicleId: Guid
      MeasuredAt: DateTimeOffset
      FrontLeftPsi: int option
      FrontRightPsi: int option
      RearLeftPsi: int option
      RearRightPsi: int option
      Status: TirePressureStatus
      Notes: string option
      PhotoDocumentId: Guid option
      CreatedAt: DateTimeOffset }

type NewTirePressureLog =
    { VehicleId: Guid
      MeasuredAt: DateTimeOffset
      FrontLeftPsi: int option
      FrontRightPsi: int option
      RearLeftPsi: int option
      RearRightPsi: int option
      Notes: string option
      PhotoDocumentId: Guid option }

type TirePressureSnapshot =
    { Spec: TirePressureSpec option
      RecentLogs: TirePressureLog list }

type ITirePressureRepository =
    abstract member GetSnapshotAsync: vehicleId: Guid * cancellationToken: CancellationToken -> Task<TirePressureSnapshot>
    abstract member UpsertSpecAsync: spec: UpsertTirePressureSpec * cancellationToken: CancellationToken -> Task<TirePressureSpec>
    abstract member CreateLogAsync: log: NewTirePressureLog * cancellationToken: CancellationToken -> Task<TirePressureLog>
