# Provision a new tenant (silo model)

This runbook stands up a **separate isolated Supabase project + frontend
deploy** per client — no code changes, complete physical data isolation. This
folder makes that repeatable (~10 minutes). `schema-bundle.sql` now includes
the multi-tenancy foundation and the Pharmacy module (see below), so a fresh
silo comes with both out of the box.

> **Silo vs. shared multi-tenant — which do I use?** The silo model (this
> folder) is great when a client needs hard physical isolation or its own
> Vercel domain. `database/migrations/001_multi_tenancy.sql` +
> `002_pharmacy_module.sql` (already folded into `schema-bundle.sql`) enable
> the *other* model too: several organizations sharing one Supabase project,
> isolated by row-level security instead of by project boundary — see
> `docs/ARCHITECTURE.md` § Multi-Tenancy. Once you're juggling many silo
> clients on nearly-identical infra, it's usually cheaper to onboard the next
> one as an `organizations` row in a shared project instead of a new silo.

## What each file is for

| File | Purpose |
|---|---|
| `schema-bundle.sql` | All schema in one paste — generated from `database/*.sql` in the right order. |
| `build-bundle.sh` | Regenerates `schema-bundle.sql` from source. Run after any schema change. |
| `provision.sh` | Optional: applies the schema via `psql` instead of the SQL editor. |
| `create-admin.sql` | Promotes the client's owner login to `ADMIN`. |
| `frontend.env.template` | Env vars for the client's Vercel deploy. |
| `agent.env.template` | Env vars for each PC's `pc-agent/.env`. |
| `tenant-dashboard.html` | Operator console — open in a browser to see/launch all tenants. Edit the `TENANTS` array (mirror of `tenants.json`). |
| `tenants.example.json` | Canonical registry shape; copy to `tenants.json`. |

For the per-PC agent install itself, use **`pc-agent/install.ps1`** (elevated
PowerShell) — it installs deps, writes `.env`, generates/records the
`AGENT_SECRET`, and registers the `DubeManAgent` service. See `pc-agent/README.md`.

## Checklist

### 1. Create the Supabase project
Supabase → New project (e.g. `cafeos-<client>`). Note the **Project URL** and
**anon/publishable key** (Settings → API).

### 2. Apply the schema
**Editor way:** open `schema-bundle.sql`, copy all, paste into the project's
SQL editor, Run.

**CLI way:** get the connection string (Settings → Database) and:
```bash
DATABASE_URL='postgresql://postgres:PWD@db.<ref>.supabase.co:5432/postgres' \
  scripts/provision-tenant/provision.sh
```
Do **not** load `seed.sql` for a real client — that's demo data. (Pass
`--seed` only for a throwaway demo.)

### 3. Create the owner login
Authentication → Users → Add user (email + password). Copy the new user's
**UID**, paste it into `create-admin.sql` (also set name + email), and run it
in the SQL editor.

### 4. Deploy the frontend
New Vercel project from this repo (or a second deployment). Set the two vars
from `frontend.env.template` to **this** project's URL + anon key. Give the
client their own subdomain. Deploy.

### 5. Configure the PC agent(s)
On each café PC, copy `pc-agent/` and create `pc-agent/.env` from
`agent.env.template`:
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` → this tenant's project
- `COMPUTER_CODE` → **unique per machine** (PC-01, PC-02, …)
- `AGENT_SECRET` → a **fresh** secret for this tenant (`openssl rand -hex 32`)

Then start the agent (`pc-agent/README.md`). It self-registers into
`computers` on first heartbeat; the workstation appears in the console.

### 6. Smoke test
- Sign in as the owner on the new subdomain.
- Confirm the PC shows up under Internet Café / PC Agent Hub with a live
  heartbeat.
- Run a test print on that PC → confirm the job lands in Print Manager.

## Print-agent-only clients
If a client wants **only** the printer agent (not POS/café), you still apply
the full `schema-bundle.sql` — the agent reads `computers` / `computer_commands`
and writes `print_jobs`, so those tables must exist. Just don't surface the
other nav sections to them.

## Isolation guarantee
Each tenant has its own database and its own keys, so cross-tenant data leakage
is impossible by construction — even though the anon key is public, it only
ever reaches that one client's project.
