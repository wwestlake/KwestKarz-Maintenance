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

        let directMatch = allowedVinPattern.Match(normalized)
        if directMatch.Success then
            Some directMatch.Value
        else
            let compact = Regex.Replace(normalized, "[^A-Z0-9]", "")
            let compactMatch = allowedVinPattern.Match(compact)
            if compactMatch.Success then Some compactMatch.Value else None

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

    let private writeScanLogAsync (dataSource: NpgsqlDataSource) (vin: string option) (aiText: string) (cancellationToken: Threading.CancellationToken) =
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

            let message = $"Parsed VIN={parsed}; AI={aiText}"
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

                    if isNull file || file.Length = 0L then
                        return Results.BadRequest("A multipart form image named 'file' is required.")
                    else
                        use stream = file.OpenReadStream()
                        use memory = new MemoryStream()
                        do! stream.CopyToAsync(memory, httpContext.RequestAborted)
                        let imageBase64 = Convert.ToBase64String(memory.ToArray())

                        let aiRequest =
                            { SystemInstructions =
                                Some "You read vehicle VIN plates and labels. Return JSON only. VINs are 17 characters and never contain I, O, or Q."
                              UserMessage =
                                "Read the VIN from this dashboard plate, windshield VIN plate, door jamb label, title, or paperwork. Return exactly this JSON shape: {\"vin\":\"17_CHARACTER_VIN_OR_EMPTY\",\"confidence\":\"high|medium|low\",\"notes\":\"brief note\"}. If the VIN is partly obscured, return the best candidate." }

                        let! response = ai.CompleteWithImageAsync(aiRequest, file.ContentType, imageBase64, httpContext.RequestAborted)
                        let vin = findVinFromAiText response.Text
                        do! writeScanLogAsync dataSource vin response.Text httpContext.RequestAborted
                        return Results.Ok({ Vin = vin; AiText = response.Text; Model = response.Model })
                })
        )
        |> ignore

        app
