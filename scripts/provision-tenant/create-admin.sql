-- ============================================================================
-- Promote a tenant's owner account to ADMIN.
--
-- Prereq: create the login first in Supabase > Authentication > Users
-- (email + password), then copy that user's UID here.
--
-- The app reads roles from public.users (ADMIN / STAFF / CAFE_OPERATOR).
-- A fresh project has no rows there, so the first owner must be inserted by
-- hand — after this, they can add staff from the app.
--
-- Replace the three placeholder values, then run in the SQL editor.
-- ============================================================================

insert into public.users (id, name, email, role)
values (
  '00000000-0000-0000-0000-000000000000',  -- <-- auth user UID (Authentication > Users)
  'Client B Owner',                        -- <-- display name
  'owner@client-b.com',                    -- <-- must match the auth email
  'ADMIN'
)
on conflict (id) do update
  set role = 'ADMIN',
      name = excluded.name,
      email = excluded.email;
