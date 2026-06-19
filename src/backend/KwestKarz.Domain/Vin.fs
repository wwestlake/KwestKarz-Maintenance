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
      ErrorCode: string option
      ErrorText: string option }

type IVinDecoder =
    abstract member DecodeAsync: vin: string * cancellationToken: CancellationToken -> Task<VinDecodeResult>
