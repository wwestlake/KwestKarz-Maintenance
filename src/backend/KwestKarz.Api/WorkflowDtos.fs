namespace KwestKarz.Api

open System
open System.Text.Json

type WorkflowStepResponse =
    { Id: Guid
      WorkflowId: Guid
      StepKey: string
      Title: string
      Status: string
      SortOrder: int
      Data: JsonElement
      CreatedAt: DateTimeOffset
      UpdatedAt: DateTimeOffset }

type WorkflowInstanceResponse =
    { Id: Guid
      WorkflowType: string
      Title: string
      Status: string
      VehicleId: Guid option
      CurrentStepKey: string
      CreatedAt: DateTimeOffset
      UpdatedAt: DateTimeOffset
      CompletedAt: DateTimeOffset option
      CanceledAt: DateTimeOffset option
      Steps: WorkflowStepResponse array }

type CreateWorkflowRequest =
    { WorkflowType: string
      VehicleId: Guid option
      Title: string option
      InspectionKind: string option }

type UpdateWorkflowStepRequest =
    { Status: string
      Data: JsonElement option
      MakeCurrent: bool option }

type UpdateWorkflowStatusRequest =
    { Status: string
      CurrentStepKey: string option }

type Obd2ReportUploadResponse =
    { Workflow: WorkflowInstanceResponse
      DocumentId: Guid
      AiText: string
      ExtractedText: string }

type Obd2ReportUrlRequest =
    { Url: string }
