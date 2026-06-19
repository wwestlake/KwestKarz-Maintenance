namespace KwestKarz.Infrastructure

open System
open System.IO
open System.Threading
open System.Threading.Tasks

type StoredFile =
    { RelativePath: string
      SizeBytes: int64 }

type FileStorage(rootPath: string) =
    let absoluteRoot =
        if Path.IsPathFullyQualified(rootPath) then
            rootPath
        else
            Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, rootPath))

    member _.RootPath = absoluteRoot

    member _.SaveAsync(fileName: string, source: Stream, cancellationToken: CancellationToken) : Task<StoredFile> =
        task {
            let extension = Path.GetExtension(fileName)
            let relativeDirectory = Path.Combine(DateTimeOffset.UtcNow.ToString("yyyy"), DateTimeOffset.UtcNow.ToString("MM"))
            let storedName = $"{Guid.NewGuid():N}{extension}"
            let relativePath = Path.Combine(relativeDirectory, storedName)
            let targetDirectory = Path.Combine(absoluteRoot, relativeDirectory)
            Directory.CreateDirectory(targetDirectory) |> ignore

            let absolutePath = Path.Combine(absoluteRoot, relativePath)
            use target = File.Create(absolutePath)
            do! source.CopyToAsync(target, cancellationToken)
            return { RelativePath = relativePath; SizeBytes = target.Length }
        }

    member _.OpenRead(relativePath: string) =
        let absolutePath = Path.GetFullPath(Path.Combine(absoluteRoot, relativePath))

        if not (absolutePath.StartsWith(absoluteRoot, StringComparison.OrdinalIgnoreCase)) then
            invalidArg (nameof relativePath) "The requested file path is outside the storage root."

        File.OpenRead(absolutePath) :> Stream

    member _.Exists(relativePath: string) =
        let absolutePath = Path.GetFullPath(Path.Combine(absoluteRoot, relativePath))
        absolutePath.StartsWith(absoluteRoot, StringComparison.OrdinalIgnoreCase) && File.Exists(absolutePath)
