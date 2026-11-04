param([string]$Directory = 'A:\Projeto-BPMA-KPlatz\.data\validation\regularizacao-20261103')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFolder, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime] | Out-Null
$genericTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
$actionTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction'
} | Select-Object -First 1
function Wait-WinRt($Operation, [Type]$ResultType) {
    $task = $genericTask.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    $task.GetAwaiter().GetResult()
}
$directoryPath = (Resolve-Path -LiteralPath $Directory).Path
$targetFolder = Wait-WinRt ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync($directoryPath)) ([Windows.Storage.StorageFolder])
foreach ($pdfFile in Get-ChildItem -LiteralPath $directoryPath -Filter 'equipamentos-*.pdf') {
    $file = Wait-WinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($pdfFile.FullName)) ([Windows.Storage.StorageFile])
    $pdf = Wait-WinRt ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
    for ($pageIndex = 0; $pageIndex -lt $pdf.PageCount; $pageIndex++) {
        $page = $pdf.GetPage([uint32]$pageIndex)
        $png = Wait-WinRt ($targetFolder.CreateFileAsync($pdfFile.BaseName + '-page-' + ($pageIndex + 1) + '.png', [Windows.Storage.CreationCollisionOption]::ReplaceExisting)) ([Windows.Storage.StorageFile])
        $stream = Wait-WinRt ($png.OpenAsync([Windows.Storage.FileAccessMode]::ReadWrite)) ([Windows.Storage.Streams.IRandomAccessStream])
        $options = New-Object Windows.Data.Pdf.PdfPageRenderOptions
        $options.DestinationWidth = 1600
        $task = $actionTask.Invoke($null, @($page.RenderToStreamAsync($stream, $options)))
        $task.GetAwaiter().GetResult()
        $stream.Dispose()
        $page.Dispose()
    }
    Write-Output ($pdfFile.Name + ': ' + $pdf.PageCount + ' pages rasterized from the actual PDF')
}
