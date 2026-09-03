-- ============================================================================
-- MIGRATION 032: PLATFORM AUDIT LOG + BULK TENANT ANNOUNCEMENTS
--
-- Two genuinely missing platform-admin capabilities, shipped together
-- because the announcement send is the flagship first entry in the log:
--
--   1) platform_audit_log -- who did what, across every tenant. Until now
--      nothing recorded platform-admin actions (granting/revoking access,
--      editing a tenant's billing or modules, deleting a tenant). Locked
--      down the same way tenant_payments/debt_payments are: RLS enabled,
--      zero policies, reachable only through the functions below. Existing
--      mutating RPCs (set_platform_admin, update_tenant_billing,
--      update_tenant_extra_modules, delete_tenant_org) are retrofitted
--      with a direct insert -- kept intentionally minimal (4 of the most
--      consequential actions, not every RPC) to limit how much already-
--      live function surface this migration touches.
--
--   2) Bulk announcements -- a platform admin emailing every tenant owner
--      at once (e.g. "Smart Invoice is now available"). list_org_owner_emails()
--      mirrors the org_owner CTE already used in migration 024's billing
--      emails; the actual send happens in a new edge function
--      (send-platform-announcement) since RPCs can't call Resend directly,
--      which then logs the send via log_platform_announcement_sent().
-- ============================================================================

