namespace KwestKarz.Api
#nowarn "20"

open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http.Json
open Microsoft.Extensions.DependencyInjection
open Microsoft.Extensions.Configuration
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

        let connectionString =
            builder.Configuration.GetConnectionString("KwestKarz")

        if System.String.IsNullOrWhiteSpace(connectionString) then
            failwith "Connection string 'KwestKarz' is required."

        builder.Services.AddSingleton<NpgsqlDataSource>(fun _ -> NpgsqlDataSource.Create(connectionString)) |> ignore
        builder.Services.AddSingleton<DatabaseInitializer>() |> ignore
        builder.Services.AddScoped<IVehicleRepository, PostgresVehicleRepository>() |> ignore

        let app = builder.Build()

        app.Services.GetRequiredService<DatabaseInitializer>().EnsureCreatedAsync(app.Lifetime.ApplicationStopping)
            .GetAwaiter()
            .GetResult()

        VehicleEndpoints.mapVehicleEndpoints app |> ignore

        app.Run()

        exitCode
