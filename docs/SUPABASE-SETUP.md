# Go Live with Supabase — Setup Runbook

Follow these steps to switch the live Vercel site from demo mode to your real
Supabase project. Order matters.

## 1. Apply the database schema (Supabase → SQL Editor)

Run each file's contents, in this order (paste and **Run**):

1. `database/schema.sql` — core tables (users, products, sales, café, WiFi…)
2. `database/print_schema.sql` — Print Manager tables (printers, jobs, paper, pricing)
3. `database/agent_schema.sql` — PC-agent support: live usage metrics, the
   session countdown, the remote-command queue, and agent access policies
4. `database/migrations/001_multi_tenancy.sql` — adds `organizations` +
   `user_organization_memberships`, tags every table with `organization_id`,
   and re-scopes RLS so tenants can never see each other's data. Safe to run
   against a fresh project or an already-live one (existing rows are
   auto-assigned to a "Default Organization").
5. `database/migrations/002_pharmacy_module.sql` — the Pharmacy module
   (medicines, batches/expiry, prescriptions, dispensing ledger).
6. `database/migrations/003_organization_signup.sql` — adds
   `signup_new_organization()`, which powers the "Create your workspace"
   self-service signup link on the Login page (see step 2 below).
7. `database/seed.sql` — demo data so every module (including Pharmacy) shows
   real records.

> **Re-running after a failed/partial attempt?** If you hit
> `relation "..." already exists`, run `database/reset.sql` **first** — it
> drops only this app's tables/functions/types (never Supabase's `auth`
> schema or your login users), giving a clean slate. Then run the files
> above in order. `reset.sql` is safe to run repeatedly.

## 2. Create your login user

The schema uses Supabase Auth — the old demo buttons no longer apply.

**Easiest path**: once migration 003 is applied and the app is redeployed
(step 3–4 below), just open the app and click **"Create your workspace"** on
the Login page. It creates your account, an organization, and makes you its
`ADMIN` — no SQL needed. Skip straight to **Verify** once you've done that.

**Manual path** (Supabase → Authentication → Users):

1. **Add user** → enter an email + password → enable **Auto Confirm User**.
2. Back in the **SQL Editor**, promote that user to Admin (replace the email):

   ```sql
   insert into public.users (id, name, email, role)
   select id, 'Workspace Owner', email, 'ADMIN'
   from auth.users
   where email = 'YOUR_LOGIN_EMAIL'
   on conflict (id) do update set role = 'ADMIN';
   ```

   Roles: `ADMIN` (full access), `STAFF` (POS/inventory/customers/pharmacy/WiFi),
   `CAFE_OPERATOR` (café/WiFi). Repeat for additional staff as needed.

3. Add the user to an organization — everyone must belong to at least one to
   see any data (RLS blocks reads/writes otherwise):

   ```sql
   insert into public.user_organization_memberships (user_id, org_id)
   select u.id, public.default_organization_id()
   from public.users u
   where u.email = 'YOUR_LOGIN_EMAIL'
   on conflict (user_id, org_id) do nothing;
   ```

   `public.default_organization_id()` resolves to (or creates) the single
   "Default Organization" — the right choice for the common single-tenant
   deployment. To host a second, independent business in the same Supabase
   project, insert a new row into `public.organizations` and membership rows
   pointing at its `id` instead.

## 3. Add environment variables (Vercel → Project → Settings → Environment Variables)

From Supabase **Project Settings → API**, copy the values and add both to the
**Production** environment (and Preview/Development if you want them there too):

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | `https://<your-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | your **anon / publishable** key (safe to expose) |

> Only use the **anon** key here. Never put the `service_role` key in a
> `VITE_*` variable — those are bundled into the browser and are public.

## 4. Redeploy

`VITE_*` variables are baked in at build time, so a **redeploy is required**
after adding them (Vercel → Deployments → ⋯ → Redeploy, or push any commit to
`main`). Once redeployed, the app connects to Supabase automatically —
`isSupabaseConfigured` flips on and all reads/writes hit your database.

## Verify

- Log in with the user from step 2.
- Inventory, Print Manager, Café, WiFi, and Pharmacy should show the seeded
  records.
- Create a POS sale, start a café session, or dispense a medicine — it should
  persist in Supabase (visible under **Table Editor**), confirming live
  writes and RLS are working.

## 5. (Optional) PC Agent on café workstations

The agent (`pc-agent/`) is a **Windows** Python service that reports live
usage (CPU/RAM/disk), tracks print jobs from the Windows spooler, runs the
per-second session countdown, and executes remote LOCK/RESTART commands.

On each café PC (Windows, Python 3.11+):

1. Copy the `pc-agent/` folder to the machine.
2. `pip install -r requirements.txt`
3. Copy `.env.example` to `.env` and set:
   - `SUPABASE_URL` — same project URL as the web app
   - `SUPABASE_ANON_KEY` — the same anon/publishable key
   - `COMPUTER_CODE` — must match a station in the app (e.g. `PC-01`)
4. Run it: `python agent.py` (foreground test), or install as a service:
   `python service.py install` then `python service.py start`.

The station's card in **Internet Café** will show its live CPU/RAM/disk and a
running **Prints** count; print jobs also flow into **Print Manager**.

> ⚠ **Security:** the agent uses the public anon/publishable key, so
> `agent_schema.sql` grants the `anon` role the narrow writes it needs. This
> suits trusted café LAN machines. For production, move agent writes behind a
> Supabase Edge Function using the `service_role` key (or per-device signed
> tokens) and drop the `anon` policies in `agent_schema.sql`.
