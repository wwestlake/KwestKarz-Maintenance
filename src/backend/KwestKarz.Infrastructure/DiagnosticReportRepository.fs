namespace KwestKarz.Infrastructure

open System
open System.Threading
open System.Threading.Tasks
open KwestKarz.Domain
open Npgsql
open NpgsqlTypes

type PostgresDiagnosticReportRepository(dataSource: NpgsqlDataSource) =
    let optGuid (v: Guid option) = v |> Option.map box |> Option.defaultValue (box DBNull.Value)

    interface IDiagnosticReportRepository with

        member _.CreateAsync(report: NewDiagnosticReport, cancellationToken: CancellationToken) : Task<DiagnosticReport> =
            task {
                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                let id = Guid.NewGuid()
                let now = DateTimeOffset.UtcNow

                use command =
                    new NpgsqlCommand(
                        """
                        insert into kwestkarzbusinessdata.diagnostic_reports
                            (id, vehicle_id, workflow_id, document_id, reported_at, file_name, ai_summary, created_at)
                        values
                            (@id, @vehicle_id, @workflow_id, @document_id, @reported_at, @file_name, @ai_summary, @created_at)
                        """,
                        connection
                    )

                command.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, id) |> ignore
                command.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, report.VehicleId) |> ignore
                command.Parameters.AddWithValue("workflow_id", NpgsqlDbType.Uuid, optGuid report.WorkflowId) |> ignore
                command.Parameters.AddWithValue("document_id", NpgsqlDbType.Uuid, optGuid report.DocumentId) |> ignore
                command.Parameters.AddWithValue("reported_at", NpgsqlDbType.TimestampTz, report.ReportedAt) |> ignore
                command.Parameters.AddWithValue("file_name", NpgsqlDbType.Text, report.FileName) |> ignore
                command.Parameters.AddWithValue("ai_summary", NpgsqlDbType.Text, report.AiSummary) |> ignore
                command.Parameters.AddWithValue("created_at", NpgsqlDbType.TimestampTz, now) |> ignore
                let! _ = command.ExecuteNonQueryAsync(cancellationToken)

                return
                    { Id = id
                      VehicleId = report.VehicleId
                      WorkflowId = report.WorkflowId
                      DocumentId = report.DocumentId
                      ReportedAt = report.ReportedAt
                      FileName = report.FileName
                      AiSummary = report.AiSummary
                      CreatedAt = now }
            }

        member _.ListForVehicleAsync(vehicleId: Guid, cancellationToken: CancellationToken) : Task<DiagnosticReport list> =
            task {
                use! connection = dataSource.OpenConnectionAsync(cancellationToken)
                use command =
                    new NpgsqlCommand(
                        """
                        select id, vehicle_id, workflow_id, document_id, reported_at, file_name, ai_summary, created_at
                        from kwestkarzbusinessdata.diagnostic_reports
                        where vehicle_id = @vehicle_id
                        order by reported_at desc
                        limit 20
                        """,
                        connection
                    )

                command.Parameters.AddWithValue("vehicle_id", NpgsqlDbType.Uuid, vehicleId) |> ignore
                use! reader = command.ExecuteReaderAsync(cancellationToken)
                let results = System.Collections.Generic.List<DiagnosticReport>()

                while! reader.ReadAsync(cancellationToken) do
                    results.Add(
                        { Id = reader.GetGuid(0)
                          VehicleId = reader.GetGuid(1)
                          WorkflowId = if reader.IsDBNull(2) then None else Some(reader.GetGuid(2))
                          DocumentId = if reader.IsDBNull(3) then None else Some(reader.GetGuid(3))
                          ReportedAt = reader.GetFieldValue<DateTimeOffset>(4)
                          FileName = reader.GetString(5)
                          AiSummary = reader.GetString(6)
                          CreatedAt = reader.GetFieldValue<DateTimeOffset>(7) }
                    )

                return results |> Seq.toList
            }
