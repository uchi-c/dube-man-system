-- ============================================================================
-- URUU OS — RESET (teardown)
-- Run this FIRST if a previous partial run left tables/types behind
-- (e.g. error: relation "users" already exists). It drops only this app's
-- objects — it does NOT touch Supabase's auth schema or your login users.
-- After running this, apply in order: schema.sql, print_schema.sql,
-- agent_schema.sql, migrations/001_multi_tenancy.sql,
-- migrations/002_pharmacy_module.sql, migrations/003_organization_signup.sql,
-- migrations/004_business_type.sql, seed.sql.
-- Safe to run repeatedly.
--
-- Going live and just want to remove seed.sql's demo rows (not tear down
-- the whole schema)? Use database/unseed.sql instead.
-- ============================================================================

-- Tables (CASCADE also removes their policies, triggers, indexes, and
-- publication membership). Order doesn't matter with CASCADE.
drop table if exists
  public.dispensing_records,
  public.prescription_items,
  public.prescriptions,
  public.medicine_batches,
  public.medicines,
  public.computer_commands,
  public.print_jobs,
  public.paper_inventory,
  public.print_pricing_settings,
  public.printers,
  public.sale_items,
  public.sales,
  public.inventory_transactions,
  public.printing_orders,
  public.cafe_sessions,
  public.activity_logs,
  public.wifi_usage_logs,
  public.wifi_sessions,
  public.wifi_packages,
  public.wifi_customers,
  public.router_settings,
  public.computers,
  public.customers,
  public.products,
  public.user_organization_memberships,
  public.organizations,
  public.users
  cascade;

-- Views (dropped before/independent of the tables above via CASCADE, listed
-- here for clarity — CASCADE on the underlying tables already removes them)
drop view if exists public.expiring_medicine_batches cascade;
drop view if exists public.medicine_stock_levels cascade;

-- Functions
drop function if exists public.is_role(public.user_role[]) cascade;
drop function if exists public.current_user_role() cascade;
drop function if exists public.process_sale_item_deduction() cascade;
drop function if exists public.log_user_activity(uuid, text) cascade;
drop function if exists public.calculate_print_job_financials() cascade;
drop function if exists public.deduct_paper_inventory() cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.current_org_ids() cascade;
drop function if exists public.default_organization_id() cascade;
drop function if exists public.bootstrap_default_organization() cascade;
drop function if exists public.auto_enroll_default_organization() cascade;
drop function if exists public.process_dispensing_deduction() cascade;
drop function if exists public.signup_new_organization(text, text) cascade;
drop function if exists public.signup_new_organization(text, text, text) cascade;

-- Enum types (drop after the tables that use them)
drop type if exists public.color_mode cascade;
drop type if exists public.paper_size cascade;
drop type if exists public.print_job_status cascade;
drop type if exists public.printer_status cascade;
drop type if exists public.prescription_status cascade;
drop type if exists public.medicine_dosage_form cascade;
drop type if exists public.business_type cascade;
drop type if exists public.user_role cascade;
