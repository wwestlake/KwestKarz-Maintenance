namespace KwestKarz.Domain

open System.Threading
open System.Threading.Tasks

type VinDecodeResult =
    { Vin: string
      Year: int option
      Make: string option
      Model: string option
      Trim: string option
      VehicleType: string option
      BodyClass: string option
      TransmissionStyle: string option
      EngineCylinders: string option
      DisplacementL: string option
      FuelTypePrimary: string option
      DriveType: string option
      Doors: string option
      Seats: string option
      EngineHP: string option
      ErrorCode: string option
      ErrorText: string option }

type IVinDecoder =
    abstract member DecodeAsync: vin: string * cancellationToken: CancellationToken -> Task<VinDecodeResult>
