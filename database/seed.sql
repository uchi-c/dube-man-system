-- ============================================================================
-- DUBE MAN INNOVATION SYSTEM — DEMO SEED DATA
-- Run in the Supabase SQL editor AFTER schema.sql, print_schema.sql,
-- migrations/001_multi_tenancy.sql and migrations/002_pharmacy_module.sql.
-- Populates every module so a fresh project shows a fully working system.
-- Safe to re-run: every insert uses ON CONFLICT DO NOTHING.
-- Note: This does NOT create login users — create those in
--       Authentication > Users, then run the admin-role snippet in the README.
-- ============================================================================

-- ---- Products (Inventory + POS catalog) ------------------------------------
insert into public.products (id, name, category, quantity, min_stock_level, buying_price, selling_price, supplier) values
  ('ffff0001-0000-4000-8000-000000000001', 'A4 Printing Paper (Ream - 500 sheets)',      'Stationery', 45,  10, 35.00,  55.00,  'Paper Corp Distributors'),
  ('ffff0001-0000-4000-8000-000000000002', 'Black Ballpoint Pens (Box of 50)',           'Stationery', 8,   10, 15.00,  25.00,  'Global Stationery Wholesalers'),
  ('ffff0001-0000-4000-8000-000000000003', 'Branded Polo Shirt Embroidery (Custom)',     'Embroidery', 120, 15, 60.00,  120.00, 'Textile Hub Ltd'),
  ('ffff0001-0000-4000-8000-000000000004', 'Heavy Duty Binding Combs (100 pack)',        'Printing',   5,   8,  40.00,  75.00,  'Office Depot Solutions'),
  ('ffff0001-0000-4000-8000-000000000005', 'Glossy Photo Paper (A4 Pack of 50)',         'Printing',   22,  5,  50.00,  90.00,  'Paper Corp Distributors'),
  ('ffff0001-0000-4000-8000-000000000006', 'Digital Scanning & Email (Per Document)',    'Digital',    1000, -1, 0.00,  5.00,   'Self-produced')
on conflict do nothing;

-- ---- Customers -------------------------------------------------------------
insert into public.customers (id, name, phone, email) values
  ('aaaa0001-0000-4000-8000-000000000001', 'Chisomo Kalua',        '+265 888 12 34 56', 'chisomo@gmail.com'),
  ('aaaa0001-0000-4000-8000-000000000002', 'Mphatso Phiri',        '+265 999 45 61 23', 'mphatso@yahoo.com'),
  ('aaaa0001-0000-4000-8000-000000000003', 'Tiwonge Gondwe',       '+265 882 11 22 33', 'tiwonge.g@hotmail.com'),
  ('aaaa0001-0000-4000-8000-000000000004', 'Limbe Primary School', '+265 111 88 77 66', 'info@limbe-school.edu')
on conflict do nothing;

-- ---- Printing / branding orders --------------------------------------------
insert into public.printing_orders (id, customer_id, description, quantity, amount, amount_paid, status) values
  ('a1110001-0000-4000-8000-000000000001', 'aaaa0001-0000-4000-8000-000000000001', '30x Wedding Invitation Cards - Embossed Glossy Finish', 30, 1500.00, 1000.00, 'Designing'),
  ('a1110001-0000-4000-8000-000000000002', 'aaaa0001-0000-4000-8000-000000000002', '15x Branded Polo Shirts with Dube General Dealers Logo Embroidery', 15, 1800.00, 1800.00, 'Printing'),
  ('a1110001-0000-4000-8000-000000000003', 'aaaa0001-0000-4000-8000-000000000004', '500x End of Term Academic Reports (B&W Double Sided, Stapled)', 500, 2500.00, 1250.00, 'Pending'),
  ('a1110001-0000-4000-8000-000000000004', 'aaaa0001-0000-4000-8000-000000000003', '10x A3 Business Showcase Posters Laminating & Printing', 10, 400.00, 400.00, 'Completed'),
  ('a1110001-0000-4000-8000-000000000005', 'aaaa0001-0000-4000-8000-000000000001', 'Personal CV Digital Copy & Professional Typing (3 pages)', 3, 150.00, 150.00, 'Collected')
on conflict do nothing;

-- ---- Café workstations -----------------------------------------------------
insert into public.computers (id, computer_name, computer_code, status, hourly_rate, rate_per_minute) values
  ('bbbb0001-0000-4000-8000-000000000001', 'Station PC-01', 'PC-01', 'Occupied',    60.00, 1.00),
  ('bbbb0001-0000-4000-8000-000000000002', 'Station PC-02', 'PC-02', 'Available',   60.00, 1.00),
  ('bbbb0001-0000-4000-8000-000000000003', 'Station PC-03', 'PC-03', 'Maintenance', 60.00, 1.00),
  ('bbbb0001-0000-4000-8000-000000000004', 'Station PC-04', 'PC-04', 'Occupied',    60.00, 1.00),
  ('bbbb0001-0000-4000-8000-000000000005', 'Station PC-05', 'PC-05', 'Available',   60.00, 1.00),
  ('bbbb0001-0000-4000-8000-000000000006', 'Station PC-06', 'PC-06', 'Available',   60.00, 1.00)
