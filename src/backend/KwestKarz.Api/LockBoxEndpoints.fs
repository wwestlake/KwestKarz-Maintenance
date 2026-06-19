namespace KwestKarz.Api

open System
open System.Threading.Tasks
open KwestKarz.Domain
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http

module LockBoxEndpoints =
    let mapLockBoxEndpoints (app: WebApplication) =
        let group = app.MapGroup("/api/lock-boxes")

        group.MapGet(
            "/",
            Func<ILockBoxRepository, HttpContext, Task<IResult>>(fun repository httpContext ->
                task {
                    let! lockBoxes = repository.ListAsync(httpContext.RequestAborted)
                    return lockBoxes |> List.map LockBoxResponse.fromDomain |> List.toArray |> Results.Ok
                })
        )
        |> ignore

        group.MapPost(
            "/",
            Func<CreateLockBoxRequest, ILockBoxRepository, HttpContext, Task<IResult>>(fun request repository httpContext ->
                task {
                    let! lockBox = repository.CreateAsync(CreateLockBoxRequest.toDomain request, httpContext.RequestAborted)
                    return Results.Created($"/api/lock-boxes/{lockBox.Id}", LockBoxResponse.fromDomain lockBox)
                })
        )
        |> ignore

        group.MapPut(
            "/{lockBoxId:guid}",
            Func<Guid, UpdateLockBoxRequest, ILockBoxRepository, HttpContext, Task<IResult>>(fun lockBoxId request repository httpContext ->
                task {
                    let! lockBox = repository.UpdateAsync(lockBoxId, UpdateLockBoxRequest.toDomain request, httpContext.RequestAborted)

                    return
                        match lockBox with
                        | Some lockBox -> lockBox |> LockBoxResponse.fromDomain |> Results.Ok
                        | None -> Results.NotFound()
                })
        )
        |> ignore

        group.MapPost(
            "/{lockBoxId:guid}/assign",
            Func<Guid, AssignLockBoxRequest, ILockBoxRepository, HttpContext, Task<IResult>>(fun lockBoxId request repository httpContext ->
                task {
                    let! lockBox =
                        repository.AssignToVehicleAsync(
                            { LockBoxId = lockBoxId
                              VehicleId = request.VehicleId
                              Notes = request.Notes },
                            httpContext.RequestAborted
                        )

                    return
                        match lockBox with
                        | Some lockBox -> lockBox |> LockBoxResponse.fromDomain |> Results.Ok
                        | None -> Results.NotFound()
                })
        )
        |> ignore

        group.MapPost(
            "/{lockBoxId:guid}/unassign",
            Func<Guid, UnassignLockBoxRequest, ILockBoxRepository, HttpContext, Task<IResult>>(fun lockBoxId request repository httpContext ->
                task {
                    let! lockBox = repository.UnassignAsync(lockBoxId, request.Notes, httpContext.RequestAborted)

                    return
                        match lockBox with
                        | Some lockBox -> lockBox |> LockBoxResponse.fromDomain |> Results.Ok
                        | None -> Results.NotFound()
                })
        )
        |> ignore

        app
