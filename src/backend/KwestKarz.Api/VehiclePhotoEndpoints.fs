namespace KwestKarz.Api

open System
open System.IO
open System.Threading
open System.Threading.Tasks
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open KwestKarz.Domain

type VehiclePhotoResponse =
    { Id: Guid
      VehicleId: Guid
      ContentType: string
      OriginalFileName: string
      SizeBytes: int64
      IsPrimary: bool
      DisplayOrder: int
      CreatedAt: DateTimeOffset
      CreatedBy: string option }

module VehiclePhotoEndpoints =
    let mapVehiclePhotoEndpoints (app: WebApplication) =
        let group = app.MapGroup("/api/vehicles/{vehicleId}/photos").RequireAuthorization()

        group.MapGet(
            "",
            Func<Guid, IVehiclePhotoRepository, CancellationToken, Task<IResult>>(
                fun vehicleId photoRepo ct ->
                    task {
                        let! photos = photoRepo.ListByVehicleAsync(vehicleId, ct)
                        let response =
                            photos
                            |> List.map (fun p ->
                                { Id = p.Id
                                  VehicleId = p.VehicleId
                                  ContentType = p.ContentType
                                  OriginalFileName = p.OriginalFileName
                                  SizeBytes = p.SizeBytes
                                  IsPrimary = p.IsPrimary
                                  DisplayOrder = p.DisplayOrder
                                  CreatedAt = p.CreatedAt
                                  CreatedBy = p.CreatedBy })
                        return Results.Ok(response)
                    }
            )
        )
        |> ignore

        group.MapGet(
            "/primary",
            Func<Guid, IVehiclePhotoRepository, CancellationToken, Task<IResult>>(
                fun vehicleId photoRepo ct ->
                    task {
                        let! photo = photoRepo.GetPrimaryAsync(vehicleId, ct)
                        match photo with
                        | Some p ->
                            let response =
                                { Id = p.Id
                                  VehicleId = p.VehicleId
                                  ContentType = p.ContentType
                                  OriginalFileName = p.OriginalFileName
                                  SizeBytes = p.SizeBytes
                                  IsPrimary = p.IsPrimary
                                  DisplayOrder = p.DisplayOrder
                                  CreatedAt = p.CreatedAt
                                  CreatedBy = p.CreatedBy }
                            return Results.Ok(response)
                        | None -> return Results.NotFound()
                    }
            )
        )
        |> ignore

        group.MapPost(
            "",
            Func<Guid, HttpContext, IVehiclePhotoRepository, CancellationToken, Task<IResult>>(
                fun vehicleId httpContext photoRepo ct ->
                    task {
                        try
                            let form = httpContext.Request.Form
                            match form.Files.GetFile("photo") with
                            | null -> return Results.BadRequest({| error = "No photo file provided" |})
                            | file ->
                                use stream = new MemoryStream()
                                do! file.CopyToAsync(stream, ct)
                                let blob = stream.ToArray()

                                let isPrimary = form.ContainsKey("isPrimary") && form["isPrimary"].ToString().ToLower() = "true"

                                let newPhoto: VehiclePhoto =
                                    { Id = Guid.NewGuid()
                                      VehicleId = vehicleId
                                      ContentType = file.ContentType
                                      OriginalFileName = file.FileName
                                      SizeBytes = file.Length
                                      IsPrimary = isPrimary
                                      DisplayOrder = 0
                                      CreatedAt = DateTimeOffset.UtcNow
                                      CreatedBy = httpContext.User.FindFirst("user_id") |> fun c -> if isNull c then None else Some c.Value }

                                let! createdPhoto = photoRepo.AddPhotoAsync(vehicleId, newPhoto, blob, ct)

                                let response =
                                    { Id = createdPhoto.Id
                                      VehicleId = createdPhoto.VehicleId
                                      ContentType = createdPhoto.ContentType
                                      OriginalFileName = createdPhoto.OriginalFileName
                                      SizeBytes = createdPhoto.SizeBytes
                                      IsPrimary = createdPhoto.IsPrimary
                                      DisplayOrder = createdPhoto.DisplayOrder
                                      CreatedAt = createdPhoto.CreatedAt
                                      CreatedBy = createdPhoto.CreatedBy }

                                return Results.Created($"/api/vehicles/{vehicleId}/photos/{createdPhoto.Id}", response)
                        with ex ->
                            return Results.BadRequest({| error = ex.Message |})
                    }
            )
        )
        |> ignore

        group.MapPut(
            "/{photoId}/primary",
            Func<Guid, Guid, IVehiclePhotoRepository, CancellationToken, Task<IResult>>(
                fun vehicleId photoId photoRepo ct ->
                    task {
                        try
                            do! photoRepo.SetPrimaryAsync(photoId, vehicleId, ct)
                            return Results.Ok({| success = true |})
                        with ex ->
                            return Results.BadRequest({| error = ex.Message |})
                    }
            )
        )
        |> ignore