on conflict do nothing;

-- ---- Active café sessions (live billing tickers) ---------------------------
insert into public.cafe_sessions (id, computer_id, customer_name, start_time, rate_per_minute, status) values
  ('cafe0001-0000-4000-8000-000000000001', 'bbbb0001-0000-4000-8000-000000000001', 'Alex Phiri', now() - interval '90 minutes', 1.00, 'ACTIVE'),
  ('cafe0001-0000-4000-8000-000000000002', 'bbbb0001-0000-4000-8000-000000000004', 'Mary Banda', now() - interval '30 minutes', 1.00, 'ACTIVE')
on conflict do nothing;

-- ---- WiFi packages ---------------------------------------------------------
insert into public.wifi_packages (id, name, duration_minutes, price) values
  ('dddd0001-0000-4000-8000-000000000001', '30 Minutes Spark',      30,  350.00),
  ('dddd0001-0000-4000-8000-000000000002', '60 Minutes Pro',        60,  600.00),
  ('dddd0001-0000-4000-8000-000000000003', '120 Minutes Extreme',   120, 1100.00),
  ('dddd0001-0000-4000-8000-000000000004', '240 Minutes Enterprise',240, 2000.00)
on conflict do nothing;

-- ---- WiFi customers (device / MAC registry) --------------------------------
insert into public.wifi_customers (id, name, phone, device_name, mac_address) values
  ('cccc0001-0000-4000-8000-000000000001', 'Mercy Tembo',    '0998765432', 'iPhone-12-Pro',  '00:1A:2B:3C:4D:5E'),
  ('cccc0001-0000-4000-8000-000000000002', 'Chikondi Chuma', '0887654321', 'Tecno-Spark-10', '11:22:33:44:55:66'),
  ('cccc0001-0000-4000-8000-000000000003', 'George Kumwenda','0991234567', 'MacBookAir-M1',  'AA:BB:CC:DD:EE:FF')
on conflict do nothing;

-- ---- WiFi sessions (2 live, 1 expired) -------------------------------------
insert into public.wifi_sessions (id, customer_id, package_id, start_time, end_time, duration_minutes, amount, status) values
  ('5a550001-0000-4000-8000-000000000001', 'cccc0001-0000-4000-8000-000000000001', 'dddd0001-0000-4000-8000-000000000002', now() - interval '15 minutes', now() + interval '45 minutes', 60,  600.00,  'ACTIVE'),
  ('5a550001-0000-4000-8000-000000000002', 'cccc0001-0000-4000-8000-000000000002', 'dddd0001-0000-4000-8000-000000000001', now() - interval '40 minutes', now() - interval '10 minutes', 30,  350.00,  'EXPIRED'),
  ('5a550001-0000-4000-8000-000000000003', 'cccc0001-0000-4000-8000-000000000003', 'dddd0001-0000-4000-8000-000000000003', now() - interval '5 minutes',  now() + interval '115 minutes',120, 1100.00, 'ACTIVE')
on conflict do nothing;

-- ---- WiFi usage / audit logs -----------------------------------------------
insert into public.wifi_usage_logs (id, customer_id, device_name, mac_address, action, created_at) values
  ('6b660001-0000-4000-8000-000000000001', 'cccc0001-0000-4000-8000-000000000001', 'iPhone-12-Pro',  '00:1A:2B:3C:4D:5E', 'CONNECTED', now() - interval '15 minutes'),
  ('6b660001-0000-4000-8000-000000000002', 'cccc0001-0000-4000-8000-000000000002', 'Tecno-Spark-10', '11:22:33:44:55:66', 'CONNECTED', now() - interval '40 minutes'),
  ('6b660001-0000-4000-8000-000000000003', 'cccc0001-0000-4000-8000-000000000002', 'Tecno-Spark-10', '11:22:33:44:55:66', 'EXPIRED',   now() - interval '10 minutes'),
  ('6b660001-0000-4000-8000-000000000004', 'cccc0001-0000-4000-8000-000000000003', 'MacBookAir-M1',  'AA:BB:CC:DD:EE:FF', 'CONNECTED', now() - interval '5 minutes')
on conflict do nothing;

-- ---- Router gateway config -------------------------------------------------
insert into public.router_settings (id, router_name, router_brand, router_model, integration_type) values
  ('40070001-0000-4000-8000-000000000001', 'Dube Man Mikrotik Core', 'Mikrotik', 'hEX S (RB760iGS)', 'REST_API')
