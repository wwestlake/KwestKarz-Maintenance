namespace KwestKarz.Api

open System

type BankStatementImportRecord =
    { Id: Guid
      StatementYear: int
      BankName: string
      AccountNumber: string
      AccountNickname: string option
      OriginalFileName: string
      ImportedAt: DateTimeOffset
      RowCount: int
      StoredRowCount: int
      Notes: string option
      CreatedBy: string option }
