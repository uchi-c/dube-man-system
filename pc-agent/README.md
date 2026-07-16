# PC Agent v2

Production-ready structure with session management, heartbeat, cache, metrics,
and Windows service support.

## Install on a café PC (Windows)

Run from an **elevated** PowerShell (Run as Administrator):

```powershell
cd pc-agent
.\install.ps1 -SupabaseUrl "https://<tenant-ref>.supabase.co" `
              -SupabaseAnonKey "<tenant-anon-key>" `
              -ComputerCode "PC-01"
```

The installer installs Python deps, writes `.env`, and registers/starts the
`UruuAgent` Windows service. Give each machine a **unique `-ComputerCode`**
(PC-01, PC-02, …). All connection values must point at that **one tenant's**
Supabase project.

### AGENT_SECRET

- Omit `-AgentSecret` and the installer generates a fresh 64-hex secret for that
  PC and prints its length (never the value).
- To share one secret across a tenant's fleet, generate it once and pass the
  same `-AgentSecret "<64 hex>"` to every PC in that tenant. Generate one with:
  ```powershell
  -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
  ```
- **Never reuse a secret across different tenants.** Record each tenant's secret
  with its account (see the tenant dashboard).

### Verify / health-check

```powershell
.\install.ps1 -VerifyOnly
```

Confirms every `.env` key is set (secret shown as length only), reports the
service status, and tails `agent.log`. After install, the PC should appear in
the console (Internet Café / PC Agent Hub) within one heartbeat interval.

### Troubleshooting: service fails to register/start

`install.ps1` installs `pywin32` via pip, which does **not** register its
COM/service DLLs (`pythoncomXX.dll` / `pywintypesXX.dll`) into `System32`.
`python agent.py` run directly can still work despite that, but the Windows
Service Control Manager launches `pythonservice.exe` without your Python
env's `sys.path`, so `service.py install`/`start` fails with a DLL-load or
access error even though the earlier `pip install` step reported success.

The installer now runs `pywin32_postinstall.py -install` automatically before
registering the service, and removes any stale prior registration before
reinstalling, so simply **re-running `install.ps1`** fixes this in most
cases. If it still fails:

```powershell
# Re-register pywin32's DLLs manually
python "<path-to-python>\Scripts\pywin32_postinstall.py" -install

# Clear a broken leftover service registration
sc.exe delete UruuAgent
```

Then re-run `install.ps1`.
