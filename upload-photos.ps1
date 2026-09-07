#requires -Version 7.0
<#
.SYNOPSIS
Upload one primary photo per vehicle using the authenticated app API.
.DESCRIPTION
Name each image after its license plate (for example ABC1234.jpg).
Set KWESTKARZ_AUTH_TOKEN to a current Firebase ID token or pass -AuthToken.
Use -WhatIf to check vehicle matches without uploading.
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)][string]$PhotosFolder,
    [uri]$ApiBaseUrl = 'http://localhost:5081',
    [string]$AuthToken = $env:KWESTKARZ_AUTH_TOKEN
)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($AuthToken)) { throw 'A Firebase ID token is required.' }
if ($ApiBaseUrl.Scheme -ne 'https' -and -not $ApiBaseUrl.IsLoopback) {
    throw 'Use HTTPS when connecting to a remote API.'
}
$imageFiles = @(Get-ChildItem -LiteralPath $PhotosFolder -File |
    Where-Object Extension -Match '^\.(jpg|jpeg|png|avif|webp|gif)$')
if ($imageFiles.Count -eq 0) { throw 'No supported image files found.' }
$headers = @{ Authorization = "Bearer $AuthToken" }
$baseUrl = $ApiBaseUrl.AbsoluteUri.TrimEnd('/')
$vehicles = @(Invoke-RestMethod -Uri "$baseUrl/api/vehicles" -Headers $headers)
$failureCount = 0
$successCount = 0
foreach ($file in $imageFiles) {
    $plate = $file.BaseName.Trim().ToUpperInvariant()
    $matches = @($vehicles | Where-Object { $_.licensePlate -and $_.licensePlate.Trim().ToUpperInvariant() -eq $plate })
    if ($matches.Count -ne 1) {
        Write-Warning "Skipping $($file.Name): expected one vehicle matching plate $plate, found $($matches.Count)."
        $failureCount++
        continue
    }
    $vehicleId = $matches[0].id
    if ($PSCmdlet.ShouldProcess("$plate at $baseUrl", "Upload $($file.Name) as primary photo")) {
        try {
            $mimeTypes = @{ '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.png' = 'image/png'; '.avif' = 'image/avif'; '.webp' = 'image/webp'; '.gif' = 'image/gif' }
            $client = [System.Net.Http.HttpClient]::new()
            $multipart = [System.Net.Http.MultipartFormDataContent]::new()
            try {
                $client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $AuthToken)
                $photoContent = [System.Net.Http.StreamContent]::new($file.OpenRead())
                $photoContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new($mimeTypes[$file.Extension.ToLowerInvariant()])
                $multipart.Add($photoContent, 'photo', $file.Name)
                $multipart.Add([System.Net.Http.StringContent]::new('true'), 'isPrimary')
                $response = $client.PostAsync("$baseUrl/api/vehicles/$vehicleId/photos", $multipart).GetAwaiter().GetResult()
                try { $null = $response.EnsureSuccessStatusCode() } finally { $response.Dispose() }
            } finally {
                $multipart.Dispose()
                $client.Dispose()
            }
            Write-Host "Uploaded $($file.Name) for $plate."
            $successCount++
        } catch {
            Write-Warning "Upload failed for $($file.Name). Check the API connection and token permissions."
            $failureCount++
        }
    }
}
Write-Host "Uploaded: $successCount. Failed or unmatched: $failureCount."
if ($failureCount -gt 0) { exit 1 }
