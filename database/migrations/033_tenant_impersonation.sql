-- ============================================================================
-- MIGRATION 033: TENANT IMPERSONATION ("VIEW AS TENANT")
--
-- Lets a platform admin actually see what a tenant sees -- their real
-- Dashboard, POS, Inventory, everything -- for support/debugging, without
-- handling the tenant's real credentials or acting invisibly as them.
--
-- SECURITY MODEL:
--   - Reuses the multi-org membership system already in this codebase
--     (a user can belong to more than one organization -- see
--     user_organization_memberships / fetchUserOrganizations()) instead of
--     building a parallel session-swap mechanism. Starting impersonation
--     just inserts a TEMPORARY, TIME-LIMITED membership row for the
--     platform admin into the target org, tagged is_impersonation = true.
--     Every existing RLS policy and every existing page/component then
--     works completely unmodified -- no "impersonation mode" branch
--     anywhere in the frontend.
--   - current_org_ids() (the function nearly every RLS policy in this
--     schema is built on) is extended with a second branch: an
--     impersonation membership grants access only while
--     impersonation_expires_at is still in the future, and (unlike a real
--     membership) is NOT blocked by the target org being suspended/
--     past-due/locked -- a platform admin needs to be able to see what a
--     LOCKED tenant sees, that's often exactly why they're looking.
--   - Actions taken while impersonating are attributed to the platform
--     admin's own user id (created_by, etc), never to the tenant's real
--     user -- the tenant's own activity log stays honest, and the
--     platform admin can never be confused for one of the tenant's staff.
--   - Every start/end is written to platform_audit_log (migration 032) --
--     the same audit trail as every other consequential platform-admin
--     action.
--   - A grant cannot be created for an org the platform admin is already
--     a REAL member of (no reason to impersonate your own tenant), and an
--     upsert only ever extends an existing IMPERSONATION row, never
--     silently converts a real membership into one.
--   - Hourly cleanup cron physically deletes long-expired grant rows --
--     pure hygiene; current_org_ids() already stops honoring an expired
--     grant immediately regardless of whether the row still exists.
-- ============================================================================

alter table public.user_organization_memberships add column if not exists is_impersonation boolean not null default false;
alter table public.user_organization_memberships add column if not exists impersonation_expires_at timestamptz;

comment on column public.user_organization_memberships.is_impersonation is 'True for a temporary, platform-admin-only "view as tenant" grant (see start_tenant_impersonation()) rather than a real membership. Never set directly by client code.';
comment on column public.user_organization_memberships.impersonation_expires_at is 'When an is_impersonation row stops being honored by current_org_ids(). NULL for real memberships.';

-- ---------------------------------------------------------------------------
-- current_org_ids(): a valid, non-expired impersonation grant now also
-- counts, and bypasses the suspended/locked check a real membership is
-- subject to. Same signature, same STABLE SECURITY DEFINER SQL function --
-- a plain CREATE OR REPLACE is safe here.
-- ---------------------------------------------------------------------------
create or replace function public.current_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
    select m.org_id
    from public.user_organization_memberships m
    join public.organizations o on o.id = m.org_id
    where m.user_id = auth.uid()
      and o.deleted_at is null
      and (
          (m.is_impersonation and m.impersonation_expires_at > now())
          or (
              not m.is_impersonation
              and o.subscription_status not in ('suspended', 'cancelled')
              and not (o.subscription_status = 'trialing' and o.next_payment_due < current_date)
          )
      )
$$;

-- ---------------------------------------------------------------------------
-- start_tenant_impersonation(): the only way to create a grant.
-- ---------------------------------------------------------------------------
create or replace function public.start_tenant_impersonation(p_org_id uuid, p_minutes int default 20)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
    v_org_name text;
    v_expires_at timestamptz;
