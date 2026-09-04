-- 036_advisor_fixes.sql
--
-- Mechanical fixes for the concrete, low-risk findings from a full
-- Supabase security + performance advisor sweep. Everything here preserves
-- exact existing behavior -- no policy semantics change, just how
-- Postgres evaluates them (or, for the function, pinning its search_path).
--
-- Deliberately NOT included (reported separately, not fixed here):
--   - 72 multiple_permissive_policies findings -- consolidating these
--     risks changing which rows are visible; too broad for a mechanical
--     pass.
--   - 16 unused_index findings -- advisory only, some may guard
--     rarely-run queries.
--   - extension_in_public (pg_net) -- operational risk to existing
--     cron/webhook usage outweighs the low-severity lint.
--   - auth_leaked_password_protection -- a Supabase Auth dashboard
--     toggle, not something a migration can set.
--   - SECURITY DEFINER function warnings, rls_enabled_no_policy on
--     RPC-only tables -- both expected by this app's design.

-- ---------------------------------------------------------------------
-- 1) function_search_path_mutable: pin search_path so this trigger
--    function can't be redirected by a caller's session search_path.
-- ---------------------------------------------------------------------
create or replace function public.sync_sale_payment_status()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
    if new.payment_method <> 'Credit' then
        new.amount_paid := new.total_amount;
    end if;

    if new.amount_paid >= new.total_amount then
        new.payment_status := 'paid';
    elsif new.amount_paid > 0 then
        new.payment_status := 'partial';
    else
        new.payment_status := 'unpaid';
    end if;

    return new;
end;
$function$;

-- ---------------------------------------------------------------------
-- 2) auth_rls_initplan: wrap auth.uid() in (select auth.uid()) so
--    Postgres evaluates it once per query (InitPlan) instead of once
--    per row. Same as the (select current_org_ids()) pattern already
--    used everywhere else in this schema. Expressions are otherwise
--    byte-for-byte identical to what's live today.
-- ---------------------------------------------------------------------
drop policy if exists "Users can create own staff profile" on public.users;
create policy "Users can create own staff profile"
  on public.users
  for insert
  with check ((id = (select auth.uid())) and (role = 'STAFF'::user_role));

drop policy if exists "Users read own profile or org admins read org members" on public.users;
create policy "Users read own profile or org admins read org members"
  on public.users
  for select
  using (
    (id = (select auth.uid()))
    or (
      is_role(array['ADMIN'::user_role])
      and (id in (
        select user_organization_memberships.user_id
        from user_organization_memberships
        where user_organization_memberships.org_id in (select current_org_ids())
      ))
    )
  );

drop policy if exists "Org admins and staff insert sales" on public.sales;
create policy "Org admins and staff insert sales"
  on public.sales
  for insert
  with check (
    ((select auth.uid()) = created_by)
    and (organization_id in (select current_org_ids()))
    and is_role(array['ADMIN'::user_role, 'STAFF'::user_role])
  );

drop policy if exists "Org members insert own activity logs" on public.activity_logs;
create policy "Org members insert own activity logs"
  on public.activity_logs
  for insert
  with check (
    ((select auth.uid()) = user_id)
    and (organization_id in (select current_org_ids()))
  );

drop policy if exists "Users read own memberships" on public.user_organization_memberships;
create policy "Users read own memberships"
  on public.user_organization_memberships
  for select
  using (
    (user_id = (select auth.uid()))
    or (is_role(array['ADMIN'::user_role]) and (org_id in (select current_org_ids())))
  );

-- ---------------------------------------------------------------------
-- 3) unindexed_foreign_keys: 17 FK columns with no covering index,
--    flagged by the performance advisor. Low-risk additive indexes --
--    speeds up FK-joined lookups and cascade checks, no behavior change.
-- ---------------------------------------------------------------------
create index if not exists idx_computer_provisioning_codes_created_by on public.computer_provisioning_codes (created_by);
create index if not exists idx_computer_provisioning_codes_org_id on public.computer_provisioning_codes (org_id);
create index if not exists idx_debt_payments_created_by on public.debt_payments (created_by);
create index if not exists idx_dispensing_records_customer_id on public.dispensing_records (customer_id);
create index if not exists idx_dispensing_records_dispensed_by on public.dispensing_records (dispensed_by);
create index if not exists idx_dispensing_records_medicine_id on public.dispensing_records (medicine_id);
create index if not exists idx_dispensing_records_prescription_item_id on public.dispensing_records (prescription_item_id);
create index if not exists idx_inventory_transactions_created_by on public.inventory_transactions (created_by);
create index if not exists idx_medicine_batches_created_by on public.medicine_batches (created_by);
create index if not exists idx_organization_invites_invited_by on public.organization_invites (invited_by);
create index if not exists idx_organization_invites_org_id on public.organization_invites (org_id);
create index if not exists idx_platform_audit_log_actor_id on public.platform_audit_log (actor_id);
create index if not exists idx_prescriptions_created_by on public.prescriptions (created_by);
create index if not exists idx_print_jobs_session_id on public.print_jobs (session_id);
create index if not exists idx_printing_orders_created_by on public.printing_orders (created_by);
create index if not exists idx_tenant_payments_org_id on public.tenant_payments (org_id);
create index if not exists idx_tenant_payments_recorded_by on public.tenant_payments (recorded_by);
