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

module VinEndpoints =
    let private allowedVinPattern = Regex("[A-HJ-NPR-Z0-9]{17}", RegexOptions.Compiled)
    let private vinJsonPattern = Regex(@"(?i)""vin""\s*:\s*""([^""]*)""", RegexOptions.Compiled)
    let private vinWeights = [| 8; 7; 6; 5; 4; 3; 2; 10; 0; 9; 8; 7; 6; 5; 4; 3; 2 |]

    let private vinValue value =
        match value with
        | 'A' | 'J' -> Some 1
        | 'B' | 'K' | 'S' -> Some 2
        | 'C' | 'L' | 'T' -> Some 3
        | 'D' | 'M' | 'U' -> Some 4
        | 'E' | 'N' | 'V' -> Some 5
        | 'F' | 'W' -> Some 6
        | 'G' | 'P' | 'X' -> Some 7
        | 'H' | 'Y' -> Some 8
        | 'R' | 'Z' -> Some 9
        | digit when digit >= '0' && digit <= '9' -> Some(int digit - int '0')
        | _ -> None

    let private validCheckDigit (vin: string) =
        if String.IsNullOrWhiteSpace(vin) || vin.Length <> 17 then
            false
        else
            let mutable valid = true
            let mutable total = 0

            for index in 0 .. 16 do
                match vinValue vin.[index] with
                | Some value -> total <- total + (value * vinWeights[index])
                | None -> valid <- false

            if not valid then
                false
            else
                let remainder = total % 11
                let expected = if remainder = 10 then 'X' else char (int '0' + remainder)
                vin.[8] = expected

    let private normalizeOcrVinText (text: string) =
        if String.IsNullOrWhiteSpace(text) then
            ""
        else
            text.ToUpperInvariant()
                .Replace("I", "1")
                .Replace("O", "0")
                .Replace("Q", "0")

    let private findVinCandidate (text: string) =
        let normalized = normalizeOcrVinText text

        let candidates =
            [ normalized
              Regex.Replace(normalized, "[^A-Z0-9]", "") ]
            |> Seq.collect (fun value ->
                allowedVinPattern.Matches(value)
                |> Seq.cast<Match>
                |> Seq.map (fun matchResult -> matchResult.Value))
            |> Seq.distinct
            |> Seq.toArray

        candidates
        |> Array.tryFind validCheckDigit
        |> Option.orElseWith (fun () -> candidates |> Array.tryHead)

    let private findVinFromJson (text: string) =
        if String.IsNullOrWhiteSpace(text) then
            None
        else
            try
                use json = JsonDocument.Parse(text)
                match json.RootElement.TryGetProperty("vin") with
                | true, value when value.ValueKind = JsonValueKind.String ->
                    value.GetString() |> findVinCandidate
                | _ -> None
            with _ ->
                let matchResult = vinJsonPattern.Match(text)
                if matchResult.Success then
                    matchResult.Groups[1].Value |> findVinCandidate
                else
                    None

    let private findVinFromAiText (text: string) =
        match findVinFromJson text with
        | Some vin -> Some vin
        | None ->
            if vinJsonPattern.IsMatch(text) then
                None
            else
                findVinCandidate text

    let private parsedVinLogPattern = Regex(@"Parsed VIN=([A-HJ-NPR-Z0-9]{17}|None);", RegexOptions.Compiled)

    let private writeScanLogAsync (dataSource: NpgsqlDataSource) (clientId: string) (vin: string option) (aiText: string) (cancellationToken: Threading.CancellationToken) =
        task {
            use! connection = dataSource.OpenConnectionAsync(cancellationToken)
            use command =
                new NpgsqlCommand(
                    """
                    insert into kwestkarzbusinessdata.system_logs (
                        id, logged_at, level, source, method, path, status_code, elapsed_ms, message, exception
                    )
                    values (
                        @id, @logged_at, @level, @source, @method, @path, @status_code, @elapsed_ms, @message, @exception
                    )
                    """,
                    connection
                )

            let parsed =
                match vin with
                | Some value -> value
                | None -> "None"

            let message = $"Client={clientId}; Parsed VIN={parsed}; AI={aiText}"
            command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, Guid.NewGuid()) |> ignore
            command.Parameters.AddWithValue("logged_at", NpgsqlDbType.TimestampTz, DateTimeOffset.UtcNow) |> ignore
            command.Parameters.AddWithValue("level", NpgsqlDbType.Text, "Information") |> ignore
            command.Parameters.AddWithValue("source", NpgsqlDbType.Text, "VinScan") |> ignore
            command.Parameters.AddWithValue("method", NpgsqlDbType.Text, "POST") |> ignore
            command.Parameters.AddWithValue("path", NpgsqlDbType.Text, "/api/vin/scan-photo") |> ignore
            command.Parameters.AddWithValue("status_code", NpgsqlDbType.Integer, 200) |> ignore
            command.Parameters.AddWithValue("elapsed_ms", NpgsqlDbType.Integer, box DBNull.Value) |> ignore
            command.Parameters.AddWithValue("message", NpgsqlDbType.Text, message) |> ignore
            command.Parameters.AddWithValue("exception", NpgsqlDbType.Text, box DBNull.Value) |> ignore
            let! _ = command.ExecuteNonQueryAsync(cancellationToken)
            return ()
        }

    let private readLatestScanAsync (dataSource: NpgsqlDataSource) (clientId: string) (cancellationToken: Threading.CancellationToken) =
        task {
            use! connection = dataSource.OpenConnectionAsync(cancellationToken)
            use command =
                new NpgsqlCommand(
                    """
                    select logged_at, message
                    from kwestkarzbusinessdata.system_logs
                    where source = 'VinScan'
                      and logged_at > now() - interval '2 minutes'
                      and message like @client
                    order by logged_at desc
                    limit 1
                    """,
                    connection
                )

            command.Parameters.AddWithValue("client", NpgsqlDbType.Text, "Client=" + clientId + ";%") |> ignore

            use! reader = command.ExecuteReaderAsync(cancellationToken)
            let! hasRow = reader.ReadAsync(cancellationToken)

            if hasRow then
                let loggedAt = reader.GetFieldValue<DateTimeOffset>(0)
                let message = reader.GetString(1)
                let matchResult = parsedVinLogPattern.Match(message)

                let vin =
                    if matchResult.Success && matchResult.Groups[1].Value <> "None" then
                        Some matchResult.Groups[1].Value
                    else
                        None

                return { Vin = vin; LoggedAt = Some loggedAt }
            else
                return { Vin = None; LoggedAt = None }
        }

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

        group.MapPost(
            "/scan-photo",
            Func<OpenAIResponsesConnection, NpgsqlDataSource, HttpContext, Task<IResult>>(fun ai dataSource httpContext ->
                task {
                    let! form = httpContext.Request.ReadFormAsync(httpContext.RequestAborted)
                    let file = form.Files.GetFile("file")
                    let clientId =
                        let raw = form["clientId"].ToString()
                        if String.IsNullOrWhiteSpace(raw) then "unknown" else raw

                    if isNull file || file.Length = 0L then
                        return Results.BadRequest("A multipart form image named 'file' is required.")
                    else
                        use stream = file.OpenReadStream()
                        use memory = new MemoryStream()
                        do! stream.CopyToAsync(memory, httpContext.RequestAborted)
                        let imageBase64 = Convert.ToBase64String(memory.ToArray())

                        let aiRequest =
                            { SystemInstructions =
                                Some "You read vehicle VIN plates and labels. Return JSON only. VINs are exactly 17 characters, use A-Z and 0-9, and never contain I, O, or Q. Do not invent missing characters."
                              UserMessage =
                                "Read the VIN from this dashboard plate, windshield VIN plate, door jamb label, title, or paperwork. Return exactly this JSON shape: {\"vin\":\"17_CHARACTER_VIN_OR_EMPTY\",\"confidence\":\"high|medium|low\",\"notes\":\"brief note\"}. Prefer the clearest full 17-character VIN. If a character is uncertain, put the best visible candidate and explain the uncertainty in notes." }

                        let! response = ai.CompleteWithImageAsync(aiRequest, file.ContentType, imageBase64, httpContext.RequestAborted)
                        let vin = findVinFromAiText response.Text
                        do! writeScanLogAsync dataSource clientId vin response.Text httpContext.RequestAborted
                        return Results.Ok({ Vin = vin; AiText = response.Text; Model = response.Model })
                })
        )
        |> ignore

        group.MapGet(
            "/latest-scan/{clientId}",
            Func<string, NpgsqlDataSource, HttpContext, Task<IResult>>(fun clientId dataSource httpContext ->
                task {
                    if String.IsNullOrWhiteSpace(clientId) then
                        return Results.BadRequest("Client id is required.")
                    else
                        let! latest = readLatestScanAsync dataSource clientId httpContext.RequestAborted
                        return Results.Ok(latest)
                })
        )
        |> ignore

        app
