namespace KwestKarz.Api

open KwestKarz.Domain

type VinDecodeResponse =
    { Vin: string
      Year: int option
      Make: string option
      Model: string option
      Trim: string option
      VehicleType: string option
      BodyClass: string option
      ErrorCode: string option
      ErrorText: string option }

module VinDecodeResponse =
    let fromDomain (result: VinDecodeResult) =
        { Vin = result.Vin
          Year = result.Year
          Make = result.Make
          Model = result.Model
          Trim = result.Trim
          VehicleType = result.VehicleType
          BodyClass = result.BodyClass
          ErrorCode = result.ErrorCode
          ErrorText = result.ErrorText }