begin
    if not public.is_platform_admin() then
        raise exception 'Only a platform admin can view a tenant this way';
    end if;

    if p_minutes is null or p_minutes < 1 or p_minutes > 60 then
        raise exception 'p_minutes must be between 1 and 60';
    end if;

    select name into v_org_name from public.organizations where id = p_org_id and deleted_at is null;
    if v_org_name is null then
        raise exception 'Tenant not found';
    end if;

    if exists (
        select 1 from public.user_organization_memberships
        where user_id = auth.uid() and org_id = p_org_id and not is_impersonation
    ) then
        raise exception 'You are already a real member of this tenant -- no need to view it this way';
    end if;

    v_expires_at := now() + (p_minutes || ' minutes')::interval;

    insert into public.user_organization_memberships (user_id, org_id, is_impersonation, impersonation_expires_at)
    values (auth.uid(), p_org_id, true, v_expires_at)
    on conflict (user_id, org_id) do update
        set impersonation_expires_at = v_expires_at
        where public.user_organization_memberships.is_impersonation;

    insert into public.platform_audit_log (actor_id, actor_email, action, target_org_id, target_org_name, details)
    values (
        auth.uid(),
        (select email from public.users where id = auth.uid()),
        'tenant.impersonation_started',
        p_org_id,
        v_org_name,
        jsonb_build_object('duration_minutes', p_minutes, 'expires_at', v_expires_at)
    );

    return v_expires_at;
end;
$$;

revoke all on function public.start_tenant_impersonation(uuid, int) from public;
grant execute on function public.start_tenant_impersonation(uuid, int) to authenticated;
revoke execute on function public.start_tenant_impersonation(uuid, int) from anon;

comment on function public.start_tenant_impersonation(uuid, int) is 'Grants the calling platform admin temporary access to a tenant''s org (default 20, max 60 minutes) via a tagged membership row. Logs to platform_audit_log. Refuses to touch a real (non-impersonation) membership.';

-- ---------------------------------------------------------------------------
-- end_tenant_impersonation(): always safe to call on your own grant --
-- a no-op if it already expired or never existed.
-- ---------------------------------------------------------------------------
create or replace function public.end_tenant_impersonation(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_org_name text;
begin
    delete from public.user_organization_memberships
    where user_id = auth.uid() and org_id = p_org_id and is_impersonation;

    if not found then
        return;
    end if;

    select name into v_org_name from public.organizations where id = p_org_id;

    insert into public.platform_audit_log (actor_id, actor_email, action, target_org_id, target_org_name, details)
    values (auth.uid(), (select email from public.users where id = auth.uid()), 'tenant.impersonation_ended', p_org_id, v_org_name, '{}'::jsonb);
end;
$$;

revoke all on function public.end_tenant_impersonation(uuid) from public;
grant execute on function public.end_tenant_impersonation(uuid) to authenticated;
revoke execute on function public.end_tenant_impersonation(uuid) from anon;

-- ---------------------------------------------------------------------------
-- get_my_impersonation_status(): lets the frontend show a persistent
-- "you're viewing X as a platform admin" banner, driven by the real
-- server-side grant rather than a client-side flag that could drift out
-- of sync (a second tab, a grant that already expired, etc).
-- ---------------------------------------------------------------------------
create or replace function public.get_my_impersonation_status()
returns table (org_id uuid, org_name text, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
    select m.org_id, o.name, m.impersonation_expires_at
    from public.user_organization_memberships m
    join public.organizations o on o.id = m.org_id
    where m.user_id = auth.uid()
      and m.is_impersonation
      and m.impersonation_expires_at > now()
    order by m.impersonation_expires_at desc
    limit 1
$$;

revoke all on function public.get_my_impersonation_status() from public;
grant execute on function public.get_my_impersonation_status() to authenticated;
revoke execute on function public.get_my_impersonation_status() from anon;

-- ---------------------------------------------------------------------------
-- Hourly hygiene: physically delete grants that expired over an hour ago.
-- Not a security control (current_org_ids() already ignores an expired
-- grant the instant it expires) -- just keeps the table from accumulating
-- stale rows forever.
-- ---------------------------------------------------------------------------
select cron.schedule(
    'cleanup-expired-impersonation-hourly',
    '0 * * * *',
    $cron$
    delete from public.user_organization_memberships
    where is_impersonation and impersonation_expires_at < now() - interval '1 hour';
    $cron$
);