create table public.platform_audit_log (
    id uuid primary key default uuid_generate_v4(),
    actor_id uuid references public.users(id) on delete set null,
    actor_email text,
    action text not null,
    target_org_id uuid references public.organizations(id) on delete set null,
    target_org_name text,
    details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.platform_audit_log enable row level security;

comment on table public.platform_audit_log is 'One row per consequential platform-admin action, across every tenant. RLS enabled, zero policies -- written directly by the mutating RPCs below (set_platform_admin, update_tenant_billing, update_tenant_extra_modules, delete_tenant_org, log_platform_announcement_sent), read only via list_platform_admin_audit_log().';

create index platform_audit_log_created_at_idx on public.platform_audit_log(created_at desc);
create index platform_audit_log_target_org_id_idx on public.platform_audit_log(target_org_id);

-- ---------------------------------------------------------------------------
-- list_platform_admin_audit_log(): read the log. Platform-admin only.
-- ---------------------------------------------------------------------------
create or replace function public.list_platform_admin_audit_log(p_limit int default 100)
returns table (
    id uuid,
    actor_email text,
    action text,
    target_org_name text,
    details jsonb,
    created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if not public.is_platform_admin() then
        raise exception 'Only a platform admin can view the audit log';
    end if;

    if p_limit is null or p_limit < 1 or p_limit > 1000 then
        raise exception 'p_limit must be between 1 and 1000';
    end if;

    return query
    select l.id, l.actor_email, l.action, l.target_org_name, l.details, l.created_at
    from public.platform_audit_log l
    order by l.created_at desc
    limit p_limit;
end;
$$;

revoke all on function public.list_platform_admin_audit_log(int) from public;
grant execute on function public.list_platform_admin_audit_log(int) to authenticated;
revoke execute on function public.list_platform_admin_audit_log(int) from anon;

-- ---------------------------------------------------------------------------
-- Retrofit: set_platform_admin logs a grant/revoke.
-- ---------------------------------------------------------------------------
create or replace function public.set_platform_admin(p_user_id uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_admin_count int;
    v_target_email text;
begin
    if not public.is_platform_admin() then
        raise exception 'Only a platform admin can grant or revoke platform admin access';
    end if;

    if not exists (select 1 from public.users where id = p_user_id) then
        raise exception 'User not found';
    end if;

    if not p_is_admin then
        select count(*) into v_admin_count from public.users where is_platform_admin = true;
        if v_admin_count <= 1 then
            raise exception 'Cannot remove the last platform admin';
        end if;
    end if;

    update public.users set is_platform_admin = p_is_admin where id = p_user_id;

    select email into v_target_email from public.users where id = p_user_id;
    insert into public.platform_audit_log (actor_id, actor_email, action, details)
    values (
        auth.uid(),
        (select email from public.users where id = auth.uid()),
        case when p_is_admin then 'platform_admin.granted' else 'platform_admin.revoked' end,
        jsonb_build_object('target_user_id', p_user_id, 'target_email', v_target_email)
    );
end;
$$;

revoke all on function public.set_platform_admin(uuid, boolean) from public;
grant execute on function public.set_platform_admin(uuid, boolean) to authenticated;
revoke execute on function public.set_platform_admin(uuid, boolean) from anon;

-- ---------------------------------------------------------------------------
-- Retrofit: update_tenant_billing logs what was changed.
-- ---------------------------------------------------------------------------
create or replace function public.update_tenant_billing(
    p_org_id uuid,
    p_monthly_price numeric default null,
    p_currency text default null,
    p_subscription_status text default null,
    p_next_payment_due date default null,
    p_billing_notes text default null,
    p_clear_next_payment_due boolean default false,
    p_balance_due numeric default null,
    p_payment_method text default null,
    p_billing_cycle text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_org_name text;
begin
    if not public.is_platform_admin() then
        raise exception 'Only a platform admin can edit tenant billing';
    end if;

    if p_billing_cycle is not null and p_billing_cycle not in ('monthly', 'quarterly', 'yearly') then
        raise exception 'Unknown billing cycle: %', p_billing_cycle;
    end if;

    update public.organizations set
        monthly_price = coalesce(p_monthly_price, monthly_price),
        currency = coalesce(nullif(trim(p_currency), ''), currency),
        subscription_status = coalesce(p_subscription_status, subscription_status),
        next_payment_due = case when p_clear_next_payment_due then null else coalesce(p_next_payment_due, next_payment_due) end,
        billing_notes = coalesce(p_billing_notes, billing_notes),
        balance_due = coalesce(p_balance_due, balance_due),
        payment_method = coalesce(nullif(trim(p_payment_method), ''), payment_method),
        billing_cycle = coalesce(p_billing_cycle, billing_cycle)
    where id = p_org_id
    returning name into v_org_name;

    if not found then
        raise exception 'Tenant not found';
    end if;

    insert into public.platform_audit_log (actor_id, actor_email, action, target_org_id, target_org_name, details)
    values (
        auth.uid(),
        (select email from public.users where id = auth.uid()),
        'tenant.billing_updated',
        p_org_id,
        v_org_name,
        jsonb_strip_nulls(jsonb_build_object(
            'monthly_price', p_monthly_price, 'currency', p_currency, 'subscription_status', p_subscription_status,
            'next_payment_due', p_next_payment_due, 'balance_due', p_balance_due,
            'payment_method', p_payment_method, 'billing_cycle', p_billing_cycle
        ))
    );
end;
$$;

revoke all on function public.update_tenant_billing(uuid, numeric, text, text, date, text, boolean, numeric, text, text) from public;
grant execute on function public.update_tenant_billing(uuid, numeric, text, text, date, text, boolean, numeric, text, text) to authenticated;
revoke execute on function public.update_tenant_billing(uuid, numeric, text, text, date, text, boolean, numeric, text, text) from anon;

-- ---------------------------------------------------------------------------
-- Retrofit: update_tenant_extra_modules logs the new module set.
-- ---------------------------------------------------------------------------
create or replace function public.update_tenant_extra_modules(p_org_id uuid, p_extra_modules text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_allowed text[] := array['wifi', 'pc-agent', 'cafe'];
    v_invalid text[];
    v_org_name text;
begin
    if not public.is_platform_admin() then
        raise exception 'Only a platform admin can change a tenant''s enabled modules';
    end if;

    select array_agg(m) into v_invalid
    from unnest(p_extra_modules) m
    where m <> all(v_allowed);

    if v_invalid is not null then
        raise exception 'Unknown module(s): %', array_to_string(v_invalid, ', ');
    end if;

    update public.organizations set extra_modules = coalesce(p_extra_modules, '{}') where id = p_org_id
    returning name into v_org_name;

    if not found then
        raise exception 'Tenant not found';
    end if;

    insert into public.platform_audit_log (actor_id, actor_email, action, target_org_id, target_org_name, details)
    values (
        auth.uid(),
        (select email from public.users where id = auth.uid()),
        'tenant.modules_updated',
        p_org_id,
        v_org_name,
        jsonb_build_object('extra_modules', coalesce(p_extra_modules, '{}'))
    );
end;
$$;

revoke all on function public.update_tenant_extra_modules(uuid, text[]) from public;
grant execute on function public.update_tenant_extra_modules(uuid, text[]) to authenticated;
revoke execute on function public.update_tenant_extra_modules(uuid, text[]) from anon;

-- ---------------------------------------------------------------------------
-- Retrofit: delete_tenant_org logs the deletion (snapshot the name first --
-- the FK is ON DELETE SET NULL but this is a soft-delete, not a hard one,
-- so target_org_id stays populated too).
-- ---------------------------------------------------------------------------
create or replace function public.delete_tenant_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_org_name text;
begin
    if not public.is_platform_admin() then
        raise exception 'Only a platform admin can delete a tenant';
    end if;

    update public.organizations
    set deleted_at = now(),
        subscription_status = 'cancelled'
    where id = p_org_id
      and deleted_at is null
    returning name into v_org_name;

    if not found then
        raise exception 'Tenant not found (or already deleted)';
    end if;

    insert into public.platform_audit_log (actor_id, actor_email, action, target_org_id, target_org_name, details)
    values (auth.uid(), (select email from public.users where id = auth.uid()), 'tenant.deleted', p_org_id, v_org_name, '{}'::jsonb);
end;
$$;

revoke all on function public.delete_tenant_org(uuid) from public;
grant execute on function public.delete_tenant_org(uuid) to authenticated;
revoke execute on function public.delete_tenant_org(uuid) from anon;

-- ---------------------------------------------------------------------------
-- Bulk announcements -- recipient lookup + the log entry for a send.
-- ---------------------------------------------------------------------------
create or replace function public.list_org_owner_emails()
returns table (org_id uuid, org_name text, email text)
language plpgsql
security definer
set search_path = public
as $$
begin
    return query
    select distinct on (m.org_id) m.org_id, o.name, u.email::text
    from public.user_organization_memberships m
    join auth.users u on u.id = m.user_id
    join public.organizations o on o.id = m.org_id
    where o.deleted_at is null
    order by m.org_id, m.created_at asc;
end;
$$;

revoke all on function public.list_org_owner_emails() from public;
grant execute on function public.list_org_owner_emails() to service_role;

comment on function public.list_org_owner_emails() is 'Every org''s earliest member (the owner), by org -- same convention as get_pending_billing_emails''s org_owner CTE. service_role only; called by the send-platform-announcement edge function.';

create or replace function public.log_platform_announcement_sent(p_actor_id uuid, p_subject text, p_recipient_count int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.platform_audit_log (actor_id, actor_email, action, details)
    values (
        p_actor_id,
        (select email from public.users where id = p_actor_id),
        'announcement.sent',
        jsonb_build_object('subject', p_subject, 'recipient_count', p_recipient_count)
    );
end;
$$;

revoke all on function public.log_platform_announcement_sent(uuid, text, int) from public;
grant execute on function public.log_platform_announcement_sent(uuid, text, int) to service_role;

comment on function public.log_platform_announcement_sent(uuid, text, int) is 'service_role only. Called by send-platform-announcement right after Resend has been asked to send every recipient''s email (p_actor_id passed explicitly since the edge function calls this with the service-role client, where auth.uid() would resolve to nothing).';