on conflict do nothing;

-- ============================================================================
-- PRINT MANAGER (requires print_schema.sql)
-- ============================================================================

-- ---- Pricing settings (must exist before print jobs so financials calc) ----
insert into public.print_pricing_settings (id, bw_price_per_page, colour_price_per_page, paper_cost_per_page) values
  ('40080001-0000-4000-8000-000000000001', 1.00, 5.00, 0.20)
on conflict do nothing;

-- ---- Printers --------------------------------------------------------------
insert into public.printers (id, printer_name, windows_printer_name, location, branch, status, cost_per_bw_page, cost_per_colour_page, paper_sizes) values
  ('eeee0001-0000-4000-8000-000000000001', 'Front Office HP LaserJet', 'HP LaserJet Pro M404', 'Reception',  'Main Branch', 'Online',  0.20, 1.00, array['A4','A3']::public.paper_size[]),
  ('eeee0001-0000-4000-8000-000000000002', 'Colour Canon Studio',      'Canon PIXMA G7020',   'Design Desk','Main Branch', 'Online',  0.30, 1.50, array['A4','A3','A5']::public.paper_size[]),
  ('eeee0001-0000-4000-8000-000000000003', 'Bulk Epson EcoTank',       'Epson L3250 Series',  'Back Office','Main Branch', 'Offline', 0.15, 0.90, array['A4','Letter']::public.paper_size[])
on conflict do nothing;

-- ---- Paper inventory -------------------------------------------------------
insert into public.paper_inventory (id, paper_size, description, reams_purchased, reams_remaining, pages_per_ream, cost_per_ream, min_stock_reams) values
  ('40090001-0000-4000-8000-000000000001', 'A4',     '80gsm white',        40, 28.5, 500, 95.00, 5),
  ('40090001-0000-4000-8000-000000000002', 'A3',     '100gsm bright',      12, 3.0,  500, 180.00, 4),
  ('40090001-0000-4000-8000-000000000003', 'Letter', '80gsm imported',     10, 7.5,  500, 110.00, 3)
on conflict do nothing;

-- ---- Print jobs (history + reports + 7-day trend; revenue auto-calculated) --
insert into public.print_jobs (id, printer_id, computer_id, customer_id, document_name, page_count, color_mode, paper_size, status, print_time) values
  ('99990001-0000-4000-8000-000000000001', 'eeee0001-0000-4000-8000-000000000001', 'bbbb0001-0000-4000-8000-000000000001', 'aaaa0001-0000-4000-8000-000000000004', 'End of Term Reports Batch A', 240, 'BW',     'A4', 'Completed', now() - interval '6 days'),
  ('99990001-0000-4000-8000-000000000002', 'eeee0001-0000-4000-8000-000000000002', null,                                    'aaaa0001-0000-4000-8000-000000000001', 'Wedding Invitations Proof',   60,  'Colour', 'A4', 'Completed', now() - interval '5 days'),
  ('99990001-0000-4000-8000-000000000003', 'eeee0001-0000-4000-8000-000000000001', 'bbbb0001-0000-4000-8000-000000000001', null,                                    'Walk-in CV Prints',           12,  'BW',     'A4', 'Completed', now() - interval '4 days'),
  ('99990001-0000-4000-8000-000000000004', 'eeee0001-0000-4000-8000-000000000002', 'bbbb0001-0000-4000-8000-000000000004', 'aaaa0001-0000-4000-8000-000000000003', 'A3 Business Posters',         20,  'Colour', 'A3', 'Completed', now() - interval '3 days'),
  ('99990001-0000-4000-8000-000000000005', 'eeee0001-0000-4000-8000-000000000001', 'bbbb0001-0000-4000-8000-000000000001', 'aaaa0001-0000-4000-8000-000000000004', 'End of Term Reports Batch B', 260, 'BW',     'A4', 'Completed', now() - interval '2 days'),
  ('99990001-0000-4000-8000-000000000006', 'eeee0001-0000-4000-8000-000000000002', null,                                    null,                                    'Flyers Full Colour Run',      80,  'Colour', 'A4', 'Completed', now() - interval '1 days'),
  ('99990001-0000-4000-8000-000000000007', 'eeee0001-0000-4000-8000-000000000001', 'bbbb0001-0000-4000-8000-000000000004', 'aaaa0001-0000-4000-8000-000000000002', 'Contract Documents',          35,  'BW',     'A4', 'Completed', now() - interval '6 hours'),
  ('99990001-0000-4000-8000-000000000008', 'eeee0001-0000-4000-8000-000000000002', null,                                    'aaaa0001-0000-4000-8000-000000000001', 'Photo Reprints Glossy',       18,  'Colour', 'A4', 'Completed', now() - interval '2 hours')
