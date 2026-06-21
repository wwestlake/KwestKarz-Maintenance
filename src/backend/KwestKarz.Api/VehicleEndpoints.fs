namespace KwestKarz.Api

open System
open System.Threading.Tasks
open KwestKarz.Domain
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http

module VehicleEndpoints =
    let mapVehicleEndpoints (app: WebApplication) =
        let group = app.MapGroup("/api/vehicles")

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

        app
