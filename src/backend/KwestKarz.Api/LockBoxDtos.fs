namespace KwestKarz.Api

open System
open KwestKarz.Domain

type LockBoxResponse =
    { Id: Guid
      BoxNumber: int
      SerialNumber: string option
      Combo: string
      Style: string
      Status: string
      Notes: string option
      CurrentVehicleId: Guid option
      CurrentVehicleVin: string option
      CurrentVehicleLabel: string option
      AssignedAt: DateTimeOffset option
      CreatedAt: DateTimeOffset
      UpdatedAt: DateTimeOffset }

module LockBoxResponse =
    let fromDomain (lockBox: LockBox) =
        { Id = lockBox.Id
          BoxNumber = lockBox.BoxNumber
          SerialNumber = lockBox.SerialNumber
          Combo = lockBox.Combo
          Style = LockBoxStyle.toStorageValue lockBox.Style
          Status = LockBoxStatus.toStorageValue lockBox.Status
          Notes = lockBox.Notes
          CurrentVehicleId = lockBox.CurrentVehicleId
          CurrentVehicleVin = lockBox.CurrentVehicleVin
          CurrentVehicleLabel = lockBox.CurrentVehicleLabel
          AssignedAt = lockBox.AssignedAt
          CreatedAt = lockBox.CreatedAt
          UpdatedAt = lockBox.UpdatedAt }

type CreateLockBoxRequest =
    { BoxNumber: int
      SerialNumber: string option
      Combo: string
      Style: string option
      Status: string option
      Notes: string option }

module CreateLockBoxRequest =
    let toDomain (request: CreateLockBoxRequest) : NewLockBox =
        { BoxNumber = request.BoxNumber
          SerialNumber = request.SerialNumber
          Combo = request.Combo
          Style = request.Style |> Option.map LockBoxStyle.fromStorageValue |> Option.defaultValue LockBoxStyle.MechanicalKeypad
          Status = request.Status |> Option.map LockBoxStatus.fromStorageValue |> Option.defaultValue LockBoxStatus.Available
          Notes = request.Notes }

type UpdateLockBoxRequest =
    { SerialNumber: string option
      Combo: string
      Style: string
      Status: string
      Notes: string option }

module UpdateLockBoxRequest =
    let toDomain (request: UpdateLockBoxRequest) : UpdateLockBox =
        { SerialNumber = request.SerialNumber
          Combo = request.Combo
          Style = LockBoxStyle.fromStorageValue request.Style
          Status = LockBoxStatus.fromStorageValue request.Status
          Notes = request.Notes }

type AssignLockBoxRequest =
    { VehicleId: Guid
      Notes: string option }

type UnassignLockBoxRequest =
    { Notes: string option }
