namespace KwestKarz.Api

open System
open System.IO
open System.Text.Json
open System.Text.RegularExpressions
open System.Threading.Tasks
open KwestKarz.Domain
open KwestKarz.Infrastructure
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Npgsql
open NpgsqlTypes

module TirePressureEndpoints =
    let private pressureValue value =
        match value with
        | Some raw ->
            let matchValue = Regex.Match(raw, @"\b([1-9]\d)\b")
            if matchValue.Success then
                let number = Int32.Parse(matchValue.Groups[1].Value)
                if number >= 15 && number <= 80 then Some number else None
            else
                None
        | None -> None

    let private normalizeKey (key: string) =
        Regex.Replace(key.ToLowerInvariant(), "[^a-z0-9]", "")

    let private jsonValues (text: string) =
        let matchValue = Regex.Match(text, @"\{[\s\S]*\}")

        if not matchValue.Success then
            Map.empty
        else
            try
                use document = JsonDocument.Parse(matchValue.Value)

                document.RootElement.EnumerateObject()
                |> Seq.choose (fun property ->
                    let value =
                        match property.Value.ValueKind with
                        | JsonValueKind.Number -> Some(property.Value.GetRawText())
                        | JsonValueKind.String -> Some(property.Value.GetString())
                        | _ -> None

                    value |> Option.map (fun item -> normalizeKey property.Name, item))
                |> Map.ofSeq
            with _ ->
                Map.empty

    let private extractPressure labels text =
        labels
        |> List.tryPick (fun label ->
            let afterLabel = Regex.Match(text, $"(?:{label})[^0-9]{{0,50}}([1-9]\d)\s*(?:psi|psig)?", RegexOptions.IgnoreCase)
            let beforeLabel = Regex.Match(text, $"([1-9]\d)\s*(?:psi|psig)?[^a-z0-9]{{0,30}}(?:{label})", RegexOptions.IgnoreCase)

            if afterLabel.Success then pressureValue (Some afterLabel.Groups[1].Value)
            elif beforeLabel.Success then pressureValue (Some beforeLabel.Groups[1].Value)
            else None)

    let private firstPressures text =
        let explicitPsi =
            Regex.Matches(text, @"\b([1-9]\d)\s*(?:psi|psig)\b", RegexOptions.IgnoreCase)
            |> Seq.cast<Match>
            |> Seq.choose (fun item -> pressureValue (Some item.Groups[1].Value))
            |> Seq.toList

        if not (List.isEmpty explicitPsi) then
            explicitPsi
        else
            Regex.Matches(text, @"\b([1-9]\d)\b")
            |> Seq.cast<Match>
            |> Seq.choose (fun item -> pressureValue (Some item.Groups[1].Value))
            |> Seq.toList

    let private parseTireSpec text =
        let values = jsonValues text

        let fromJson keys =
            keys
            |> List.tryPick (fun key -> values |> Map.tryFind (normalizeKey key) |> pressureValue)

        let numbers = firstPressures text
        let frontPsi =
            fromJson [ "frontPsi"; "front" ]
            |> Option.orElseWith (fun () -> extractPressure [ "front tire"; "front axle"; "front" ] text)
            |> Option.orElse (numbers |> List.tryItem 0)

        let rearPsi =
            fromJson [ "rearPsi"; "rear" ]
            |> Option.orElseWith (fun () -> extractPressure [ "rear tire"; "rear axle"; "rear" ] text)
            |> Option.orElse (numbers |> List.tryItem 1)
            |> Option.orElse frontPsi

        let frontLeft =
            fromJson [ "frontLeftPsi"; "frontLeft"; "fl" ]
            |> Option.orElseWith (fun () -> extractPressure [ "front left"; "front-left"; "fl" ] text)
            |> Option.orElse frontPsi

        let frontRight =
            fromJson [ "frontRightPsi"; "frontRight"; "fr" ]
            |> Option.orElseWith (fun () -> extractPressure [ "front right"; "front-right"; "fr" ] text)
            |> Option.orElse frontPsi

        let rearLeft =
            fromJson [ "rearLeftPsi"; "rearLeft"; "rl" ]
            |> Option.orElseWith (fun () -> extractPressure [ "rear left"; "rear-left"; "rl" ] text)
            |> Option.orElse rearPsi

        let rearRight =
            fromJson [ "rearRightPsi"; "rearRight"; "rr" ]
            |> Option.orElseWith (fun () -> extractPressure [ "rear right"; "rear-right"; "rr" ] text)
            |> Option.orElse rearPsi

        frontLeft, frontRight, rearLeft, rearRight

    let private writeScanLogAsync (dataSource: NpgsqlDataSource) vehicleId aiText parsed cancellationToken =
        task {
            use! connection = dataSource.OpenConnectionAsync(cancellationToken)
            use command =
                new NpgsqlCommand(
                    """
                    insert into kwestkarzbusinessdata.system_logs (
                        id, logged_at, level, source, method, path, status_code, elapsed_ms, message, exception
                    )
                    values (
                        @id, @logged_at, @level, @source, null, @path, null, null, @message, null
                    )
                    """,
                    connection
                )

            command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, Guid.NewGuid()) |> ignore
            command.Parameters.AddWithValue("logged_at", NpgsqlDbType.TimestampTz, DateTimeOffset.UtcNow) |> ignore
            command.Parameters.AddWithValue("level", NpgsqlDbType.Text, "Information") |> ignore
            command.Parameters.AddWithValue("source", NpgsqlDbType.Text, "TirePressureSpecScan") |> ignore
            command.Parameters.AddWithValue("path", NpgsqlDbType.Text, $"/api/vehicles/{vehicleId}/tire-pressure/spec/photo") |> ignore
            command.Parameters.AddWithValue("message", NpgsqlDbType.Text, $"Parsed={parsed}; AI={aiText}") |> ignore
            let! _ = command.ExecuteNonQueryAsync(cancellationToken)
            return ()
        }

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
            "/spec/photo",
            Func<Guid, OpenAIResponsesConnection, ITirePressureRepository, IDocumentRepository, IVehicleRepository, NpgsqlDataSource, HttpContext, Task<IResult>>(fun vehicleId ai tirePressure documents vehicles dataSource httpContext ->
                task {
                    let! form = httpContext.Request.ReadFormAsync(httpContext.RequestAborted)
                    let file = form.Files.GetFile("file")

                    if isNull file || file.Length = 0L then
                        return Results.BadRequest("A multipart form image named 'file' is required.")
                    else
                        let! allVehicles = vehicles.ListAsync(httpContext.RequestAborted)
                        let vehicle = allVehicles |> List.tryFind (fun item -> item.Id = vehicleId)

                        use memory = new MemoryStream()
                        use stream = file.OpenReadStream()
                        do! stream.CopyToAsync(memory, httpContext.RequestAborted)
                        let contentBytes = memory.ToArray()
                        let imageBase64 = Convert.ToBase64String(contentBytes)

                        let vehicleContext =
                            match vehicle with
                            | Some vehicle ->
                                let year = vehicle.Year |> Option.map string |> Option.defaultValue ""
                                let make = vehicle.Make |> Option.defaultValue ""
                                let model = vehicle.Model |> Option.defaultValue ""
                                $"Vehicle VIN: {vehicle.Vin}. Vehicle: {year} {make} {model}."
                            | None -> "No vehicle details found."

                        let aiRequest =
                            { SystemInstructions =
                                Some "You read vehicle tire pressure placards. Return only JSON when requested. Ignore kPa, tire sizes, load ratings, wheel sizes, VINs, and other non-PSI values."
                              UserMessage =
                                $"{vehicleContext}{Environment.NewLine}Read the tire pressure placard image. Return only compact JSON: {{\"frontLeftPsi\":35,\"frontRightPsi\":35,\"rearLeftPsi\":35,\"rearRightPsi\":35,\"notes\":\"short note\"}}. Use PSI only. If the placard lists front/rear axle PSI, copy front to both front tires and rear to both rear tires." }

                        let! aiResponse = ai.CompleteWithImageAsync(aiRequest, file.ContentType, imageBase64, httpContext.RequestAborted)
                        let frontLeftPsi, frontRightPsi, rearLeftPsi, rearRightPsi = parseTireSpec aiResponse.Text
                        let parsedSummary = $"FL={frontLeftPsi};FR={frontRightPsi};RL={rearLeftPsi};RR={rearRightPsi}"
                        do! writeScanLogAsync dataSource vehicleId aiResponse.Text parsedSummary httpContext.RequestAborted

                        if [ frontLeftPsi; frontRightPsi; rearLeftPsi; rearRightPsi ] |> List.exists Option.isSome |> not then
                            return Results.BadRequest({| error = "Could not parse PSI values from tire placard."; aiText = aiResponse.Text |})
                        else
                            let newDocument =
                                { OwnerType = DocumentOwnerType.Vehicle
                                  OwnerId = vehicleId
                                  Kind = DocumentKind.Other
                                  OriginalFileName = file.FileName
                                  ContentType = if String.IsNullOrWhiteSpace(file.ContentType) then "application/octet-stream" else file.ContentType
                                  StoragePath = ""
                                  SizeBytes = int64 contentBytes.Length
                                  Description = Some "Tire pressure placard photo"
                                  CreatedBy = None
                                  ContentBytes = Some contentBytes }

                            let! document = documents.CreateAsync(newDocument, httpContext.RequestAborted)
                            let! spec =
                                tirePressure.UpsertSpecAsync(
                                    { VehicleId = vehicleId
                                      FrontLeftPsi = frontLeftPsi
                                      FrontRightPsi = frontRightPsi
                                      RearLeftPsi = rearLeftPsi
                                      RearRightPsi = rearRightPsi
                                      Notes = Some aiResponse.Text
                                      PhotoDocumentId = Some document.Id },
                                    httpContext.RequestAborted
                                )

                            return
                                Results.Ok(
                                    { Spec = TirePressureSpecResponse.fromDomain spec
                                      AiText = aiResponse.Text
                                      PhotoDocumentId = Some document.Id }
                                )
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

        app.MapGet(
            "/api/fleet/tire-alerts",
            Func<ITirePressureRepository, HttpContext, Task<IResult>>(fun tirePressure httpContext ->
                task {
                    let! entries = tirePressure.GetFleetAlertsAsync(httpContext.RequestAborted)
                    return entries |> List.map TireFleetAlertResponse.fromDomain |> List.toArray |> Results.Ok
                })
        )
        |> ignore

        app
