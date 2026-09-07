namespace KwestKarz.Api

open System
open System.Net.Http
open System.Threading
open System.Threading.Tasks
open System.Text.Json
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open KwestKarz.Domain

type VinRescanResult =
    { VehicleId: Guid
      Vin: string
      BodyClass: string option
      Transmission: string option
      Success: bool
      Error: string option }

type VinRescanSummary =
    { TotalScanned: int
      SuccessCount: int
      FailureCount: int
      Results: VinRescanResult[] }

module VinRescanEndpoints =
    let private httpClient = new HttpClient()

    let private decodeVinData (vin: string) (ct: CancellationToken) : Task<(string option * string option) option> =
        task {
            try
                let url = $"https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/{vin}?format=json"
                let! response = httpClient.GetAsync(url, ct)
                let! content = response.Content.ReadAsStringAsync(ct)

                let options = JsonSerializerOptions(PropertyNamingPolicy = JsonNamingPolicy.CamelCase)
                let responseJson = JsonDocument.Parse(content)
                let root = responseJson.RootElement

                let result =
                    match root.TryGetProperty("Results") with
                    | true, resultsElement when resultsElement.ValueKind = JsonValueKind.Array ->
                        let variables =
                            resultsElement.EnumerateArray()
                            |> Seq.choose (fun item ->
                                match item.TryGetProperty("Variable"), item.TryGetProperty("Value") with
                                | (true, varElem), (true, valElem) ->
                                    let varStr = varElem.GetString()
                                    let valStr = valElem.GetString()
                                    if String.IsNullOrWhiteSpace(varStr) || String.IsNullOrWhiteSpace(valStr) then
                                        None
                                    else
                                        Some (varStr.ToLower(), valStr)
                                | _ -> None
                            )
                            |> Map.ofSeq

                        let getVar (key: string) =
                            match Map.tryFind key variables with
                            | Some value when value <> "Not Applicable" -> Some value
                            | _ -> None

                        let bodyClass = getVar "body class"
                        let transmission = getVar "transmission style"
                        Some (bodyClass, transmission)
                    | _ -> None
                return result
            with _ ->
                return None
        }

    let mapVinRescanEndpoints (app: WebApplication) =
        let group = app.MapGroup("/api/vehicles").RequireAuthorization()

        group.MapPost(
            "/rescan-vins",
            Func<IVehicleRepository, HttpContext, CancellationToken, Task<IResult>>(fun repository httpContext ct ->
                task {
                    let role = httpContext.Request.Headers["X-Role"].ToString()
                    if role <> "admin" then
                        return Results.Forbid()
                    else
                        try
                            let! vehicles = repository.ListAsync(ct)
                            let mutable results: VinRescanResult list = []
                            let mutable successCount = 0
                            let mutable failureCount = 0

                            for vehicle in vehicles do
                                let! decodeData = decodeVinData vehicle.Vin ct

                                match decodeData with
                                | Some (bodyClass, transmission) ->
                                    successCount <- successCount + 1
                                    let result: VinRescanResult =
                                        { VehicleId = vehicle.Id
                                          Vin = vehicle.Vin
                                          BodyClass = bodyClass
                                          Transmission = transmission
                                          Success = true
                                          Error = None }
                                    results <- result :: results

                                    let updateData: UpdateVehicle =
                                        { BodyClass = bodyClass
                                          Transmission = transmission
                                          Color = vehicle.Color
                                          LicensePlate = vehicle.LicensePlate
                                          LicensePlateState = vehicle.LicensePlateState
                                          Status = vehicle.Status
                                          TuroListingUrl = vehicle.TuroListingUrl
                                          CurrentOdometer = vehicle.CurrentOdometer
                                          CurrentOdometerRecordedAt = vehicle.CurrentOdometerRecordedAt
                                          FleetPositionNumber = vehicle.FleetPositionNumber
                                          Notes = vehicle.Notes
                                          Description = vehicle.Description }
                                    let! _ = repository.UpdateAsync(vehicle.Id, updateData, ct)
                                    ()
                                | None ->
                                    failureCount <- failureCount + 1
                                    let result: VinRescanResult =
                                        { VehicleId = vehicle.Id
                                          Vin = vehicle.Vin
                                          BodyClass = None
                                          Transmission = None
                                          Success = false
                                          Error = Some "Could not decode VIN" }
                                    results <- result :: results

                            let summary: VinRescanSummary =
                                { TotalScanned = vehicles.Length
                                  SuccessCount = successCount
                                  FailureCount = failureCount
                                  Results = results |> List.rev |> List.toArray }

                            return Results.Ok summary
                        with ex ->
                            let errorItem: VinRescanResult =
                                { VehicleId = Guid.Empty
                                  Vin = ""
                                  BodyClass = None
                                  Transmission = None
                                  Success = false
                                  Error = Some ex.Message }
                            let errorResult: VinRescanSummary =
                                { TotalScanned = 0
                                  SuccessCount = 0
                                  FailureCount = 1
                                  Results = [| errorItem |] }
                            return Results.BadRequest(errorResult)
                }
            )
        )
        |> ignore
