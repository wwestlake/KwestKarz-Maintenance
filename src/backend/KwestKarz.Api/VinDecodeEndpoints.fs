namespace KwestKarz.Api

open System
open System.Net.Http
open System.Threading
open System.Threading.Tasks
open System.Text.Json
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http

type VinDecodeResult =
    { Vin: string
      Year: int option
      Make: string option
      Model: string option
      Trim: string option
      BodyClass: string option
      Transmission: string option
      ErrorMessage: string option }

type private NhtsaVehicleVariable =
    { Variable: string
      Value: string }

type private NhtsaDecodeResponse =
    { Results: NhtsaVehicleVariable[] option }

module VinDecodeEndpoints =
    let private httpClient = new HttpClient()

    let private parseNhtsaResponse (json: string) : VinDecodeResult option =
        try
            let options = JsonSerializerOptions(PropertyNamingPolicy = JsonNamingPolicy.CamelCase)
            let response = JsonSerializer.Deserialize<NhtsaDecodeResponse>(json, options)

            match response.Results with
            | None | Some [||] -> None
            | Some results ->
                let variables =
                    results
                    |> Array.map (fun v -> (v.Variable.ToLower(), v.Value))
                    |> Map.ofArray

                let getVar (key: string) =
                    match Map.tryFind key variables with
                    | Some value when not (String.IsNullOrWhiteSpace(value)) && value <> "Not Applicable" -> Some value
                    | _ -> None

                let year = getVar "model year" |> Option.bind (fun y -> match Int32.TryParse(y) with | true, v -> Some v | _ -> None)
                let vin = getVar "vin" |> Option.defaultValue ""

                Some { Vin = vin
                       Year = year
                       Make = getVar "make"
                       Model = getVar "model"
                       Trim = getVar "trim"
                       BodyClass = getVar "body class"
                       Transmission = getVar "transmission style"
                       ErrorMessage = None }
        with _ ->
            None

    let mapVinDecodeEndpoints (app: WebApplication) =
        let group = app.MapGroup("/api/vehicles")

        group.MapPost(
            "/decode-vin",
            Func<HttpRequest, CancellationToken, Task<IResult>>(fun httpRequest ct ->
                task {
                    try
                        use reader = new System.IO.StreamReader(httpRequest.Body)
                        let! body = reader.ReadToEndAsync()
                        let json = JsonDocument.Parse(body)
                        let root = json.RootElement
                        let vin = root.GetProperty("vin").GetString()

                        if String.IsNullOrWhiteSpace(vin) || vin.Length <> 17 then
                            return Results.BadRequest(
                                { Vin = ""
                                  Year = None
                                  Make = None
                                  Model = None
                                  Trim = None
                                  BodyClass = None
                                  Transmission = None
                                  ErrorMessage = Some "VIN must be 17 characters" })
                        else
                            let url = $"https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/{vin}?format=json"
                            let! response = httpClient.GetAsync(url, ct)
                            let! content = response.Content.ReadAsStringAsync(ct)

                            match parseNhtsaResponse content with
                            | Some result -> return Results.Ok result
                            | None -> return Results.BadRequest(
                                { Vin = vin
                                  Year = None
                                  Make = None
                                  Model = None
                                  Trim = None
                                  BodyClass = None
                                  Transmission = None
                                  ErrorMessage = Some "Could not decode VIN" })
                    with ex ->
                        return Results.BadRequest(
                            { Vin = ""
                              Year = None
                              Make = None
                              Model = None
                              Trim = None
                              BodyClass = None
                              Transmission = None
                              ErrorMessage = Some ex.Message })
                }
            )
        )
        |> ignore
