-- ============================================================================
-- MIGRATION 009: PC PROVISIONING CODES
-- Lets an admin generate a short, single-use code for a new PC install
-- instead of having to be physically at that machine to type out
-- -SupabaseUrl/-SupabaseAnonKey/-OrganizationId by hand. Whoever IS at the
-- PC (any employee, not necessarily technical) runs one PowerShell
-- one-liner and pastes the code -- pc-agent/remote-install.ps1 resolves it
-- to this org's id via resolve_pc_provisioning_code() below.
--
-- Low sensitivity by design: a leaked code only resolves to an
-- organization_id, which the agent already needs anyway and which carries
-- no privilege beyond what every PC agent already has (anon-role insert
-- into computers/computer_commands, scoped by the existing RLS policies
-- from migration 001). Single-use + a short expiry is just hygiene, not
-- load-bearing security.
--
-- Apply AFTER migration 008_temp_password_invites.sql.
-- Safe to re-run.
-- ============================================================================

create table if not exists public.computer_provisioning_codes (
    id uuid default gen_random_uuid() primary key,
    org_id uuid not null references public.organizations(id) on delete cascade,
    code text not null unique,
    computer_code text not null,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz default timezone('utc'::text, now()) not null,
    expires_at timestamptz default (timezone('utc'::text, now()) + interval '48 hours') not null,
    used_at timestamptz
);

alter table public.computer_provisioning_codes enable row level security;

-- Admins can see their own org's codes (to track/revoke), but there's no
-- direct anon/authenticated SELECT-by-code policy -- resolution always
-- goes through resolve_pc_provisioning_code() so the used/expiry checks
-- and the single-use marking can't be bypassed by a direct table read.
drop policy if exists "Org admins view their provisioning codes" on public.computer_provisioning_codes;
create policy "Org admins view their provisioning codes" on public.computer_provisioning_codes for select
    using (org_id in (select public.current_org_ids()) and public.is_role(array['ADMIN']::public.user_role[]));

comment on table public.computer_provisioning_codes is 'Short-lived, single-use codes an admin generates so a non-admin at a PC can install the agent by pasting one command, without the admin needing to be physically present or relay Supabase credentials by hand.';

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.create_pc_provisioning_code(p_computer_code text default null)
returns table (code text, computer_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_org_id uuid;
    v_code text;
    v_computer_code text := nullif(trim(p_computer_code), '');
begin
    if not public.is_role(array['ADMIN']::public.user_role[]) then
        raise exception 'Only an organization admin can generate a PC provisioning code';
    end if;

    select org_id into v_org_id from public.user_organization_memberships where user_id = auth.uid() limit 1;
    if v_org_id is null then
        raise exception 'You are not a member of any organization';
    end if;

    -- 8 chars from a fixed alphabet, avoiding ambiguous 0/O/1/I -- short
    -- enough to read aloud or retype from a phone screen, still ~1e12
    -- possibilities so guessing isn't practical within the 48h window.
    v_code := (
        select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', ceil(random() * 31)::int, 1), '')
        from generate_series(1, 8)
    );

    return query
    insert into public.computer_provisioning_codes (org_id, code, computer_code, created_by)
    values (v_org_id, v_code, coalesce(v_computer_code, 'PC-NEW'), auth.uid())
    returning computer_provisioning_codes.code, computer_provisioning_codes.computer_code, computer_provisioning_codes.expires_at;
end;
$$;

revoke all on function public.create_pc_provisioning_code(text) from public;
grant execute on function public.create_pc_provisioning_code(text) to authenticated;
revoke execute on function public.create_pc_provisioning_code(text) from anon;

comment on function public.create_pc_provisioning_code(text) is 'Admin-only: generates a short single-use code for a new PC install in the caller''s own organization.';

-- Anon-callable: the installer script running on a fresh PC has no
-- Supabase session yet, so this has to be reachable by the anon role --
-- same pattern as get_invite_info(). Marks the code used in the same
-- transaction so it can't be replayed.
create or replace function public.resolve_pc_provisioning_code(p_code text)
returns table (organization_id uuid, computer_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_row record;
begin
    select * into v_row from public.computer_provisioning_codes
    where code = upper(trim(p_code))
      and used_at is null
      and expires_at > timezone('utc'::text, now());

    if v_row is null then
        raise exception 'This code is invalid, expired, or already used. Ask your admin for a new one.';
    end if;

    update public.computer_provisioning_codes set used_at = timezone('utc'::text, now()) where id = v_row.id;

    return query select v_row.org_id, v_row.computer_code;
end;
$$;

revoke all on function public.resolve_pc_provisioning_code(text) from public;
grant execute on function public.resolve_pc_provisioning_code(text) to anon, authenticated;

comment on function public.resolve_pc_provisioning_code(text) is 'Anon-callable: resolves a still-valid provisioning code to its organization_id/computer_code and marks it used. Called by pc-agent/remote-install.ps1 during a fresh install.';
