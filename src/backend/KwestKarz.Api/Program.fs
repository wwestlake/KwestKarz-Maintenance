namespace KwestKarz.Api
#nowarn "20"

open System
open System.Diagnostics
open System.IO
open System.Net.Http
open System.Text
open System.Threading.Tasks
open Microsoft.AspNetCore.Authentication.JwtBearer
open Microsoft.AspNetCore.Authorization
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Microsoft.AspNetCore.Http.Json
open Microsoft.Extensions.Configuration
open Microsoft.Extensions.DependencyInjection
open Microsoft.Extensions.Hosting
open Microsoft.IdentityModel.Tokens
open KwestKarz.Domain
open KwestKarz.Infrastructure
open Npgsql
open NpgsqlTypes

module Program =
    let exitCode = 0

    let private writeSystemLogAsync (dataSource: NpgsqlDataSource) (level: string) (source: string) (method: string) (path: string) (statusCode: Nullable<int>) (elapsedMs: Nullable<int>) (message: string) (exceptionText: string) cancellationToken =
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

            let optionalText (value: string) = if String.IsNullOrWhiteSpace(value) then box DBNull.Value else box value
            command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, Guid.NewGuid()) |> ignore
            command.Parameters.AddWithValue("logged_at", NpgsqlDbType.TimestampTz, DateTimeOffset.UtcNow) |> ignore
            command.Parameters.AddWithValue("level", NpgsqlDbType.Text, level) |> ignore
            command.Parameters.AddWithValue("source", NpgsqlDbType.Text, source) |> ignore
            command.Parameters.AddWithValue("method", NpgsqlDbType.Text, optionalText method) |> ignore
            command.Parameters.AddWithValue("path", NpgsqlDbType.Text, optionalText path) |> ignore
            command.Parameters.AddWithValue("status_code", NpgsqlDbType.Integer, if statusCode.HasValue then box statusCode.Value else box DBNull.Value) |> ignore
            command.Parameters.AddWithValue("elapsed_ms", NpgsqlDbType.Integer, if elapsedMs.HasValue then box elapsedMs.Value else box DBNull.Value) |> ignore
            command.Parameters.AddWithValue("message", NpgsqlDbType.Text, optionalText message) |> ignore
            command.Parameters.AddWithValue("exception", NpgsqlDbType.Text, optionalText exceptionText) |> ignore
            let! _ = command.ExecuteNonQueryAsync(cancellationToken)
            return ()
        }

    [<EntryPoint>]
    let main args =
        let builder = WebApplication.CreateBuilder(args)

        builder.Services.Configure<JsonOptions>(fun (options: JsonOptions) ->
            options.SerializerOptions.PropertyNamingPolicy <- System.Text.Json.JsonNamingPolicy.CamelCase
        )

        let authEnabled = builder.Configuration.GetValue<bool>("Auth:Enabled")
        let systemLogEnabled = builder.Configuration.GetValue<bool>("SystemLog:Enabled")

        builder.Services.AddCors(fun options ->
            options.AddDefaultPolicy(fun policy ->
                let allowedOrigins =
                    builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()

                if builder.Environment.IsDevelopment() && not authEnabled then
                    policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod() |> ignore
                elif isNull allowedOrigins || allowedOrigins.Length = 0 then
                    policy.AllowAnyHeader().AllowAnyMethod() |> ignore
                else
                    policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod() |> ignore
            )
        )
        |> ignore

        if authEnabled then
            let issuer = builder.Configuration.GetValue<string>("Auth:Issuer")
            let audience = builder.Configuration.GetValue<string>("Auth:Audience")
            let signingKey = builder.Configuration.GetValue<string>("Auth:SigningKey")

            if String.IsNullOrWhiteSpace(signingKey) then
                failwith "Auth:SigningKey is required when Auth:Enabled is true."

            builder.Services
                .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
                .AddJwtBearer(fun options ->
                    options.TokenValidationParameters <-
                        TokenValidationParameters(
                            ValidateIssuer = true,
                            ValidIssuer = issuer,
                            ValidateAudience = true,
                            ValidAudience = audience,
                            ValidateIssuerSigningKey = true,
                            IssuerSigningKey = SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)),
                            ValidateLifetime = true
                        )
                )
            |> ignore

            builder.Services.AddAuthorization(fun options ->
                options.FallbackPolicy <- AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build()
                options.AddPolicy("Administrator", fun policy -> policy.RequireRole("Administrator") |> ignore)
                options.AddPolicy("Operator", fun policy -> policy.RequireRole("Administrator", "Operator") |> ignore)
                options.AddPolicy("Viewer", fun policy -> policy.RequireRole("Administrator", "Operator", "Viewer") |> ignore)
            )
            |> ignore

        let connectionString =
            builder.Configuration.GetConnectionString("KwestKarz")

        if String.IsNullOrWhiteSpace(connectionString) then
            failwith "Connection string 'KwestKarz' is required."

        builder.Services.AddSingleton<NpgsqlDataSource>(fun _ -> NpgsqlDataSource.Create(connectionString)) |> ignore
        builder.Services.AddSingleton<DatabaseInitializer>() |> ignore
        builder.Services.AddSingleton<FileStorage>(fun _ ->
            let rootPath = builder.Configuration.GetValue<string>("Storage:RootPath")
            let configuredPath = if String.IsNullOrWhiteSpace(rootPath) then "storage" else rootPath
            let resolvedPath =
                if Path.IsPathFullyQualified(configuredPath) then
                    configuredPath
                else
                    Path.Combine(builder.Environment.ContentRootPath, configuredPath)

            FileStorage(resolvedPath)
        )
        |> ignore
        builder.Services.AddScoped<IVehicleRepository, PostgresVehicleRepository>() |> ignore
        builder.Services.AddScoped<ILockBoxRepository, PostgresLockBoxRepository>() |> ignore
        builder.Services.AddScoped<IMaintenanceRepository, PostgresMaintenanceRepository>() |> ignore
        builder.Services.AddScoped<ITirePressureRepository, PostgresTirePressureRepository>() |> ignore
        builder.Services.AddScoped<IDocumentRepository, PostgresDocumentRepository>() |> ignore

        builder.Services.AddSingleton<OpenAIOptions>(fun _ ->
            { ApiKey = builder.Configuration.GetValue<string>("OpenAI:ApiKey")
              BaseUrl = builder.Configuration.GetValue<string>("OpenAI:BaseUrl")
              Model = builder.Configuration.GetValue<string>("OpenAI:Model") }
        )
        |> ignore

        builder.Services.AddHttpClient<OpenAIResponsesConnection>(fun (serviceProvider: IServiceProvider) (client: HttpClient) ->
            let options = serviceProvider.GetRequiredService<OpenAIOptions>()

            if String.IsNullOrWhiteSpace(options.BaseUrl) then
                client.BaseAddress <- Uri("https://api.openai.com/v1/")
            else
                client.BaseAddress <- Uri(options.BaseUrl.TrimEnd('/') + "/")
        )
        |> ignore

        builder.Services.AddHttpClient<IVinDecoder, NhtsaVinDecoder>(fun (client: HttpClient) ->
            client.BaseAddress <- Uri("https://vpic.nhtsa.dot.gov/api/")
        )
        |> ignore

        builder.Services.AddScoped<IAIConnection>(fun serviceProvider ->
            serviceProvider.GetRequiredService<OpenAIResponsesConnection>() :> IAIConnection
        )
        |> ignore

        let app = builder.Build()

        app.Services.GetRequiredService<DatabaseInitializer>().EnsureCreatedAsync(app.Lifetime.ApplicationStopping)
            .GetAwaiter()
            .GetResult()

        app.UseCors()

        if systemLogEnabled then
            app.Use(Func<HttpContext, Func<Task>, Task>(fun (context: HttpContext) (next: Func<Task>) ->
                task {
                    let stopwatch = Stopwatch.StartNew()
                    let dataSource = context.RequestServices.GetRequiredService<NpgsqlDataSource>()
                    let path = context.Request.Path.ToString()
                    let method = context.Request.Method

                    try
                        do! next.Invoke()
                        stopwatch.Stop()
                        do!
                            writeSystemLogAsync
                                dataSource
                                "Information"
                                "ApiResponse"
                                method
                                path
                                (Nullable context.Response.StatusCode)
                                (Nullable(int stopwatch.ElapsedMilliseconds))
                                "Request completed"
                                null
                                context.RequestAborted
                    with ex ->
                        stopwatch.Stop()
                        do!
                            writeSystemLogAsync
                                dataSource
                                "Error"
                                "ApiResponse"
                                method
                                path
                                (Nullable 500)
                                (Nullable(int stopwatch.ElapsedMilliseconds))
                                "Request failed"
                                (ex.ToString())
                                context.RequestAborted
                        raise ex
                }
                :> Task))
            |> ignore

        if authEnabled then
            app.UseAuthentication() |> ignore
            app.UseAuthorization() |> ignore

        app.MapGet("/api/health", Func<string>(fun () -> "ok")) |> ignore
        VinEndpoints.mapVinEndpoints app |> ignore
        VehicleEndpoints.mapVehicleEndpoints app |> ignore
        LockBoxEndpoints.mapLockBoxEndpoints app |> ignore
        MaintenanceEndpoints.mapMaintenanceEndpoints app |> ignore
        TirePressureEndpoints.mapTirePressureEndpoints app |> ignore
        ComplianceEndpoints.mapComplianceEndpoints app |> ignore
        DashboardEndpoints.mapDashboardEndpoints app |> ignore
        DocumentEndpoints.mapDocumentEndpoints app |> ignore
        AIEndpoints.mapAIEndpoints app |> ignore
        WorkflowEndpoints.mapWorkflowEndpoints app |> ignore
        RentalInspectionEndpoints.mapRentalInspectionEndpoints app |> ignore

        app.Run()

        exitCode
