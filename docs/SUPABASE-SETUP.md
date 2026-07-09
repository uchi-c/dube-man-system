# Go Live with Supabase — Setup Runbook

Follow these steps to switch the live Vercel site from demo mode to your real
Supabase project. Order matters.

## 1. Apply the database schema (Supabase → SQL Editor)

Run each file's contents, in this order (paste and **Run**):

1. `database/schema.sql` — core tables (users, products, sales, café, WiFi…)
2. `database/print_schema.sql` — Print Manager tables (printers, jobs, paper, pricing)
3. `database/seed.sql` — demo data so every module shows real records

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
