param([switch]$Once)
# Reads the Windows media session. The service is available to the signed-in desktop user.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
$propertiesType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime]
$streamType = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType=WindowsRuntime]
$random = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime]
$content = [Windows.Storage.Streams.IContentTypeProvider, Windows.Storage.Streams, ContentType=WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Wait-WinRT($operation, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
  if (!$task.Wait(4000)) { throw 'Windows media session timed out.' }
  $task.Result
}
$manager = Wait-WinRT ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$lastTrack = $null
$cover = $null
while ($true) {
  try {
    $session = $manager.GetCurrentSession()
    $playing = $session -and $session.GetPlaybackInfo().PlaybackStatus -eq 'Playing'
    if (!$playing) {
      $session = $manager.GetSessions() | Where-Object { $_.GetPlaybackInfo().PlaybackStatus -eq 'Playing' } | Select-Object -First 1
    }
    if (!$session) {
      $lastTrack = $null
      $cover = $null
      [Console]::WriteLine('null')
    } else {
      $properties = Wait-WinRT ($session.TryGetMediaPropertiesAsync()) $propertiesType
      $key = @($session.SourceAppUserModelId, $properties.Title, $properties.Artist, $properties.AlbumTitle) -join '|'
      if ($key -ne $lastTrack) {
        $cover = $null
        if ($properties.Thumbnail) {
          try {
            $art = Wait-WinRT ($properties.Thumbnail.OpenReadAsync()) $streamType
            try {
              # PowerShell's COM adapter does not expose inherited WinRT stream members.
              $size = $random.GetProperty('Size').GetValue($art)
              $mime = $content.GetProperty('ContentType').GetValue($art)
              if ($size -gt 0 -and $size -le 4194304 -and $mime -match '^image/(jpeg|png|webp|bmp|gif)$') {
                $reader = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType=WindowsRuntime]::new($random.GetMethod('GetInputStreamAt').Invoke($art, @([uint64]0)))
                try {
                  $length = Wait-WinRT ($reader.LoadAsync([uint32]$size)) ([uint32])
                  $bytes = [byte[]]::new($length)
                  $reader.ReadBytes($bytes)
                  $cover = 'data:' + $mime + ';base64,' + [Convert]::ToBase64String($bytes)
                } finally { if ([Runtime.InteropServices.Marshal]::IsComObject($reader)) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($reader) } }
              }
            } finally { if ([Runtime.InteropServices.Marshal]::IsComObject($art)) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($art) } }
          } catch { [Console]::Error.WriteLine($_.Exception.Message) }
        }
        $lastTrack = $key
      }
      $playing = $session.GetPlaybackInfo().PlaybackStatus -eq 'Playing'
      [Console]::WriteLine((@{title=$properties.Title;artist=$properties.Artist;album=$properties.AlbumTitle;playing=$playing;cover=$cover} | ConvertTo-Json -Compress))
    }
  } catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    [Console]::WriteLine('null')
  }
  if ($Once) { break }
  Start-Sleep -Milliseconds 1500
}


