namespace KwestKarz.Api

open System
open KwestKarz.Domain

type TirePressureSpecResponse =
    { VehicleId: Guid
      FrontLeftPsi: int option
      FrontRightPsi: int option
      RearLeftPsi: int option
      RearRightPsi: int option
      Notes: string option
      PhotoDocumentId: Guid option
      CreatedAt: DateTimeOffset
      UpdatedAt: DateTimeOffset }

module TirePressureSpecResponse =
    let fromDomain (spec: TirePressureSpec) =
        { VehicleId = spec.VehicleId
          FrontLeftPsi = spec.FrontLeftPsi
          FrontRightPsi = spec.FrontRightPsi
          RearLeftPsi = spec.RearLeftPsi
          RearRightPsi = spec.RearRightPsi
          Notes = spec.Notes
          PhotoDocumentId = spec.PhotoDocumentId
          CreatedAt = spec.CreatedAt
          UpdatedAt = spec.UpdatedAt }

type TirePressureLogResponse =
    { Id: Guid
      VehicleId: Guid
      MeasuredAt: DateTimeOffset
      FrontLeftPsi: int option
      FrontRightPsi: int option
      RearLeftPsi: int option
      RearRightPsi: int option
      Status: string
      Notes: string option
      PhotoDocumentId: Guid option
      CreatedAt: DateTimeOffset }

module TirePressureLogResponse =
    let fromDomain (log: TirePressureLog) =
        { Id = log.Id
          VehicleId = log.VehicleId
          MeasuredAt = log.MeasuredAt
          FrontLeftPsi = log.FrontLeftPsi
          FrontRightPsi = log.FrontRightPsi
          RearLeftPsi = log.RearLeftPsi
          RearRightPsi = log.RearRightPsi
          Status = TirePressureStatus.toStorageValue log.Status
          Notes = log.Notes
          PhotoDocumentId = log.PhotoDocumentId
          CreatedAt = log.CreatedAt }

type TirePressureSnapshotResponse =
    { Spec: TirePressureSpecResponse option
      RecentLogs: TirePressureLogResponse array }

module TirePressureSnapshotResponse =
    let fromDomain (snapshot: TirePressureSnapshot) =
        { Spec = snapshot.Spec |> Option.map TirePressureSpecResponse.fromDomain
          RecentLogs = snapshot.RecentLogs |> List.map TirePressureLogResponse.fromDomain |> List.toArray }

type UpsertTirePressureSpecRequest =
    { FrontLeftPsi: int option
      FrontRightPsi: int option
      RearLeftPsi: int option
      RearRightPsi: int option
      Notes: string option
      PhotoDocumentId: Guid option }

module UpsertTirePressureSpecRequest =
    let toDomain vehicleId (request: UpsertTirePressureSpecRequest) =
        { VehicleId = vehicleId
          FrontLeftPsi = request.FrontLeftPsi
          FrontRightPsi = request.FrontRightPsi
          RearLeftPsi = request.RearLeftPsi
          RearRightPsi = request.RearRightPsi
          Notes = request.Notes
          PhotoDocumentId = request.PhotoDocumentId }

type CreateTirePressureLogRequest =
    { MeasuredAt: DateTimeOffset option
      FrontLeftPsi: int option
      FrontRightPsi: int option
      RearLeftPsi: int option
      RearRightPsi: int option
      Notes: string option
      PhotoDocumentId: Guid option }

module CreateTirePressureLogRequest =
    let toDomain vehicleId (request: CreateTirePressureLogRequest) =
        { VehicleId = vehicleId
          MeasuredAt = request.MeasuredAt |> Option.defaultValue DateTimeOffset.UtcNow
          FrontLeftPsi = request.FrontLeftPsi
          FrontRightPsi = request.FrontRightPsi
          RearLeftPsi = request.RearLeftPsi
          RearRightPsi = request.RearRightPsi
          Notes = request.Notes
          PhotoDocumentId = request.PhotoDocumentId }

type TirePressureSpecScanResponse =
    { Spec: TirePressureSpecResponse
      AiText: string
      PhotoDocumentId: Guid option }

type TireFleetAlertResponse =
    { VehicleId: Guid
      Vin: string
      VehicleLabel: string
      LatestStatus: string option
      MeasuredAt: DateTimeOffset option
      PsiSummary: string option
      DaysAgo: int option }

module TireFleetAlertResponse =
    let fromDomain (entry: TireFleetAlertEntry) =
        let psiSummary =
            match entry.FrontLeftPsi, entry.FrontRightPsi, entry.RearLeftPsi, entry.RearRightPsi with
            | Some fl, Some fr, Some rl, Some rr -> Some $"FL {fl} / FR {fr} / RL {rl} / RR {rr}"
            | _ ->
                [ entry.FrontLeftPsi; entry.FrontRightPsi; entry.RearLeftPsi; entry.RearRightPsi ]
                |> List.choose id
                |> function
                | [] -> None
                | values -> Some(values |> List.map string |> String.concat " / ")
        let daysAgo =
            entry.MeasuredAt |> Option.map (fun d -> int (DateTimeOffset.UtcNow - d).TotalDays)
        { VehicleId = entry.VehicleId
          Vin = entry.Vin
          VehicleLabel = entry.VehicleLabel
          LatestStatus = entry.LatestStatus |> Option.map TirePressureStatus.toStorageValue
          MeasuredAt = entry.MeasuredAt
          PsiSummary = psiSummary
          DaysAgo = daysAgo }
