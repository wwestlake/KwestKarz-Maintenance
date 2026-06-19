namespace KwestKarz.Infrastructure

open System
open System.Net.Http
open System.Net.Http.Headers
open System.Net.Http.Json
open System.Text.Json
open System.Threading
open System.Threading.Tasks
open KwestKarz.Domain

type OpenAIOptions =
    { ApiKey: string
      BaseUrl: string
      Model: string }

type OpenAIResponsesConnection(httpClient: HttpClient, options: OpenAIOptions) =
    let requireApiKey () =
        if String.IsNullOrWhiteSpace(options.ApiKey) then
            failwith "OpenAI:ApiKey is not configured."

    let extractText (json: JsonDocument) =
        let root = json.RootElement

        match root.TryGetProperty("output_text") with
        | true, value when value.ValueKind = JsonValueKind.String -> value.GetString()
        | _ ->
            match root.TryGetProperty("output") with
            | true, output when output.ValueKind = JsonValueKind.Array ->
                output.EnumerateArray()
                |> Seq.collect (fun item ->
                    match item.TryGetProperty("content") with
                    | true, content when content.ValueKind = JsonValueKind.Array ->
                        content.EnumerateArray()
                        |> Seq.choose (fun contentItem ->
                            match contentItem.TryGetProperty("text") with
                            | true, text when text.ValueKind = JsonValueKind.String -> Some(text.GetString())
                            | _ -> None)
                    | _ -> Seq.empty)
                |> String.concat Environment.NewLine
            | _ -> ""

    member _.CompleteWithImageAsync(request: AIRequest, imageContentType: string, imageBase64: string, cancellationToken: CancellationToken) : Task<AIResponse> =
        task {
            requireApiKey ()

            let instructions =
                request.SystemInstructions
                |> Option.defaultValue "You are a careful vehicle maintenance assistant. Extract visible facts from vehicle labels, VIN plates, tire pressure labels, paint code labels, receipts, and maintenance documents. If text is uncertain, say so."

            let body =
                {|
                    model = options.Model
                    instructions = instructions
                    input =
                        [|
                            {|
                                role = "user"
                                content =
                                    [|
                                        {| ``type`` = "input_text"; text = request.UserMessage |} :> obj
                                        {| ``type`` = "input_image"; image_url = $"data:{imageContentType};base64,{imageBase64}" |} :> obj
                                    |]
                            |}
                        |]
                |}

            use message = new HttpRequestMessage(HttpMethod.Post, "responses")
            message.Headers.Authorization <- AuthenticationHeaderValue("Bearer", options.ApiKey)
            message.Content <- JsonContent.Create(body)
            use! response = httpClient.SendAsync(message, cancellationToken)
            let! content = response.Content.ReadAsStringAsync(cancellationToken)

            if not response.IsSuccessStatusCode then
                failwith $"OpenAI request failed with status {(int response.StatusCode)}: {content}"

            use json = JsonDocument.Parse(content)
            return { Text = extractText json; Model = options.Model }
        }

    interface IAIConnection with
        member _.CompleteAsync(request: AIRequest, cancellationToken: CancellationToken) : Task<AIResponse> =
            task {
                requireApiKey ()

                let instructions =
                    request.SystemInstructions
                    |> Option.defaultValue "You are a practical fleet maintenance assistant for Kwest Karz. Answer directly, cite the data you used, and recommend next actions when useful."

                let body =
                    {|
                        model = options.Model
                        instructions = instructions
                        input = request.UserMessage
                    |}

                use message = new HttpRequestMessage(HttpMethod.Post, "responses")
                message.Headers.Authorization <- AuthenticationHeaderValue("Bearer", options.ApiKey)
                message.Content <- JsonContent.Create(body)
                use! response = httpClient.SendAsync(message, cancellationToken)
                let! content = response.Content.ReadAsStringAsync(cancellationToken)

                if not response.IsSuccessStatusCode then
                    failwith $"OpenAI request failed with status {(int response.StatusCode)}: {content}"

                use json = JsonDocument.Parse(content)
                return { Text = extractText json; Model = options.Model }
            }
