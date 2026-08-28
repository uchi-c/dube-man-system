<#
  Uruu Agent - remote install bootstrap
  ---------------------------------------------------------------------------
  Lets ANYONE physically at a PC install the agent by pasting one command
  and a short code - no need for the admin to be there, and no need for
  whoever IS there to know a Supabase URL, anon key, or organization id.
  An admin generates the code from PC Agent Hub in Uruu OS (valid 48 hours,
  single use); this script resolves it, downloads the agent, and hands off
  to the real installer (install.ps1) with everything filled in.

  Run from an ELEVATED PowerShell (Run as Administrator) - installing a
  Windows Service requires local admin rights no script can bypass.

  Usage (paste as-is, it will prompt for the code):
    irm https://raw.githubusercontent.com/uchi-c/dube-man-system/main/pc-agent/remote-install.ps1 | iex

  Or with the code included so there's nothing to type on-site:
    $env:URUU_CODE = "ABCD1234"
    irm https://raw.githubusercontent.com/uchi-c/dube-man-system/main/pc-agent/remote-install.ps1 | iex
#>
[CmdletBinding()]
param(
  [string]$Code = $env:URUU_CODE
)

$ErrorActionPreference = "Stop"

# Public anon key - safe to embed here the same way it's already shipped in
# the web app's client-side bundle. It cannot install/read/write anything
# on its own; every table it touches is gated by the RLS policies already
# enforced for every PC agent (see database/migrations/001_multi_tenancy.sql).
$SUPABASE_URL = "https://ubchapxkmbvofmymulpi.supabase.co"
$SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViY2hhcHhrbWJ2b2ZteW11bHBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5OTc4NjksImV4cCI6MjA5OTU3Mzg2OX0.DsVyCkndwnyEIecXpXbajdaCLAHnq52CtcoByrIPkEc"

function Assert-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p  = New-Object Security.Principal.WindowsPrincipal($id)
  if (-not $p.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
    throw "Run this from an elevated PowerShell (right-click Start -> Terminal (Admin), or Windows PowerShell (Admin))."
  }
}
Assert-Admin

if ([string]::IsNullOrWhiteSpace($Code)) {
  $Code = Read-Host "Enter the install code your admin gave you"
}
$Code = $Code.Trim()
if ([string]::IsNullOrWhiteSpace($Code)) {
  throw "A code is required. Ask your admin for one from PC Agent Hub in Uruu OS."
}

Write-Host "Resolving install code..." -ForegroundColor Cyan
$resolveUri = "$SUPABASE_URL/rest/v1/rpc/resolve_pc_provisioning_code"
try {
  $resolveBody = @{ p_code = $Code } | ConvertTo-Json
  $result = Invoke-RestMethod -Method Post -Uri $resolveUri -Headers @{
    "apikey"        = $SUPABASE_ANON_KEY
    "Authorization" = "Bearer $SUPABASE_ANON_KEY"
    "Content-Type"  = "application/json"
  } -Body $resolveBody
} catch {
  # PostgREST wraps a raised exception's message in the error response body -
  # surface that instead of a generic HTTP failure, since it already says
  # exactly what's wrong (invalid / expired / already used).
  $detail = $null
  try {
    $stream = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $detail = ($reader.ReadToEnd() | ConvertFrom-Json).message
  } catch { }
  throw ($(if ($detail) { $detail } else { "Could not reach Uruu OS to check that code. Check your internet connection and try again: $($_.Exception.Message)" }))
}

$row = if ($result -is [System.Array]) { $result[0] } else { $result }
if (-not $row -or -not $row.organization_id) {
  throw "That code did not resolve to an organization. Ask your admin for a new one."
}
$OrganizationId = $row.organization_id
$ComputerCode = $row.computer_code
$AgentSecret = $row.agent_secret
if ([string]::IsNullOrWhiteSpace($AgentSecret)) {
  throw "That code resolved but did not include an agent secret - the server-side code may be out of date. Ask your admin to check migration 012."
}
Write-Host "Code accepted - installing as $ComputerCode." -ForegroundColor Green

# ProgramData (not a user's Desktop/Documents) so the install doesn't
# depend on which account happens to be logged in - the service itself
# runs independently of any interactive session.
$installDir = Join-Path $env:ProgramData "UruuAgent"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null

Write-Host "Downloading Uruu Agent..." -ForegroundColor Cyan
$zipPath = Join-Path $env:TEMP "uruu-agent-$([guid]::NewGuid()).zip"
$extractPath = Join-Path $env:TEMP "uruu-agent-$([guid]::NewGuid())"
try {
  Invoke-WebRequest -Uri "https://github.com/uchi-c/dube-man-system/archive/refs/heads/main.zip" -OutFile $zipPath
  Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force

  $sourcePcAgent = Get-ChildItem -Path $extractPath -Directory | Select-Object -First 1 | ForEach-Object { Join-Path $_.FullName "pc-agent" }
  if (-not (Test-Path $sourcePcAgent)) {
    throw "Downloaded archive did not contain a pc-agent folder - the repository layout may have changed."
  }
  Copy-Item -Path (Join-Path $sourcePcAgent "*") -Destination $installDir -Recurse -Force
} finally {
  Remove-Item $zipPath -ErrorAction SilentlyContinue
  Remove-Item $extractPath -Recurse -ErrorAction SilentlyContinue
}

Write-Host "Handing off to the installer..." -ForegroundColor Cyan
Push-Location $installDir
try {
  & (Join-Path $installDir "install.ps1") `
    -SupabaseUrl $SUPABASE_URL `
    -SupabaseAnonKey $SUPABASE_ANON_KEY `
    -OrganizationId $OrganizationId `
    -ComputerCode $ComputerCode `
    -AgentSecret $AgentSecret
  if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
    throw "install.ps1 exited with code $LASTEXITCODE (see output above)"
  }
} finally {
  Pop-Location
}
