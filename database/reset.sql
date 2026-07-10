-- ============================================================================
-- DUBE MAN INNOVATION SYSTEM — RESET (teardown)
-- Run this FIRST if a previous partial run left tables/types behind
-- (e.g. error: relation "users" already exists). It drops only this app's
-- objects — it does NOT touch Supabase's auth schema or your login users.
-- After running this, apply in order: schema.sql, print_schema.sql, seed.sql.
-- Safe to run repeatedly.
-- ============================================================================

-- Tables (CASCADE also removes their policies, triggers, indexes, and
-- publication membership). Order doesn't matter with CASCADE.
drop table if exists
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
  public.users
  cascade;

-- Functions
drop function if exists public.is_role(public.user_role[]) cascade;
drop function if exists public.current_user_role() cascade;
drop function if exists public.process_sale_item_deduction() cascade;
drop function if exists public.log_user_activity(uuid, text) cascade;
drop function if exists public.calculate_print_job_financials() cascade;
drop function if exists public.deduct_paper_inventory() cascade;
drop function if exists public.set_updated_at() cascade;

-- Enum types (drop after the tables that use them)
drop type if exists public.color_mode cascade;
drop type if exists public.paper_size cascade;
drop type if exists public.print_job_status cascade;
drop type if exists public.printer_status cascade;
drop type if exists public.user_role cascade;
