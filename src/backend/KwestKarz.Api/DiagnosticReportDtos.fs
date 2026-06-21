namespace KwestKarz.Api

open System

type DiagnosticReportResponse =
    { Id: Guid
      VehicleId: Guid
      WorkflowId: Guid option
      DocumentId: Guid option
      ReportedAt: DateTimeOffset
      FileName: string
      AiSummary: string
      CreatedAt: DateTimeOffset }
