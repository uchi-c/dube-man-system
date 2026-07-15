# DEPLOYMENT README
## Dube Man Innovation / CaféOS — Business Management System

End-to-end guide to stand up this system in production: frontend, database
(multi-tenant + Pharmacy), café PC agents, tenant onboarding, and demo-data
cleanup. For a narrower "just flip the live site from demo mode to real
Supabase" walkthrough, see `docs/SUPABASE-SETUP.md`. For the older
one-Supabase-project-per-client model, see `scripts/provision-tenant/README.md`.

---

## 1. Prerequisites

- **Node.js** 18.x or 20.x, **npm** 9.x+
- A **Supabase** account (free tier is enough to start — see capacity notes
  in §6)
- **Vercel** account (or any static host that can serve a Vite build) for
  the frontend
- For café workstations: **Windows** PCs with **Python 3.10+** to run the
  PC agent (§5)

---

## 2. Local install & development

```bash
git clone <this-repo>
cd dube-man-system
npm install
cp .env.example .env    # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev              # http://localhost:3000
```

Without a `.env`, the app runs in **local demo mode** (`isSupabaseConfigured`
is false) against browser `localStorage` — useful for UI work, but the
Pharmacy module and Print Manager module require a real Supabase project
(they have no local-demo fallback by design).

Verification before shipping any change:

```bash
npm run lint    # tsc --noEmit
npm run build
npm run test    # vitest
```

---

## 3. Database setup

Apply these files **in order** in the Supabase SQL editor (or via `psql` /
the Supabase MCP `apply_migration` tool). Every file is idempotent — safe to
paste and run again.

| # | File | What it adds |
|---|------|---------------|
| 1 | `database/schema.sql` | Core tables: users, products, customers, sales, printing_orders, computers, cafe_sessions, activity_logs, WiFi tables |
| 2 | `database/print_schema.sql` | Print Manager: printers, print_jobs, paper_inventory, print_pricing_settings |
| 3 | `database/agent_schema.sql` | PC-agent support: live usage metrics, session countdown, remote command queue, anon-key agent policies |
| 4 | `database/migrations/001_multi_tenancy.sql` | `organizations` + `user_organization_memberships`; tags **every** table above with `organization_id`; re-scopes all RLS policies for tenant isolation |
| 5 | `database/migrations/002_pharmacy_module.sql` | Pharmacy: medicines, medicine_batches, prescriptions, prescription_items, dispensing_records |
| 6 | `database/seed.sql` *(optional)* | Demo data across every module so a fresh project shows a working system immediately |

If a run fails partway through (`relation "..." already exists`), run
`database/reset.sql` first — it drops only this app's objects (never
Supabase's `auth` schema or your login users) — then re-apply files 1–6 in
order.

Migration 001 is safe to run against an **already-live** project too: every
pre-existing row is auto-assigned to a "Default Organization" it creates on
first use, so nothing already deployed breaks. See `docs/ARCHITECTURE.md` §
Multi-Tenancy for how the isolation model works.

### Create your login and organization membership

```sql
-- 1. Promote the auth user you created in Authentication > Users to ADMIN
insert into public.users (id, name, email, role)
select id, 'Your Name', email, 'ADMIN'
from auth.users
where email = 'YOUR_LOGIN_EMAIL'
on conflict (id) do update set role = 'ADMIN';

-- 2. Add them to an organization — required, or RLS hides everything
insert into public.user_organization_memberships (user_id, org_id)
select u.id, public.default_organization_id()
from public.users u
where u.email = 'YOUR_LOGIN_EMAIL'
on conflict (user_id, org_id) do nothing;
```

`public.default_organization_id()` resolves to (or creates) the single
"Default Organization" — correct for a single-tenant deployment. See §6 to
onboard additional tenants into the same project.

---

## 4. Removing the demo seed data

Once you're ready to go live with real customers, remove the demo rows
`seed.sql` inserted — **without** touching your schema, organizations, users,
or any real data created since:

```bash
# In the Supabase SQL editor, paste and run:
database/unseed.sql
```

It deletes rows by their fixed demo UUIDs only, in dependency order (child
tables before parents), and ends with a verification query that returns
`remaining_seed_rows = 0` when clean.

If a delete fails with a foreign key violation, it means real data now
references a demo row (e.g. someone dispensed a medicine from a seeded
batch, or sold a seeded product). That's the database protecting your real
transaction history, not a bug — `unseed.sql` explains how to resolve each
case inline. This is a lighter alternative to `database/reset.sql`, which
tears down the *entire* schema and is only meant for recovering from a
broken partial install.

---

## 5. Frontend deployment (Vercel)

1. Push to GitHub.
2. Vercel → **New Project** → import the repo.
3. Set environment variables (Production, and Preview/Development if
   wanted):

   | Name | Value |
   |------|-------|
   | `VITE_SUPABASE_URL` | `https://<your-ref>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | your **anon/publishable** key |

   Only the anon key — `VITE_*` variables are bundled into the browser and
   are public. Never put the `service_role` key here.
4. Deploy. `VITE_*` values are baked in at build time, so **redeploy** any
   time you change them.

---

## 6. Multi-tenant onboarding & capacity

This system supports two deployment models — pick per client, or mix both:

### Shared multi-tenant (this migration): several orgs, one Supabase project

Isolation is enforced by Postgres row-level security via
`organization_id`, not by project boundaries. To onboard another tenant
into an **existing** project:

```sql
-- 1. Create the tenant
insert into public.organizations (name) values ('Acme Pharmacy') returning id;

-- 2. Create their login in Authentication > Users first, then:
insert into public.users (id, name, email, role)
select id, 'Acme Owner', email, 'ADMIN'
from auth.users where email = 'owner@acme-pharmacy.com'
on conflict (id) do update set role = 'ADMIN';

