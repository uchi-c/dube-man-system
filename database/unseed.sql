-- ============================================================================
-- URUU OS — REMOVE DEMO SEED DATA
-- Deletes exactly the rows `seed.sql` inserted (matched by their fixed
-- demo UUIDs), leaving your schema, migrations, organizations, users and
-- any REAL data you've since created completely untouched.
--
-- This is NOT the same as reset.sql: reset.sql drops the entire schema
-- (tables, functions, types). This file only removes demo rows so you can
-- go live with a clean, empty catalog before onboarding real customers.
--
-- Safe to run repeatedly (every DELETE is a no-op once the rows are gone).
--
-- IMPORTANT — read before running:
-- If you (or anyone testing the demo) created REAL records on top of the
-- seed data — e.g. dispensed a medicine from a seeded batch, sold a seeded
-- product, or booked a seeded café computer — some deletes below will fail
-- with a foreign key violation instead of silently deleting your real
-- transaction history. That is intentional protection, not a bug. If a
-- statement fails:
--   1. Read the error — it names the table/row still referencing the demo
--      record (e.g. a dispensing_records row referencing a seed medicine).
--   2. Either delete that real row too (if it was only test data), or
--   3. Keep the demo catalog row — rename it (e.g. "Paracetamol" ->
--      "Paracetamol (500mg)") and treat it as real inventory instead of
--      deleting it.
-- Statements are ordered child-before-parent so a normal, untouched demo
-- install deletes cleanly top to bottom with no errors.
-- ============================================================================

-- ---- Pharmacy module ---------------------------------------------------------

delete from public.prescriptions where id in (
  '70030001-0000-4000-8000-000000000001'
); -- cascades to prescription_items automatically

delete from public.medicine_batches where id in (
  '70020001-0000-4000-8000-000000000001',
  '70020001-0000-4000-8000-000000000002',
  '70020001-0000-4000-8000-000000000003',
  '70020001-0000-4000-8000-000000000004',
  '70020001-0000-4000-8000-000000000005',
  '70020001-0000-4000-8000-000000000006'
);

delete from public.medicines where id in (
  '70010001-0000-4000-8000-000000000001',
  '70010001-0000-4000-8000-000000000002',
  '70010001-0000-4000-8000-000000000003',
  '70010001-0000-4000-8000-000000000004',
  '70010001-0000-4000-8000-000000000005',
  '70010001-0000-4000-8000-000000000006'
);

-- ---- Print Manager -------------------------------------------------------

delete from public.print_jobs where id in (
  '99990001-0000-4000-8000-000000000001',
  '99990001-0000-4000-8000-000000000002',
  '99990001-0000-4000-8000-000000000003',
  '99990001-0000-4000-8000-000000000004',
  '99990001-0000-4000-8000-000000000005',
  '99990001-0000-4000-8000-000000000006',
  '99990001-0000-4000-8000-000000000007',
  '99990001-0000-4000-8000-000000000008'
);

delete from public.paper_inventory where id in (
  '40090001-0000-4000-8000-000000000001',
  '40090001-0000-4000-8000-000000000002',
  '40090001-0000-4000-8000-000000000003'
);

delete from public.printers where id in (
  'eeee0001-0000-4000-8000-000000000001',
  'eeee0001-0000-4000-8000-000000000002',
  'eeee0001-0000-4000-8000-000000000003'
);

delete from public.print_pricing_settings where id in (
  '40080001-0000-4000-8000-000000000001'
);

-- ---- WiFi module -----------------------------------------------------------

delete from public.wifi_usage_logs where id in (
  '6b660001-0000-4000-8000-000000000001',
  '6b660001-0000-4000-8000-000000000002',
  '6b660001-0000-4000-8000-000000000003',
  '6b660001-0000-4000-8000-000000000004'
);

