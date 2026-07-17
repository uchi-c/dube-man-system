-- ============================================================================
-- MIGRATION 006: STAFF FINANCIAL REPORTING ACCESS
-- Staff need to track financial performance (daily/monthly/annual sales) on
-- the Reports/Overview dashboard, not just Admins. The dashboard's revenue
-- figures are already correctly org-scoped for everyone via
-- current_org_ids() — no RLS change is needed for that. But two of the
-- tables it reads from (print_jobs, cafe_sessions) had SELECT policies that
-- only allowed ADMIN (and, for cafe_sessions, CAFE_OPERATOR) to read them.
-- A Staff member opening the dashboard would silently see print/café
-- revenue as zero — not an error, just quietly wrong numbers — so this
-- widens both SELECT policies to include STAFF, matching the pattern
-- already used for products/sales (see 001_multi_tenancy.sql).
--
-- Write access to both tables is intentionally left untouched — Staff still
-- cannot create/modify print jobs or café sessions, only read the resulting
-- revenue figures.
--
-- Apply AFTER migration 005_team_invites.sql.
-- Safe to re-run.
-- ============================================================================

drop policy if exists "Org admins and cafe operators read cafe sessions" on public.cafe_sessions;
create policy "Org admins staff and cafe operators read cafe sessions" on public.cafe_sessions for select
    using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF','CAFE_OPERATOR']::public.user_role[]));

do $$
begin
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'print_jobs') then
        execute $p$drop policy if exists "Org admins read print jobs" on public.print_jobs$p$;
        execute $p$create policy "Org admins and staff read print jobs" on public.print_jobs for select using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]))$p$;
    end if;
end $$;