-- 3. Add them to the org created in step 1 (use its returned id)
insert into public.user_organization_memberships (user_id, org_id)
select u.id, '<org-id-from-step-1>'
from public.users u where u.email = 'owner@acme-pharmacy.com'
on conflict (user_id, org_id) do nothing;
```

That's it — RLS immediately scopes every module (Inventory, POS, Customers,
Pharmacy, Printing, WiFi) to that org. No code changes, no redeploy.

**How many tenants can one project hold?** There's no application-imposed
cap — `organizations` is just a table, and every RLS policy scales the same
way regardless of row count. The real limits are:

- **Supabase plan tier**: database size, concurrent connections, and Auth
  monthly active users are shared across *all* tenants in the project (Free
  tier: 500MB DB, 50k MAU; Pro tier and above scale considerably higher —
  check current limits at supabase.com/pricing). Total users across every
  tenant's staff count toward the one project's Auth MAU, since
  `auth.users` isn't partitioned by tenant.
- **Two globally-unique fields**: `computers.computer_code`/`computer_name`
  and `printers.windows_printer_name` are intentionally **not** scoped
  per-org (documented in `database/migrations/001_multi_tenancy.sql` and
  `docs/SECURITY-CHECKLIST.md` — the anon-key pc-agent has no organization
  context, so scoping these per-tenant would let two tenants' devices
  silently collide from the agent's point of view). In practice this means:
  every café/print tenant sharing one project needs **distinct** device and
  printer identifiers (e.g. prefix with a tenant short-code —
  `ACME-PC-01`, not `PC-01`). Tenants that don't use the café or Print
  Manager modules (e.g. a pharmacy-only or POS-only business) aren't
  affected by this at all.
- **wifi_customers.mac_address** stays globally unique too, but that's
  correct behavior — a MAC address is physically unique regardless of
  tenant.

For a handful of café/print tenants, agree on a naming convention up front.
For dozens+, or for any tenant that needs full physical isolation (its own
backups, its own Vercel domain, no shared device-naming coordination), use
the silo model instead.

### Silo model: one Supabase project per tenant

See `scripts/provision-tenant/README.md` — `schema-bundle.sql` there already
folds in files 1–5 from §3, so a fresh silo gets multi-tenancy scaffolding
(inert, since a silo only ever has one org) and the Pharmacy module for
free.

**Capacity here is bounded by your Supabase account's project quota**, not
by this app — e.g. a free-tier account is capped at a small number of
*concurrent active* free projects (2, as of writing; paid orgs raise this).
Each silo tenant is a separate project, so plan project-tier upgrades or
consolidate low-activity tenants into the shared model as you scale past
that.

---

## 7. PC Agent setup & install

The agent (`pc-agent/`) is a Windows Python service for café workstations:
live usage metrics (CPU/RAM/disk), print-job tracking from the Windows
spooler, per-second session countdown billing, and remote LOCK/RESTART
commands issued from the console.

### Install (per PC, elevated PowerShell — "Run as Administrator")

```powershell
cd pc-agent
.\install.ps1 -SupabaseUrl "https://<tenant-ref>.supabase.co" `
              -SupabaseAnonKey "<tenant-anon-key>" `
              -ComputerCode "PC-01"
```

This installs Python dependencies, writes `pc-agent/.env`, and
registers/starts the `DubeManAgent` Windows service. Requirements:
Python 3.10+ on PATH (installer checks and fails fast with instructions if
missing).

- **Give every machine a unique `-ComputerCode`** (`PC-01`, `PC-02`, …). If
  the project is shared multi-tenant (§6), prefix it per tenant
  (`ACME-PC-01`) — `computer_code` is globally unique across the whole
  project, not per-org.
- **All agents on one tenant's fleet must point at that tenant's Supabase
  project** — `SupabaseUrl` / `SupabaseAnonKey` come from that tenant's
  project settings, not a shared platform-wide key.

#### AGENT_SECRET

- Omit `-AgentSecret` and the installer generates a fresh 64-hex secret,
  printing only its length (never the value) — safe to omit for most
  installs.
- To share one secret across a tenant's whole PC fleet, generate it once and
  pass the same value to every install:
  ```powershell
  -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
  ```
- **Never reuse a secret across different tenants.**

### Verify / health-check

```powershell
.\install.ps1 -VerifyOnly
```

Reports whether every `.env` key is set (the secret shown only as a
character count), the Windows service status, and tails the last lines of
`agent.log`. After a successful install, the PC should appear in the
console (Internet Café / PC Agent Hub page) within one heartbeat interval
(`HEARTBEAT_INTERVAL`, default 30s).

### Security note

The agent authenticates with the project's public anon/publishable key, so
`agent_schema.sql` grants the `anon` role narrow, specific write access
(register/heartbeat a computer, update its own session, push printer
status, insert print jobs). This is an accepted MVP posture for trusted café
LAN machines — see `docs/SECURITY-CHECKLIST.md` for the documented follow-up
(move agent writes behind a service-role Edge Function or per-device signed
tokens before scaling to untrusted networks).

---

## 8. Post-deploy verification checklist

- [ ] `npm run lint && npm run build && npm run test` all pass
- [ ] Logged in with a real Supabase Auth user; role shows correctly
- [ ] That user has a row in `user_organization_memberships` (otherwise
      every page appears empty due to RLS)
- [ ] Inventory, POS, Customers, Pharmacy, Print Manager, Café, and WiFi all
      load without console errors
- [ ] A POS sale or a pharmacy dispense persists in Supabase's Table Editor
- [ ] If using café PCs: agent appears online in PC Agent Hub within one
      heartbeat interval
- [ ] Demo seed data removed (§4) before onboarding the first real customer
