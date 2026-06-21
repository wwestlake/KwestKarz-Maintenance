namespace KwestKarz.Domain

open System
open System.Threading
open System.Threading.Tasks

type DiagnosticReport =
    { Id: Guid
      VehicleId: Guid
      WorkflowId: Guid option
      DocumentId: Guid option
      ReportedAt: DateTimeOffset
      FileName: string
      AiSummary: string
      CreatedAt: DateTimeOffset }

type NewDiagnosticReport =
    { VehicleId: Guid
      WorkflowId: Guid option
      DocumentId: Guid option
      ReportedAt: DateTimeOffset
      FileName: string
      AiSummary: string }

type IDiagnosticReportRepository =
    abstract member CreateAsync: report: NewDiagnosticReport * cancellationToken: CancellationToken -> Task<DiagnosticReport>
    abstract member ListForVehicleAsync: vehicleId: Guid * cancellationToken: CancellationToken -> Task<DiagnosticReport list>