delete from public.wifi_sessions where id in (
  '5a550001-0000-4000-8000-000000000001',
  '5a550001-0000-4000-8000-000000000002',
  '5a550001-0000-4000-8000-000000000003'
);

delete from public.wifi_customers where id in (
  'cccc0001-0000-4000-8000-000000000001',
  'cccc0001-0000-4000-8000-000000000002',
  'cccc0001-0000-4000-8000-000000000003'
);

delete from public.wifi_packages where id in (
  'dddd0001-0000-4000-8000-000000000001',
  'dddd0001-0000-4000-8000-000000000002',
  'dddd0001-0000-4000-8000-000000000003',
  'dddd0001-0000-4000-8000-000000000004'
);

delete from public.router_settings where id in (
  '40070001-0000-4000-8000-000000000001'
);

-- ---- Internet café -----------------------------------------------------------

delete from public.cafe_sessions where id in (
  'cafe0001-0000-4000-8000-000000000001',
  'cafe0001-0000-4000-8000-000000000002'
);

delete from public.computers where id in (
  'bbbb0001-0000-4000-8000-000000000001',
  'bbbb0001-0000-4000-8000-000000000002',
  'bbbb0001-0000-4000-8000-000000000003',
  'bbbb0001-0000-4000-8000-000000000004',
  'bbbb0001-0000-4000-8000-000000000005',
  'bbbb0001-0000-4000-8000-000000000006'
);

-- ---- Printing / branding orders --------------------------------------------

delete from public.printing_orders where id in (
  'a1110001-0000-4000-8000-000000000001',
  'a1110001-0000-4000-8000-000000000002',
  'a1110001-0000-4000-8000-000000000003',
  'a1110001-0000-4000-8000-000000000004',
  'a1110001-0000-4000-8000-000000000005'
);

-- ---- Customers + products (POS / Inventory) --------------------------------

delete from public.customers where id in (
  'aaaa0001-0000-4000-8000-000000000001',
  'aaaa0001-0000-4000-8000-000000000002',
  'aaaa0001-0000-4000-8000-000000000003',
  'aaaa0001-0000-4000-8000-000000000004'
);

delete from public.products where id in (
  'ffff0001-0000-4000-8000-000000000001',
  'ffff0001-0000-4000-8000-000000000002',
  'ffff0001-0000-4000-8000-000000000003',
  'ffff0001-0000-4000-8000-000000000004',
  'ffff0001-0000-4000-8000-000000000005',
  'ffff0001-0000-4000-8000-000000000006'
);

-- ---- Verify --------------------------------------------------------------
-- Should return 0 rows across every seeded table once this completes clean.
select
  (select count(*) from public.products              where id::text like 'ffff0001%') +
  (select count(*) from public.customers              where id::text like 'aaaa0001%') +
  (select count(*) from public.printing_orders        where id::text like 'a1110001%') +
  (select count(*) from public.computers              where id::text like 'bbbb0001%') +
  (select count(*) from public.cafe_sessions          where id::text like 'cafe0001%') +
  (select count(*) from public.wifi_packages          where id::text like 'dddd0001%') +
  (select count(*) from public.wifi_customers         where id::text like 'cccc0001%') +
  (select count(*) from public.wifi_sessions          where id::text like '5a550001%') +
  (select count(*) from public.wifi_usage_logs        where id::text like '6b660001%') +
  (select count(*) from public.router_settings        where id::text like '40070001%') +
  (select count(*) from public.print_pricing_settings where id::text like '40080001%') +
  (select count(*) from public.printers               where id::text like 'eeee0001%') +
  (select count(*) from public.paper_inventory        where id::text like '40090001%') +
  (select count(*) from public.print_jobs             where id::text like '99990001%') +
  (select count(*) from public.medicines              where id::text like '70010001%') +
  (select count(*) from public.medicine_batches       where id::text like '70020001%') +
  (select count(*) from public.prescriptions          where id::text like '70030001%')
  as remaining_seed_rows; -- 0 = fully removed
