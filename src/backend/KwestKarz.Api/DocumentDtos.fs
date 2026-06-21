namespace KwestKarz.Api

open System
open KwestKarz.Domain

type DocumentResponse =
    { Id: Guid
      OwnerType: string
      OwnerId: Guid
      Kind: string
      OriginalFileName: string
      ContentType: string
      SizeBytes: int64
      Description: string option
      CreatedBy: string option
      CreatedAt: DateTimeOffset }

module DocumentResponse =
    let fromDomain (document: StoredDocument) =
        { Id = document.Id
          OwnerType = DocumentOwnerType.toStorageValue document.OwnerType
          OwnerId = document.OwnerId
          Kind = DocumentKind.toStorageValue document.Kind
          OriginalFileName = document.OriginalFileName
          ContentType = document.ContentType
          SizeBytes = document.SizeBytes
          Description = document.Description
          CreatedBy = document.CreatedBy
          CreatedAt = document.CreatedAt }