on conflict do nothing;

-- ============================================================================
-- PHARMACY MODULE (requires migrations/001_multi_tenancy.sql and
-- migrations/002_pharmacy_module.sql)
-- ============================================================================

-- ---- Medicine catalog -------------------------------------------------------
insert into public.medicines (id, name, generic_name, dosage_form, strength, unit, category, requires_prescription, controlled_substance, reorder_level, buying_price, selling_price, barcode) values
  ('70010001-0000-4000-8000-000000000001', 'Paracetamol',        'Paracetamol',   'TABLET',    '500mg', 'Tablet', 'Analgesic',      false, false, 100, 0.30,  0.80,  '6001234500011'),
  ('70010001-0000-4000-8000-000000000002', 'Amoxicillin',        'Amoxicillin',   'CAPSULE',   '500mg', 'Capsule','Antibiotic',      true,  false, 60,  1.20,  2.50,  '6001234500028'),
  ('70010001-0000-4000-8000-000000000003', 'Amoxiclav',          'Co-amoxiclav',  'TABLET',    '625mg', 'Tablet', 'Antibiotic',      true,  false, 40,  2.80,  5.50,  '6001234500035'),
  ('70010001-0000-4000-8000-000000000004', 'Piriton Syrup',      'Chlorphenamine','SYRUP',     '2mg/5ml','Bottle','Antihistamine',   false, false, 15,  9.00,  16.00, '6001234500042'),
  ('70010001-0000-4000-8000-000000000005', 'Diazepam',           'Diazepam',      'TABLET',    '5mg',   'Tablet', 'Sedative',        true,  true,  20,  0.90,  2.00,  '6001234500059'),
  ('70010001-0000-4000-8000-000000000006', 'ORS Sachets',        'Oral Rehydration Salts','POWDER','—','Sachet', 'Rehydration',     false, false, 50,  1.00,  2.50,  '6001234500066')
on conflict (organization_id, name, strength) do nothing;

-- ---- Batches (lot numbers + expiry — mix of healthy, low, and near-expiry) --
insert into public.medicine_batches (id, medicine_id, batch_number, quantity, expiry_date, manufacture_date, supplier, cost_price) values
  ('70020001-0000-4000-8000-000000000001', '70010001-0000-4000-8000-000000000001', 'PCM-2401', 480, current_date + interval '18 months', current_date - interval '4 months', 'Pharma Wholesale Ltd', 0.30),
  ('70020001-0000-4000-8000-000000000002', '70010001-0000-4000-8000-000000000002', 'AMX-2312', 8,   current_date + interval '25 days',   current_date - interval '10 months','MedSource Distributors', 1.20),
  ('70020001-0000-4000-8000-000000000003', '70010001-0000-4000-8000-000000000003', 'AMC-2404', 140, current_date + interval '20 months', current_date - interval '2 months', 'Pharma Wholesale Ltd', 2.80),
  ('70020001-0000-4000-8000-000000000004', '70010001-0000-4000-8000-000000000004', 'PIR-2350', 40,  current_date + interval '60 days',   current_date - interval '9 months', 'MedSource Distributors', 9.00),
  ('70020001-0000-4000-8000-000000000005', '70010001-0000-4000-8000-000000000005', 'DZP-2318', 60,  current_date + interval '14 months', current_date - interval '5 months', 'Controlled Meds Supply', 0.90),
  ('70020001-0000-4000-8000-000000000006', '70010001-0000-4000-8000-000000000006', 'ORS-2455', 200, current_date + interval '2 years',   current_date - interval '1 month',  'Pharma Wholesale Ltd', 1.00)
on conflict (organization_id, medicine_id, batch_number) do nothing;

-- ---- A sample prescription (partially filled) -------------------------------
insert into public.prescriptions (id, customer_id, patient_name, prescribing_doctor, diagnosis, status) values
  ('70030001-0000-4000-8000-000000000001', 'aaaa0001-0000-4000-8000-000000000002', 'Mphatso Phiri', 'Dr. C. Mwale', 'Upper respiratory tract infection', 'PENDING')
on conflict do nothing;

insert into public.prescription_items (id, prescription_id, medicine_id, quantity_prescribed, dosage_instructions) values
  ('70040001-0000-4000-8000-000000000001', '70030001-0000-4000-8000-000000000001', '70010001-0000-4000-8000-000000000002', 21, 'One capsule three times daily for 7 days'),
  ('70040001-0000-4000-8000-000000000002', '70030001-0000-4000-8000-000000000001', '70010001-0000-4000-8000-000000000001', 10, 'One tablet as needed for fever, max 4x/day')
on conflict do nothing;
