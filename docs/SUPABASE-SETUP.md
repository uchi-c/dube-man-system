# Go Live with Supabase — Setup Runbook

Follow these steps to switch the live Vercel site from demo mode to your real
Supabase project. Order matters.

## 1. Apply the database schema (Supabase → SQL Editor)

Run each file's contents, in this order (paste and **Run**):

1. `database/schema.sql` — core tables (users, products, sales, café, WiFi…)
2. `database/print_schema.sql` — Print Manager tables (printers, jobs, paper, pricing)
3. `database/seed.sql` — demo data so every module shows real records
4. `database/agent_schema.sql` — PC-agent support: live usage metrics, the
   session countdown, the remote-command queue, and agent access policies
   (also seeds sample CPU/RAM/disk so the café cards show usage immediately)

> **Re-running after a failed/partial attempt?** If you hit
> `relation "..." already exists`, run `database/reset.sql` **first** — it
> drops only this app's tables/functions/types (never Supabase's `auth`
> schema or your login users), giving a clean slate. Then run the three
> files above in order. `reset.sql` is safe to run repeatedly.

## 2. Create your login user (Supabase → Authentication → Users)

The schema uses Supabase Auth — the old demo buttons no longer apply.

1. **Add user** → enter an email + password → enable **Auto Confirm User**.
2. Back in the **SQL Editor**, promote that user to Admin (replace the email):

   ```sql
   insert into public.users (id, name, email, role)
   select id, 'Dube Man (Owner)', email, 'ADMIN'
   from auth.users
   where email = 'YOUR_LOGIN_EMAIL'
   on conflict (id) do update set role = 'ADMIN';
   ```

   Roles: `ADMIN` (full access), `STAFF` (POS/inventory/customers/WiFi),
   `CAFE_OPERATOR` (café/WiFi). Repeat for additional staff as needed.

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
- Inventory, Print Manager, Café, and WiFi should show the seeded records.
- Create a POS sale or start a café session — it should persist in Supabase
  (visible under **Table Editor**), confirming live writes and RLS are working.

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
