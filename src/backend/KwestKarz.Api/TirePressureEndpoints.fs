namespace KwestKarz.Api

open System
open System.Threading.Tasks
open KwestKarz.Domain
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http

module TirePressureEndpoints =
    let mapTirePressureEndpoints (app: WebApplication) =
        let group = app.MapGroup("/api/vehicles/{vehicleId:guid}/tire-pressure")

        group.MapGet(
            "/",
            Func<Guid, ITirePressureRepository, HttpContext, Task<IResult>>(fun vehicleId repository httpContext ->
                task {
                    let! snapshot = repository.GetSnapshotAsync(vehicleId, httpContext.RequestAborted)
                    return snapshot |> TirePressureSnapshotResponse.fromDomain |> Results.Ok
                })
        )
        |> ignore

        group.MapPut(
            "/spec",
            Func<Guid, UpsertTirePressureSpecRequest, ITirePressureRepository, HttpContext, Task<IResult>>(fun vehicleId request repository httpContext ->
                task {
                    let! spec = repository.UpsertSpecAsync(UpsertTirePressureSpecRequest.toDomain vehicleId request, httpContext.RequestAborted)
                    return spec |> TirePressureSpecResponse.fromDomain |> Results.Ok
                })
        )
        |> ignore

        group.MapPost(
            "/logs",
            Func<Guid, CreateTirePressureLogRequest, ITirePressureRepository, HttpContext, Task<IResult>>(fun vehicleId request repository httpContext ->
                task {
                    let! log = repository.CreateLogAsync(CreateTirePressureLogRequest.toDomain vehicleId request, httpContext.RequestAborted)
                    return Results.Created($"/api/vehicles/{vehicleId}/tire-pressure/logs/{log.Id}", TirePressureLogResponse.fromDomain log)
                })
        )
        |> ignore

        app
