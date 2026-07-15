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

-- If schema-bundle.sql included migrations/001_multi_tenancy.sql (it does by
-- default), every user must also belong to an organization or RLS hides all
-- data from them. This silo has exactly one tenant, so map the owner to the
-- auto-created "Default Organization":
insert into public.user_organization_memberships (user_id, org_id)
values (
  '00000000-0000-0000-0000-000000000000',  -- <-- same auth user UID as above
  public.default_organization_id()
)
on conflict (user_id, org_id) do nothing;
