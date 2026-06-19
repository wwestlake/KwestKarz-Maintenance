namespace KwestKarz.Api

open System
open System.Threading.Tasks
open KwestKarz.Domain
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http

module DashboardEndpoints =
    let mapDashboardEndpoints (app: WebApplication) =
        app.MapGet(
            "/api/vehicles/{vehicleId:guid}/dashboard",
            Func<Guid, IVehicleRepository, IMaintenanceRepository, IDocumentRepository, ILockBoxRepository, HttpContext, Task<IResult>>(fun vehicleId vehicles maintenance documents lockBoxes httpContext ->
                task {
                    let! allVehicles = vehicles.ListAsync(httpContext.RequestAborted)

                    match allVehicles |> List.tryFind (fun vehicle -> vehicle.Id = vehicleId) with
                    | None -> return Results.NotFound()
                    | Some vehicle ->
                        let! recentMaintenance = maintenance.ListRecentForVehicleAsync(vehicleId, 10, httpContext.RequestAborted)
                        let! allMaintenance = maintenance.ListForVehicleAsync(vehicleId, httpContext.RequestAborted)
                        let! vehicleDocuments = documents.ListForOwnerAsync(DocumentOwnerType.Vehicle, vehicleId, httpContext.RequestAborted)
                        let! currentLockBox = lockBoxes.FindCurrentForVehicleAsync(vehicleId, httpContext.RequestAborted)
                        let nextDue = MaintenanceLogic.nextDue (DateOnly.FromDateTime(DateTime.UtcNow)) vehicle.CurrentOdometer allMaintenance

                        let response =
                            { Vehicle = VehicleResponse.fromDomain vehicle
                              CurrentLockBox = currentLockBox |> Option.map LockBoxResponse.fromDomain
                              Documents = vehicleDocuments |> List.map DocumentResponse.fromDomain |> List.toArray
                              RecentMaintenance = recentMaintenance |> List.map MaintenanceRecordResponse.fromDomain |> List.toArray
                              NextDue =
                                nextDue
                                |> Option.map (fun summary ->
                                    { Record = MaintenanceRecordResponse.fromDomain summary.Record
                                      DueStatus = MaintenanceDueStatus.toStorageValue summary.DueStatus })
                              AiContextSummary = MaintenanceLogic.dashboardContext vehicle vehicleDocuments allMaintenance nextDue }

                        return Results.Ok(response)
                })
        )
        |> ignore

        app
