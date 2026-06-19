namespace KwestKarz.Api

open System
open KwestKarz.Domain
open KwestKarz.Infrastructure
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http

module AIEndpoints =
    let private vehicleContext (vehicle: Vehicle) =
        $"""
        Vehicle:
        VIN: {vehicle.Vin}
        Year: {vehicle.Year |> Option.map string |> Option.defaultValue "unknown"}
        Make: {vehicle.Make |> Option.defaultValue "unknown"}
        Model: {vehicle.Model |> Option.defaultValue "unknown"}
        Trim: {vehicle.Trim |> Option.defaultValue "unknown"}
        Color: {vehicle.Color |> Option.defaultValue "unknown"}
        Plate: {vehicle.LicensePlate |> Option.defaultValue "unknown"} {vehicle.LicensePlateState |> Option.defaultValue ""}
        Status: {VehicleStatus.toStorageValue vehicle.Status}
        Odometer: {vehicle.CurrentOdometer |> Option.map string |> Option.defaultValue "unknown"}
        Fleet number: {vehicle.FleetPositionNumber |> Option.defaultValue "unknown"}
        Notes: {vehicle.Notes |> Option.defaultValue ""}
        """

    let private documentContext (documents: StoredDocument list) =
        if List.isEmpty documents then
            "Documents: none attached."
        else
            documents
            |> List.map (fun document -> $"- {DocumentKind.toStorageValue document.Kind}: {document.OriginalFileName}, {document.ContentType}, {document.SizeBytes} bytes, uploaded {document.CreatedAt:u}")
            |> String.concat Environment.NewLine
            |> sprintf "Documents:%s%s" Environment.NewLine

    let private systemInstructions =
        """
        You are the KwestKarz maintenance assistant. Use the supplied vehicle and document metadata when present.
        Be practical and direct. If interpreting a camera image, extract visible labels such as VIN, tire pressure,
        paint code, emissions labels, part labels, receipt totals, and dates. State uncertainty when the image is unclear.
        Do not invent values that are not visible or present in the supplied data.
        """

    let mapAIEndpoints (app: WebApplication) =
        let group = app.MapGroup("/api/ai")

        group.MapPost(
            "/chat",
            Func<AIChatRequest, IAIConnection, IVehicleRepository, IDocumentRepository, HttpContext, Threading.Tasks.Task<IResult>>(fun request ai vehicles documents httpContext ->
                task {
                    let! vehicle =
                        match request.VehicleVin with
                        | Some vin when not (String.IsNullOrWhiteSpace vin) -> vehicles.FindByVinAsync(vin, httpContext.RequestAborted)
                        | _ -> Threading.Tasks.Task.FromResult(None)

                    let! relatedDocuments =
                        match vehicle with
                        | Some vehicle -> documents.ListForOwnerAsync(DocumentOwnerType.Vehicle, vehicle.Id, httpContext.RequestAborted)
                        | None -> Threading.Tasks.Task.FromResult([])

                    let context =
                        match vehicle with
                        | Some vehicle -> $"{vehicleContext vehicle}{Environment.NewLine}{documentContext relatedDocuments}"
                        | None -> "No specific vehicle context was provided."

                    let aiRequest =
                        { SystemInstructions = Some systemInstructions
                          UserMessage = $"{context}{Environment.NewLine}{Environment.NewLine}User question: {request.Message}" }

                    let! response = ai.CompleteAsync(aiRequest, httpContext.RequestAborted)
                    return Results.Ok({ Text = response.Text; Model = response.Model })
                })
        )
        |> ignore

        group.MapPost(
            "/interpret-image",
            Func<OpenAIResponsesConnection, IVehicleRepository, HttpContext, Threading.Tasks.Task<IResult>>(fun ai vehicles httpContext ->
                task {
                    let! form = httpContext.Request.ReadFormAsync(httpContext.RequestAborted)
                    let file = form.Files.GetFile("file")
                    let prompt = form["prompt"].ToString()
                    let vehicleVin = form["vehicleVin"].ToString()

                    if isNull file || file.Length = 0L then
                        return Results.BadRequest("A multipart form image named 'file' is required.")
                    else
                        let! vehicle =
                            if String.IsNullOrWhiteSpace(vehicleVin) then
                                Threading.Tasks.Task.FromResult(None)
                            else
                                vehicles.FindByVinAsync(vehicleVin, httpContext.RequestAborted)

                        use stream = file.OpenReadStream()
                        use memory = new IO.MemoryStream()
                        do! stream.CopyToAsync(memory, httpContext.RequestAborted)
                        let imageBase64 = Convert.ToBase64String(memory.ToArray())
                        let userPrompt =
                            if String.IsNullOrWhiteSpace(prompt) then
                                "Read this vehicle-related image and extract useful maintenance data."
                            else
                                prompt

                        let context =
                            match vehicle with
                            | Some vehicle -> vehicleContext vehicle
                            | None -> "No specific vehicle context was provided."

                        let aiRequest =
                            { SystemInstructions = Some systemInstructions
                              UserMessage = $"{context}{Environment.NewLine}{Environment.NewLine}Task: {userPrompt}" }

                        let! response = ai.CompleteWithImageAsync(aiRequest, file.ContentType, imageBase64, httpContext.RequestAborted)
                        return Results.Ok({ Text = response.Text; Model = response.Model })
                })
        )
        |> ignore

        app
