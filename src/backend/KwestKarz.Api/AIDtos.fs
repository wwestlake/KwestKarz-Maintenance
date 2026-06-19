namespace KwestKarz.Api

type AIChatRequest =
    { Message: string
      VehicleVin: string option }

type AIResponseDto =
    { Text: string
      Model: string }
