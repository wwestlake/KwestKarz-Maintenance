namespace KwestKarz.Domain

open System
open System.Threading
open System.Threading.Tasks

type LockBoxStatus =
    | Available
    | Assigned
    | Lost
    | Retired

module LockBoxStatus =
    let toStorageValue status =
        match status with
        | Available -> "Available"
        | Assigned -> "Assigned"
        | Lost -> "Lost"
        | Retired -> "Retired"

    let fromStorageValue value =
        match value with
        | "Available" -> Available
        | "Assigned" -> Assigned
        | "Lost" -> Lost
        | "Retired" -> Retired
        | _ -> invalidArg (nameof value) $"Unknown lock box status: {value}"

type LockBoxStyle =
    | MechanicalKeypad
    | Dial
    | Other

module LockBoxStyle =
    let toStorageValue style =
        match style with
        | MechanicalKeypad -> "Mechanical Keypad"
        | Dial -> "Dial"
        | Other -> "Other"

    let fromStorageValue value =
        match value with
        | "Mechanical Keypad" -> MechanicalKeypad
        | "Dial" -> Dial
        | "Other" -> Other
        | _ -> invalidArg (nameof value) $"Unknown lock box style: {value}"

type LockBox =
    { Id: Guid
      BoxNumber: int
      SerialNumber: string option
      Combo: string
      Style: LockBoxStyle
      Status: LockBoxStatus
      Notes: string option
      CurrentVehicleId: Guid option
      CurrentVehicleVin: string option
      CurrentVehicleLabel: string option
      AssignedAt: DateTimeOffset option
      CreatedAt: DateTimeOffset
      UpdatedAt: DateTimeOffset }

type NewLockBox =
    { BoxNumber: int
      SerialNumber: string option
      Combo: string
      Style: LockBoxStyle
      Status: LockBoxStatus
      Notes: string option }

type UpdateLockBox =
    { SerialNumber: string option
      Combo: string
      Style: LockBoxStyle
      Status: LockBoxStatus
      Notes: string option }

type LockBoxAssignment =
    { Id: Guid
      LockBoxId: Guid
      VehicleId: Guid
      AssignedAt: DateTimeOffset
      UnassignedAt: DateTimeOffset option
      Notes: string option }

type NewLockBoxAssignment =
    { LockBoxId: Guid
      VehicleId: Guid
      Notes: string option }

type ILockBoxRepository =
    abstract member ListAsync: cancellationToken: CancellationToken -> Task<LockBox list>
    abstract member FindCurrentForVehicleAsync: vehicleId: Guid * cancellationToken: CancellationToken -> Task<LockBox option>
    abstract member CreateAsync: lockBox: NewLockBox * cancellationToken: CancellationToken -> Task<LockBox>
    abstract member UpdateAsync: lockBoxId: Guid * lockBox: UpdateLockBox * cancellationToken: CancellationToken -> Task<LockBox option>
    abstract member AssignToVehicleAsync: assignment: NewLockBoxAssignment * cancellationToken: CancellationToken -> Task<LockBox option>
    abstract member UnassignAsync: lockBoxId: Guid * notes: string option * cancellationToken: CancellationToken -> Task<LockBox option>
