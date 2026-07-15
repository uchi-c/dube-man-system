<#
  Dube Man / CaféOS — PC Agent installer (Windows)
  ---------------------------------------------------------------------------
  Installs Python deps, writes .env, and registers the agent as a Windows
  service (DubeManAgent). Run from an ELEVATED PowerShell (Run as Administrator)
  because service install and the print spooler hook need admin rights.

  Examples
    # Full install for one PC (secret auto-generated if omitted)
    .\install.ps1 -SupabaseUrl "https://abc.supabase.co" `
                  -SupabaseAnonKey "eyJ..." `
                  -ComputerCode "PC-01"

    # Reuse a tenant-wide secret across that tenant's PCs
    .\install.ps1 -SupabaseUrl ... -SupabaseAnonKey ... -ComputerCode "PC-02" `
                  -AgentSecret "d41d8c...<64 hex>"

    # Just check health of an already-installed agent
    .\install.ps1 -VerifyOnly
#>
[CmdletBinding()]
param(
  [string]$SupabaseUrl,
  [string]$SupabaseAnonKey,
  [string]$ComputerCode = "PC-01",
  [string]$AgentSecret,
  [int]$HeartbeatInterval = 30,
  [switch]$VerifyOnly
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Definition
$envPath = Join-Path $here ".env"
$svcName = "DubeManAgent"

function Assert-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p  = New-Object Security.Principal.WindowsPrincipal($id)
  if (-not $p.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
    throw "Run this from an elevated PowerShell (Run as Administrator)."
  }
}

function Get-Python {
  foreach ($c in @("python", "py")) {
    $exe = (Get-Command $c -ErrorAction SilentlyContinue)
    if ($exe) { return $exe.Source }
  }
  throw "Python 3 not found on PATH. Install Python 3.10+ (check 'Add to PATH') and retry."
}

function New-Secret {
  # 32 random bytes -> 64 hex chars
  -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
}

# ----- Verify-only path -----------------------------------------------------
if ($VerifyOnly) {
  Write-Host "== Agent health check ==" -ForegroundColor Cyan
  if (Test-Path $envPath) {
    $keys = @("SUPABASE_URL","SUPABASE_ANON_KEY","COMPUTER_CODE","AGENT_SECRET")
    foreach ($k in $keys) {
      $line = Select-String -Path $envPath -Pattern "^$k=(.*)$"
      $val  = if ($line) { $line.Matches[0].Groups[1].Value } else { "" }
      $ok   = -not [string]::IsNullOrWhiteSpace($val)
      $shown = if ($k -eq "AGENT_SECRET" -and $ok) { "set (" + $val.Length + " chars)" }
               elseif ($ok) { $val } else { "MISSING" }
      Write-Host ("  {0,-18} {1}" -f $k, $shown) -ForegroundColor ($(if($ok){"Green"}else{"Red"}))
    }
  } else {
    Write-Host "  .env not found at $envPath" -ForegroundColor Red
  }
  $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
  if ($svc) { Write-Host ("  Service            {0}" -f $svc.Status) -ForegroundColor Green }
  else      { Write-Host  "  Service            NOT INSTALLED" -ForegroundColor Red }
  $log = Join-Path $here "agent.log"
  if (Test-Path $log) { Write-Host "`n-- last log lines --"; Get-Content $log -Tail 8 }
  return
}

# ----- Install path ---------------------------------------------------------
Assert-Admin

if ([string]::IsNullOrWhiteSpace($SupabaseUrl) -or [string]::IsNullOrWhiteSpace($SupabaseAnonKey)) {
  throw "SupabaseUrl and SupabaseAnonKey are required. See scripts/provision-tenant/agent.env.template."
}
if ([string]::IsNullOrWhiteSpace($AgentSecret)) {
  $AgentSecret = New-Secret
  Write-Host "Generated a new AGENT_SECRET for this install." -ForegroundColor Yellow
}

$python = Get-Python
Write-Host "Using Python: $python"

Write-Host "Installing dependencies..." -ForegroundColor Cyan
& $python -m pip install --upgrade pip | Out-Null
& $python -m pip install -r (Join-Path $here "requirements.txt")

Write-Host "Writing .env ($ComputerCode)..." -ForegroundColor Cyan
@"
SUPABASE_URL=$SupabaseUrl
SUPABASE_ANON_KEY=$SupabaseAnonKey
COMPUTER_CODE=$ComputerCode
HEARTBEAT_INTERVAL=$HeartbeatInterval
AGENT_SECRET=$AgentSecret
"@ | Set-Content -Path $envPath -Encoding UTF8

Write-Host "Registering Windows service ($svcName)..." -ForegroundColor Cyan
Push-Location $here
try {
  & $python service.py install
  & $python service.py start
} finally {
  Pop-Location
}

Start-Sleep -Seconds 2
$svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "Done. Service '$svcName' is: $($svc.Status)" -ForegroundColor Green
Write-Host "AGENT_SECRET length: $($AgentSecret.Length) (store it with this tenant's records)."
Write-Host "Health check any time:  .\install.ps1 -VerifyOnly"
