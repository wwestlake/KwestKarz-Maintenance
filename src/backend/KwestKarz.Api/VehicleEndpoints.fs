namespace KwestKarz.Api

open System
open System.Globalization
open System.Text.RegularExpressions
open System.Threading.Tasks
open KwestKarz.Domain
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http

module VehicleEndpoints =
    let private isPublicVehicle (vehicle: Vehicle) =
        match vehicle.Status with
        | VehicleStatus.Active
        | VehicleStatus.Staging -> true
        | _ -> false

    let private friendlyDriveType (raw: string) =
        match raw.Split('/').[0].Trim().ToUpperInvariant() with
        | "4WD" | "4X4" -> Some "four-wheel drive"
        | "AWD" -> Some "all-wheel drive"
        | "FWD" -> Some "front-wheel drive"
        | "RWD" -> Some "rear-wheel drive"
        | "" -> None
        | other -> Some (other.ToLowerInvariant())

    let private friendlyFuelType (raw: string) =
        // Skip verbose/parenthetical NHTSA values (e.g. "Flexible Fuel Vehicle (FFV)") — keep only short, clean labels.
        if raw.Contains("(") || raw.Split(' ').Length > 2 then None
        else Some (raw.ToLowerInvariant())

    let private cleanBodyClass (raw: string) =
        // NHTSA often returns compound values like "Sport Utility Vehicle [SUV]/Multipurpose Vehicle [MPV]" — keep just the first, plain-text label.
        let firstSegment = raw.Split('/').[0]
        Regex.Replace(firstSegment, @"\s*\[[^\]]*\]", "").Trim()

    let buildGeneratedDescription (vehicle: Vehicle) (decode: VinDecodeResult) =
        let titleWords =
            [ vehicle.Year |> Option.map string; vehicle.Make; vehicle.Model ]
            |> List.choose id
            |> List.filter (String.IsNullOrWhiteSpace >> not)
        let title = String.Join(" ", titleWords)
        let trimText = vehicle.Trim |> Option.map (fun t -> $" {t}") |> Option.defaultValue ""
        let bodyText =
            match vehicle.BodyClass |> Option.orElse decode.BodyClass with
            | Some b -> (cleanBodyClass b).ToLowerInvariant()
            | None -> "vehicle"
        let colorText = vehicle.Color |> Option.map (fun c -> $" in {c.ToLowerInvariant()}") |> Option.defaultValue ""

        let openingSentence =
            (if title = "" then "This car" else $"The {title}{trimText}")
            + $" is a {bodyText}{colorText}, ready to make your next trip easy and comfortable."

        let engineParts =
            [ decode.DisplacementL
              |> Option.bind (fun d -> match Double.TryParse(d, NumberStyles.Float, CultureInfo.InvariantCulture) with | true, v when v > 0.0 -> Some (v.ToString("0.0", CultureInfo.InvariantCulture) + "L") | _ -> None)
              decode.EngineCylinders |> Option.map (fun c -> $"{c}-cylinder") ]
            |> List.choose id

        let mechanicalPieces =
            [ if not engineParts.IsEmpty then
                  let engineText = String.Join(" ", engineParts)
                  Some $"a {engineText} engine"
              decode.DriveType |> Option.bind friendlyDriveType
              decode.FuelTypePrimary |> Option.bind friendlyFuelType |> Option.map (fun f -> $"{f} power") ]
            |> List.choose id

        let mechanicalSentence =
            if mechanicalPieces.IsEmpty then None
            else
                let piecesText = String.Join(", ", mechanicalPieces)
                Some $"Features include {piecesText}."

        let practicalSentence =
            let seatText = decode.Seats |> Option.map (fun s -> $"seating for {s}")
            let doorText = decode.Doors |> Option.map (fun d -> $"{d} doors")
            match doorText, seatText with
            | Some d, Some s -> Some $"With {d} and {s}, it's easy to load up friends, family, or luggage for wherever you're headed."
            | Some d, None -> Some $"With {d}, it's easy to load up friends, family, or luggage for wherever you're headed."
            | None, Some s -> Some $"It offers {s}."
            | None, None -> None

        [ Some openingSentence; mechanicalSentence; practicalSentence ]
        |> List.choose id
        |> String.concat " "

    let mapVehicleEndpoints (app: WebApplication) =
        let group = app.MapGroup("/api/vehicles")
        let publicGroup = app.MapGroup("/api/public")

        let publicVehiclesRoute =
            publicGroup.MapGet(
            "/vehicles",
            Func<IVehicleRepository, HttpContext, Task<IResult>>(fun repository httpContext ->
                task {
                    let! vehicles = repository.ListAsync(httpContext.RequestAborted)
                    let publicVehicles =
                        vehicles
                        |> List.filter isPublicVehicle
                        |> List.map PublicVehicleResponse.fromDomain
                        |> List.toArray

                    return Results.Ok publicVehicles
                })
        )
        publicVehiclesRoute.AllowAnonymous()
        |> ignore

        group.MapGet(
            "/",
            Func<IVehicleRepository, HttpContext, Task<IResult>>(fun repository httpContext ->
                task {
                    let! vehicles = repository.ListAsync(httpContext.RequestAborted)
                    return vehicles |> List.map VehicleResponse.fromDomain |> List.toArray |> Results.Ok
                })
        )
        |> ignore

        group.MapGet(
            "/{id:guid}",
            Func<Guid, IVehicleRepository, HttpContext, Task<IResult>>(fun id repository httpContext ->
                task {
                    let! vehicle = repository.FindByIdAsync(id, httpContext.RequestAborted)

                    return
                        match vehicle with
                        | Some vehicle -> vehicle |> VehicleResponse.fromDomain |> Results.Ok
                        | None -> Results.NotFound()
                })
        )
        |> ignore

        group.MapPut(
            "/{id:guid}",
            Func<Guid, UpdateVehicleRequest, IVehicleRepository, HttpContext, Task<IResult>>(fun id request repository httpContext ->
                task {
                    let! updated = repository.UpdateAsync(id, UpdateVehicleRequest.toDomain request, httpContext.RequestAborted)

                    return
                        match updated with
                        | Some vehicle -> vehicle |> VehicleResponse.fromDomain |> Results.Ok
                        | None -> Results.NotFound()
                })
        )
        |> ignore

        group.MapGet(
            "/by-vin/{vin}",
            Func<string, IVehicleRepository, HttpContext, Task<IResult>>(fun vin repository httpContext ->
                task {
                    let! vehicle = repository.FindByVinAsync(vin, httpContext.RequestAborted)

                    return
                        match vehicle with
                        | Some vehicle -> vehicle |> VehicleResponse.fromDomain |> Results.Ok
                        | None -> Results.NotFound()
                })
        )
        |> ignore

        group.MapPost(
            "/",
            Func<CreateVehicleRequest, IVehicleRepository, HttpContext, Task<IResult>>(fun request repository httpContext ->
                task {
                    let! vehicle = repository.CreateAsync(CreateVehicleRequest.toDomain request, httpContext.RequestAborted)
                    return Results.Created($"/api/vehicles/by-vin/{vehicle.Vin}", VehicleResponse.fromDomain vehicle)
                })
        )
        |> ignore

        group.MapPost(
            "/{id:guid}/generate-description",
            Func<Guid, IVehicleRepository, IVinDecoder, HttpContext, Task<IResult>>(fun id repository decoder httpContext ->
                task {
                    let! vehicle = repository.FindByIdAsync(id, httpContext.RequestAborted)

                    match vehicle with
                    | None -> return Results.NotFound()
                    | Some vehicle ->
                        let! decoded = decoder.DecodeAsync(vehicle.Vin, httpContext.RequestAborted)
                        let description = buildGeneratedDescription vehicle decoded

                        // Generation is a draft. Only the ordinary Save action persists it.
                        return Results.Ok({| description = description |})
                })
        )
        |> ignore

        app
