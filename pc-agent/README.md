# PC Agent v2

Production-ready structure with session management, heartbeat, cache, metrics,
and Windows service support.

## Install on a café PC (Windows)

### Option A: remote install (no admin needed on-site)

An admin generates a one-time code from **PC Agent Hub → Add a PC** in Uruu
OS (valid 48 hours, single use). Whoever is physically at the new PC — they
don't need to be an admin, or know anything about Supabase — opens an
**elevated** PowerShell (right-click Start → Terminal (Admin)) and pastes
the command shown, which already has the code baked in:

```powershell
$env:URUU_CODE = "ABCD1234"
irm https://raw.githubusercontent.com/uchi-c/dube-man-system/main/pc-agent/remote-install.ps1 | iex
```

That downloads the agent, resolves the code to the right organization, and
runs the real installer below with everything filled in automatically.

### Option B: manual install

Run from an **elevated** PowerShell (Run as Administrator):

```powershell
cd pc-agent
.\install.ps1 -SupabaseUrl "https://<tenant-ref>.supabase.co" `
              -SupabaseAnonKey "<tenant-anon-key>" `
              -OrganizationId "<this tenant's organizations.id>" `
              -ComputerCode "PC-01" `
              -AgentSecret "<this tenant's agent secret>"
```

The installer installs Python deps, writes `.env`, and registers/starts the
`UruuAgent` Windows service. Give each machine a **unique `-ComputerCode`**
(PC-01, PC-02, …) — this is a shared multi-tenant database, so every
`computer_code` must be globally unique across every tenant on this Uruu OS
instance, not just within your own organization.

### Finding your `-OrganizationId`

Uruu OS is one shared Supabase project across every tenant, so the agent
needs to be told explicitly which organization it belongs to — otherwise a
newly-registered computer silently lands under whichever organization was
created first *in the whole system*, not yours. The remote-install path
above resolves this automatically; for a manual install, get it from an
admin (Supabase SQL editor: `select id, name from organizations;`).

### AGENT_SECRET

Every request this agent makes is checked server-side against one secret
Postgres already generated and stored on the tenant's `organizations` row
(`agent_secret_ok()` in `database/migrations/012_pc_agent_authentication.sql`)
— it's **not** something you invent locally, and a made-up value will never
authenticate.

- **Remote install (Option A)** fetches it automatically as part of
  resolving the provisioning code — nothing to do here.
- **Manual install (Option B)** needs `-AgentSecret` passed explicitly. Get
  the real value from an admin: PC Agent Hub → **Agent secret** in Uruu OS
  (admin only), which calls `get_my_org_agent_secret()`. It's the same
  secret for every PC in that tenant — pass the same value to each.
- **Never reuse a secret across different tenants.**

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
