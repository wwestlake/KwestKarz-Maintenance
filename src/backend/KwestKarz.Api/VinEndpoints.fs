namespace KwestKarz.Api

open System
open System.Threading.Tasks
open KwestKarz.Domain
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http

module VinEndpoints =
    let mapVinEndpoints (app: WebApplication) =
        let group = app.MapGroup("/api/vin")

        group.MapGet(
            "/{vin}/decode",
            Func<string, IVinDecoder, HttpContext, Task<IResult>>(fun vin decoder httpContext ->
                task {
                    if String.IsNullOrWhiteSpace(vin) then
                        return Results.BadRequest("VIN is required.")
                    elif vin.Trim().Length < 11 then
                        return Results.BadRequest("VIN must be at least 11 characters for a useful decode.")
                    else
                        let! decoded = decoder.DecodeAsync(vin, httpContext.RequestAborted)
                        return decoded |> VinDecodeResponse.fromDomain |> Results.Ok
                })
        )
        |> ignore

        app
