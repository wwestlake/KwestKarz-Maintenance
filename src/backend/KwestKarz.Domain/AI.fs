namespace KwestKarz.Domain

open System.Threading
open System.Threading.Tasks

type AIRequest =
    { SystemInstructions: string option
      UserMessage: string }

type AIResponse =
    { Text: string
      Model: string }

type IAIConnection =
    abstract member CompleteAsync: request: AIRequest * cancellationToken: CancellationToken -> Task<AIResponse>
