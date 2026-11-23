# Installs hop, the command line app for the hop URL shortener, on Windows.
#
#   irm https://raw.githubusercontent.com/16bitsrl/hop/main/cli/install.ps1 | iex
#
# It downloads the program from the latest release, checks it against the published checksum, puts
# it in %LOCALAPPDATA%\hop\bin and adds that folder to your PATH. Run it again to update
# (or use `hop update`).
#
# Settings (environment variables):
#   HOP_INSTALL_DIR   where to put the program
#   HOP_VERSION       a version to install instead of the latest, like 1.2.3
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$repo = "16bitsrl/hop"
$api = if ($env:HOP_UPDATE_API) { $env:HOP_UPDATE_API } else { "https://api.github.com/repos/$repo/releases?per_page=30" }
$downloads = if ($env:HOP_DOWNLOAD_BASE) { $env:HOP_DOWNLOAD_BASE } else { "https://github.com/$repo/releases/download" }
$dir = if ($env:HOP_INSTALL_DIR) { $env:HOP_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA "hop\bin" }

$italian = (Get-Culture).Name -like "it*"
function Say($en, $it) { if ($italian) { Write-Host $it } else { Write-Host $en } }
function Fail($en, $it) { if ($italian) { throw "hop: $it" } else { throw "hop: $en" } }

$arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "amd64" }

$version = "$env:HOP_VERSION".TrimStart("v")
if (-not $version) {
  # Releases of the app are tagged cli-v1.2.3; the newest comes first in the list.
  # The parentheses matter: without them Windows PowerShell hands the whole list over as one item.
  $release = (Invoke-RestMethod -Uri $api -Headers @{ "User-Agent" = "hop-install" }) |
    Where-Object { $_.tag_name -match '^cli-v\d+\.\d+\.\d+$' -and -not $_.draft -and -not $_.prerelease } |
    Select-Object -First 1
  if (-not $release) { Fail "could not find the latest version. Check your connection and try again." "non trovo l'ultima versione. Controlla la connessione e riprova." }
  $version = $release.tag_name -replace '^cli-v', ''
}

$asset = "hop_windows_$arch.zip"
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("hop-install-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
try {
  Say "Downloading hop $version (windows/$arch)..." "Scarico hop $version (windows/$arch)..."
  Invoke-WebRequest -Uri "$downloads/cli-v$version/$asset" -OutFile (Join-Path $tmp $asset) -UseBasicParsing
  Invoke-WebRequest -Uri "$downloads/cli-v$version/checksums.txt" -OutFile (Join-Path $tmp "checksums.txt") -UseBasicParsing

  $want = (Get-Content (Join-Path $tmp "checksums.txt") | Where-Object { $_ -match "\s\*?$([regex]::Escape($asset))$" } | Select-Object -First 1) -split '\s+' | Select-Object -First 1
  $got = (Get-FileHash -Algorithm SHA256 -Path (Join-Path $tmp $asset)).Hash
  if (-not $want -or $want -ne $got) {
    Fail "the download does not match its checksum, so it was not installed." "il file scaricato non corrisponde al suo checksum, quindi non è stato installato."
  }

  Expand-Archive -Path (Join-Path $tmp $asset) -DestinationPath $tmp -Force
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $target = Join-Path $dir "hop.exe"
  # A running hop.exe cannot be overwritten, but it can be renamed out of the way.
  # The new program is first put beside the old one, so a failure leaves hop as it was.
  $staged = "$target.new"
  Move-Item (Join-Path $tmp "hop.exe") $staged -Force
  $old = "$target.hop-old"
  $hadOld = Test-Path $target
  if ($hadOld) {
    Remove-Item $old -Force -ErrorAction SilentlyContinue
    Rename-Item $target $old -Force
  }
  try {
    Move-Item $staged $target -Force
  }
  catch {
    if ($hadOld) { Rename-Item $old $target -Force }
    Remove-Item $staged -Force -ErrorAction SilentlyContinue
    throw
  }
  Remove-Item $old -Force -ErrorAction SilentlyContinue
}
finally {
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

Say "hop $version is installed in $target" "hop $version è installato in $target"

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (($userPath -split ';') -notcontains $dir) {
  [Environment]::SetEnvironmentVariable("Path", (@($userPath, $dir) | Where-Object { $_ }) -join ';', "User")
  $env:Path = "$env:Path;$dir"
  Say "  $dir was added to your PATH. Open a new terminal to use hop everywhere." "  $dir è stato aggiunto al tuo PATH. Apri un nuovo terminale per usare hop ovunque."
}
Say "  Next: hop login https://your-hop-address" "  Poi: hop login https://your-hop-address"
