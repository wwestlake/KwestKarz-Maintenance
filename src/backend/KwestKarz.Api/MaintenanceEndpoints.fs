namespace KwestKarz.Api

open System
open System.Threading.Tasks
open KwestKarz.Domain
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http

module MaintenanceEndpoints =
    let mapMaintenanceEndpoints (app: WebApplication) =
        let group = app.MapGroup("/api/vehicles/{vehicleId:guid}/maintenance")

        group.MapGet(
            "/",
            Func<Guid, IMaintenanceRepository, HttpContext, Task<IResult>>(fun vehicleId repository httpContext ->
                task {
                    let! records = repository.ListForVehicleAsync(vehicleId, httpContext.RequestAborted)
                    return records |> List.map MaintenanceRecordResponse.fromDomain |> List.toArray |> Results.Ok
                })
        )
        |> ignore

        group.MapPost(
            "/",
            Func<Guid, CreateMaintenanceRecordRequest, IMaintenanceRepository, HttpContext, Task<IResult>>(fun vehicleId request repository httpContext ->
                task {
                    if String.IsNullOrWhiteSpace(request.EventType) then
                        return Results.BadRequest("eventType is required.")
                    else
                        let! record = repository.CreateAsync(CreateMaintenanceRecordRequest.toDomain vehicleId request, httpContext.RequestAborted)
                        return Results.Created($"/api/vehicles/{vehicleId}/maintenance/{record.Id}", MaintenanceRecordResponse.fromDomain record)
                })
        )
        |> ignore

        app
