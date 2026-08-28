-- ============================================================================
-- MIGRATION 013: CLOSE REMAINING CROSS-TENANT RLS GAPS
--
-- Follow-up to migration 012. Two problems found while verifying 012 live:
--
-- 1) The column-level REVOKE in 012 (`revoke select (agent_secret) on
--    organizations from anon, authenticated`) was a no-op: Supabase grants
--    every role table-level SELECT on public tables by default, and a
--    column-level REVOKE cannot narrow a broader table-level GRANT that's
--    still in effect. Verified live: an authenticated admin's `select *`
--    still returned agent_secret in plaintext. Real fix is to revoke the
--    table-level grant entirely and re-grant only an explicit column list.
--
-- 2) A second sweep of every RLS policy (beyond the anon `USING (true)`
--    ones 012 already fixed) found six more that let a check pass for
--    ANY organization, not just the caller's own:
--
--      organizations / "Admins manage organizations" (ALL)
--        -- qual was bare `is_role(ARRAY['ADMIN'])`, no id scoping at all.
--        Any admin, of any org, could update/delete any org's row.
--
--      organizations / "Members and admins read organizations" (SELECT)
--        -- `id IN (own memberships) OR is_role(ARRAY['ADMIN'])`. The OR
--        branch has no id filter, so any admin could read every org's row
--        (including business_type, name -- and until this migration's
--        agent_secret grant fix, the secret too).
--
--      computer_commands / "Staff manage computer commands" (ALL)
--        -- bare `is_role(ARRAY['ADMIN','CAFE_OPERATOR'])`. Any admin/cafe
--        operator, of any org, could read/insert/update/delete any other
--        org's queued remote-control commands (LOCK/RESTART/SHUTDOWN etc).
--
--      printers / "Agent reads printers", "Agent updates printers"
--        -- anon, `USING (true)`. Same vulnerability class as the tables
--        012 already fixed, just missed from that migration's table list.
--
--      user_organization_memberships / "Admins manage memberships" (ALL)
--        -- bare `is_role(ARRAY['ADMIN'])`. The most severe of the six:
--        any admin of any org could INSERT a membership row for themself
--        (or anyone) into a completely different org -- full cross-tenant
--        privilege escalation, not just a data leak.
--
--      user_organization_memberships / "Users read own memberships"
--        -- `user_id = auth.uid() OR is_role(ARRAY['ADMIN'])`. Same OR
--        pattern as the organizations read policy: let any admin read
--        every org's membership list (who's in which org, with what role)
--        -- reconnaissance for the escalation above.
--
-- All six are fixed the same way: require the row's org id to be in the
-- caller's own current_org_ids(), same pattern already used correctly by
-- every other org-scoped policy in this schema (e.g. computers, wifi_*,
-- cafe_sessions, print_jobs).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Finish the agent_secret column protection: table-level REVOKE + an
--    explicit re-GRANT on everything except agent_secret. RLS still governs
--    *which rows* anon/authenticated can see; this governs which *columns*.
-- ---------------------------------------------------------------------------
revoke select on public.organizations from anon, authenticated;
grant select (id, name, created_at, business_type) on public.organizations to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) organizations: scope both policies to the caller's own org(s).
-- ---------------------------------------------------------------------------
drop policy if exists "Admins manage organizations" on public.organizations;
create policy "Admins manage organizations" on public.organizations for all
    using (is_role(array['ADMIN'::user_role]) and id in (select current_org_ids()))
    with check (is_role(array['ADMIN'::user_role]) and id in (select current_org_ids()));

drop policy if exists "Members and admins read organizations" on public.organizations;
create policy "Members and admins read organizations" on public.organizations for select
    using (id in (select current_org_ids()));

-- ---------------------------------------------------------------------------
-- 3) computer_commands: scope to commands whose computer belongs to the
--    caller's org (table has no organization_id column of its own).
-- ---------------------------------------------------------------------------
drop policy if exists "Staff manage computer commands" on public.computer_commands;
create policy "Staff manage computer commands" on public.computer_commands for all
    using (
        is_role(array['ADMIN'::user_role, 'CAFE_OPERATOR'::user_role])
        and computer_code in (
            select c.computer_code from public.computers c
            where c.organization_id in (select current_org_ids())
        )
    )
    with check (
        is_role(array['ADMIN'::user_role, 'CAFE_OPERATOR'::user_role])
        and computer_code in (
            select c.computer_code from public.computers c
            where c.organization_id in (select current_org_ids())
        )
    );

-- ---------------------------------------------------------------------------
-- 4) printers: same agent_secret_ok() scheme as migration 012's other
--    anon-facing agent tables. printers already has organization_id.
-- ---------------------------------------------------------------------------
drop policy if exists "Agent reads printers" on public.printers;
create policy "Agent reads printers" on public.printers for select
    to anon
    using (agent_secret_ok(organization_id));

drop policy if exists "Agent updates printers" on public.printers;
create policy "Agent updates printers" on public.printers for update
    to anon
    using (agent_secret_ok(organization_id))
    with check (agent_secret_ok(organization_id));

-- ---------------------------------------------------------------------------
-- 5) user_organization_memberships: scope both policies to the caller's
--    own org(s). This is the privilege-escalation fix.
-- ---------------------------------------------------------------------------
drop policy if exists "Admins manage memberships" on public.user_organization_memberships;
create policy "Admins manage memberships" on public.user_organization_memberships for all
    using (is_role(array['ADMIN'::user_role]) and org_id in (select current_org_ids()))
    with check (is_role(array['ADMIN'::user_role]) and org_id in (select current_org_ids()));

drop policy if exists "Users read own memberships" on public.user_organization_memberships;
create policy "Users read own memberships" on public.user_organization_memberships for select
    using (
        user_id = auth.uid()
        or (is_role(array['ADMIN'::user_role]) and org_id in (select current_org_ids()))
    );
