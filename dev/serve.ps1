# Prosty serwer statyczny do testow lokalnych (bez Node i Pythona).
# Serwuje caly folder Documents (tryb ?local=1 importuje kod serwera z ../pl3y-server).
# Uruchom:  powershell -ExecutionPolicy Bypass -File dev\serve.ps1   ->  http://localhost:8092/rozejrzyj/
param([int]$Port = 8092)
$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.svg'='image/svg+xml'; '.json'='application/json'; '.png'='image/png'; '.ico'='image/x-icon'; '.webp'='image/webp' }
$l = [System.Net.HttpListener]::new()
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "Rozejrzyj: http://localhost:$Port/rozejrzyj/   (Ctrl+C konczy)"
try {
  while ($l.IsListening) {
    $c = $l.GetContext()
    $path = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath).TrimStart('/')
    if ($path -eq '' -or $path.EndsWith('/')) { $path += 'index.html' }
    $file = [System.IO.Path]::GetFullPath((Join-Path $root $path))
    if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      $c.Response.ContentType = $(if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' })
      $c.Response.Headers.Add('Cache-Control', 'no-store')
      $c.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else { $c.Response.StatusCode = 404 }
    $c.Response.Close()
  }
} finally { $l.Stop() }
