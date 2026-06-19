namespace KwestKarz.Api
#nowarn "20"

open System
open System.IO
open System.Net.Http
open System.Text
open Microsoft.AspNetCore.Authentication.JwtBearer
open Microsoft.AspNetCore.Authorization
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http.Json
open Microsoft.Extensions.Configuration
open Microsoft.Extensions.DependencyInjection
open Microsoft.Extensions.Hosting
open Microsoft.IdentityModel.Tokens
open KwestKarz.Domain
open KwestKarz.Infrastructure
open Npgsql

module Program =
    let exitCode = 0

    [<EntryPoint>]
    let main args =
        let builder = WebApplication.CreateBuilder(args)

        builder.Services.Configure<JsonOptions>(fun (options: JsonOptions) ->
            options.SerializerOptions.PropertyNamingPolicy <- System.Text.Json.JsonNamingPolicy.CamelCase
        )

        let authEnabled = builder.Configuration.GetValue<bool>("Auth:Enabled")

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
        builder.Services.AddScoped<IMaintenanceRepository, PostgresMaintenanceRepository>() |> ignore
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

        builder.Services.AddScoped<IAIConnection>(fun serviceProvider ->
            serviceProvider.GetRequiredService<OpenAIResponsesConnection>() :> IAIConnection
        )
        |> ignore

        let app = builder.Build()

        app.Services.GetRequiredService<DatabaseInitializer>().EnsureCreatedAsync(app.Lifetime.ApplicationStopping)
            .GetAwaiter()
            .GetResult()

        app.UseCors()

        if authEnabled then
            app.UseAuthentication() |> ignore
            app.UseAuthorization() |> ignore

        app.MapGet("/api/health", Func<string>(fun () -> "ok")) |> ignore
        VehicleEndpoints.mapVehicleEndpoints app |> ignore
        MaintenanceEndpoints.mapMaintenanceEndpoints app |> ignore
        DashboardEndpoints.mapDashboardEndpoints app |> ignore
        DocumentEndpoints.mapDocumentEndpoints app |> ignore
        AIEndpoints.mapAIEndpoints app |> ignore

        app.Run()

        exitCode
