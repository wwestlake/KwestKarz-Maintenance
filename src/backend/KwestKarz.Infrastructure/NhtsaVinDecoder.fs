namespace KwestKarz.Infrastructure

open System
open System.Net.Http
open System.Text.Json
open System.Threading
open System.Threading.Tasks
open KwestKarz.Domain

type NhtsaVinDecoder(httpClient: HttpClient) =
    let getStringProperty (element: JsonElement) (name: string) =
        match element.TryGetProperty(name) with
        | true, value when value.ValueKind = JsonValueKind.String && not (String.IsNullOrWhiteSpace(value.GetString())) ->
            Some(value.GetString())
        | _ -> None

    let parseInt (value: string option) =
        match value with
        | Some text ->
            match Int32.TryParse(text) with
            | true, number -> Some number
            | false, _ -> None
        | None -> None

    interface IVinDecoder with
        member _.DecodeAsync(vin: string, cancellationToken: CancellationToken) : Task<VinDecodeResult> =
            task {
                let normalizedVin = vin.Trim().ToUpperInvariant()
                let url = $"vehicles/DecodeVinValuesExtended/{Uri.EscapeDataString(normalizedVin)}?format=json"
                use! response = httpClient.GetAsync(url, cancellationToken)
                let! content = response.Content.ReadAsStringAsync(cancellationToken)

                if not response.IsSuccessStatusCode then
                    failwith $"NHTSA VIN decode failed with status {(int response.StatusCode)}: {content}"

                use json = JsonDocument.Parse(content)
                let result = json.RootElement.GetProperty("Results").EnumerateArray() |> Seq.tryHead

                match result with
                | None ->
                    return
                        { Vin = normalizedVin
                          Year = None
                          Make = None
                          Model = None
                          Trim = None
                          VehicleType = None
                          BodyClass = None
                          TransmissionStyle = None
                          EngineCylinders = None
                          DisplacementL = None
                          FuelTypePrimary = None
                          DriveType = None
                          Doors = None
                          Seats = None
                          EngineHP = None
                          ErrorCode = Some "NoResult"
                          ErrorText = Some "NHTSA returned no decode result." }
                | Some item ->
                    return
                        { Vin = normalizedVin
                          Year = getStringProperty item "ModelYear" |> parseInt
                          Make = getStringProperty item "Make"
                          Model = getStringProperty item "Model"
                          Trim = getStringProperty item "Trim"
                          VehicleType = getStringProperty item "VehicleType"
                          BodyClass = getStringProperty item "BodyClass"
                          TransmissionStyle = getStringProperty item "TransmissionStyle"
                          EngineCylinders = getStringProperty item "EngineCylinders"
                          DisplacementL = getStringProperty item "DisplacementL"
                          FuelTypePrimary = getStringProperty item "FuelTypePrimary"
                          DriveType = getStringProperty item "DriveType"
                          Doors = getStringProperty item "Doors"
                          Seats = getStringProperty item "Seats"
                          EngineHP = getStringProperty item "EngineHP"
                          ErrorCode = getStringProperty item "ErrorCode"
                          ErrorText = getStringProperty item "ErrorText" }
            }
