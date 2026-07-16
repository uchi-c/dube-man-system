-- ============================================================
-- Uruu OS tenant schema bundle — GENERATED. Do not edit by hand.
-- Regenerate with: scripts/provision-tenant/build-bundle.sh
-- Order: schema.sql -> print_schema.sql -> agent_schema.sql ->
--        migrations/001_multi_tenancy.sql ->
--        migrations/002_pharmacy_module.sql ->
--        migrations/003_organization_signup.sql ->
--        migrations/004_business_type.sql ->
--        migrations/005_team_invites.sql
-- Paste this whole file into a fresh Supabase project's SQL editor,
-- then run create-admin.sql to promote the owner account.
-- ============================================================

-- >>>>>>>>>> BEGIN schema.sql >>>>>>>>>>
-- ============================================================================
-- URUU OS - SUPABASE / POSTGRESQL SCHEMA
-- Fresh-project schema for the React console, PC agent prototype, and WiFi MVP.
-- ============================================================================

create extension if not exists "uuid-ossp";

do $$
begin
    if not exists (select 1 from pg_type where typname = 'user_role') then
        create type public.user_role as enum ('ADMIN', 'STAFF', 'CAFE_OPERATOR');
    end if;
end $$;

create table public.users (
    id uuid primary key references auth.users(id) on delete cascade,
    name text not null,
    email text not null unique,
    role public.user_role default 'STAFF'::public.user_role not null,
    created_at timestamptz default timezone('utc'::text, now()) not null
);

-- Role helper functions. Defined AFTER public.users because their SQL bodies
-- reference that table, and Postgres validates function bodies at creation.
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
    select role from public.users where id = auth.uid()
$$;

create or replace function public.is_role(allowed public.user_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(public.current_user_role() = any(allowed), false)
$$;

alter table public.users enable row level security;

create policy "Users can read own profile" on public.users for select
    using (id = auth.uid() or public.is_role(array['ADMIN']::public.user_role[]));
create policy "Users can create own staff profile" on public.users for insert
    with check (id = auth.uid() and role = 'STAFF'::public.user_role);
create policy "Admins manage users" on public.users for all
    using (public.is_role(array['ADMIN']::public.user_role[]))
    with check (public.is_role(array['ADMIN']::public.user_role[]));

create table public.products (
    id uuid default uuid_generate_v4() primary key,
    name text not null,
    category text not null check (category in ('Stationery', 'Printing', 'Embroidery', 'Branding', 'Cafe', 'Digital', 'printing', 'stationery', 'branding', 'cafe', 'digital')),
    quantity integer default 0 not null check (quantity >= 0),
    min_stock_level integer default 5 not null check (min_stock_level >= -1),
    buying_price numeric(10, 2) not null check (buying_price >= 0),
    selling_price numeric(10, 2) not null check (selling_price >= 0),
    supplier text,
    created_at timestamptz default timezone('utc'::text, now()) not null,
    updated_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.products enable row level security;

create policy "Authenticated users read products" on public.products for select
    using (auth.role() = 'authenticated');
create policy "Admins and staff manage products" on public.products for all
    using (public.is_role(array['ADMIN','STAFF']::public.user_role[]))
    with check (public.is_role(array['ADMIN','STAFF']::public.user_role[]));

create table public.customers (
    id uuid default uuid_generate_v4() primary key,
    name text not null,
    phone text,
    email text,
    created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.customers enable row level security;

create policy "Authenticated users read customers" on public.customers for select
    using (auth.role() = 'authenticated');
create policy "Admins and staff manage customers" on public.customers for all
    using (public.is_role(array['ADMIN','STAFF']::public.user_role[]))
    with check (public.is_role(array['ADMIN','STAFF']::public.user_role[]));

create table public.sales (
    id uuid default uuid_generate_v4() primary key,
    customer_id uuid references public.customers(id) on delete set null,
    total_amount numeric(10, 2) not null check (total_amount >= 0),
    payment_method text not null check (payment_method in ('Cash', 'Mobile Money', 'Bank')),
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.sales enable row level security;

create policy "Admins and staff read sales" on public.sales for select
    using (public.is_role(array['ADMIN','STAFF']::public.user_role[]));
create policy "Admins and staff insert sales" on public.sales for insert
    with check (auth.uid() = created_by and public.is_role(array['ADMIN','STAFF']::public.user_role[]));

create table public.sale_items (
    id uuid default uuid_generate_v4() primary key,
    sale_id uuid references public.sales(id) on delete cascade not null,
    product_id uuid references public.products(id) on delete restrict not null,
    quantity integer not null check (quantity > 0),
    unit_price numeric(10, 2) not null check (unit_price >= 0),
    created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.sale_items enable row level security;

create policy "Admins and staff read sale items" on public.sale_items for select
    using (public.is_role(array['ADMIN','STAFF']::public.user_role[]));
create policy "Admins and staff insert sale items" on public.sale_items for insert
    with check (public.is_role(array['ADMIN','STAFF']::public.user_role[]));

create table public.inventory_transactions (
    id uuid default uuid_generate_v4() primary key,
    product_id uuid references public.products(id) on delete cascade not null,
    type text not null check (type in ('STOCK_IN', 'STOCK_OUT', 'SALE', 'ADJUSTMENT')),
    quantity integer not null,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.inventory_transactions enable row level security;

create policy "Admins and staff read inventory transactions" on public.inventory_transactions for select
    using (public.is_role(array['ADMIN','STAFF']::public.user_role[]));
create policy "Admins and staff insert inventory transactions" on public.inventory_transactions for insert
    with check (public.is_role(array['ADMIN','STAFF']::public.user_role[]));

create table public.printing_orders (
    id uuid default uuid_generate_v4() primary key,
    customer_id uuid references public.customers(id) on delete restrict not null,
    description text not null,
    quantity integer not null check (quantity > 0),
    amount numeric(10, 2) not null check (amount >= 0),
    amount_paid numeric(10, 2) default 0.00 not null check (amount_paid >= 0),
    status text default 'Pending' not null check (status in ('Pending', 'Designing', 'Printing', 'Completed', 'Collected')),
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz default timezone('utc'::text, now()) not null,
    constraint printing_orders_paid_lte_amount check (amount_paid <= amount)
);

alter table public.printing_orders enable row level security;

create policy "Admins and staff manage printing orders" on public.printing_orders for all
    using (public.is_role(array['ADMIN','STAFF']::public.user_role[]))
    with check (public.is_role(array['ADMIN','STAFF']::public.user_role[]));

create table public.computers (
    id uuid default uuid_generate_v4() primary key,
    computer_name text not null unique,
    computer_code text not null unique,
    status text default 'Available' not null check (status in ('Available', 'Occupied', 'Maintenance')),
    hourly_rate numeric(10, 2) default 60.00 not null check (hourly_rate >= 0),
    rate_per_minute numeric(10, 2) default 1.00 not null check (rate_per_minute >= 0),
    last_seen timestamptz default timezone('utc'::text, now())
);

alter table public.computers enable row level security;

create policy "Authenticated users read computers" on public.computers for select
    using (auth.role() = 'authenticated');
create policy "Admins and cafe operators manage computers" on public.computers for all
    using (public.is_role(array['ADMIN','CAFE_OPERATOR']::public.user_role[]))
    with check (public.is_role(array['ADMIN','CAFE_OPERATOR']::public.user_role[]));

create table public.cafe_sessions (
    id uuid default uuid_generate_v4() primary key,
    computer_id uuid references public.computers(id) on delete restrict not null,
    customer_name text not null,
    start_time timestamptz default timezone('utc'::text, now()) not null,
    end_time timestamptz,
    duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
    rate_per_minute numeric(10, 2) default 1.00 not null check (rate_per_minute >= 0),
    amount numeric(10, 2) check (amount is null or amount >= 0),
    status text default 'ACTIVE' not null check (status in ('ACTIVE', 'COMPLETED', 'CANCELLED'))
);

alter table public.cafe_sessions enable row level security;

create policy "Admins and cafe operators read cafe sessions" on public.cafe_sessions for select
    using (public.is_role(array['ADMIN','CAFE_OPERATOR']::public.user_role[]));
create policy "Admins and cafe operators manage cafe sessions" on public.cafe_sessions for all
    using (public.is_role(array['ADMIN','CAFE_OPERATOR']::public.user_role[]))
    with check (public.is_role(array['ADMIN','CAFE_OPERATOR']::public.user_role[]));

create table public.activity_logs (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.users(id) on delete set null,
    action text not null,
    timestamp timestamptz default timezone('utc'::text, now()) not null
);

alter table public.activity_logs enable row level security;

create policy "Admins read activity logs" on public.activity_logs for select
    using (public.is_role(array['ADMIN']::public.user_role[]));
create policy "Authenticated users insert own activity logs" on public.activity_logs for insert
    with check (auth.uid() = user_id);

create table public.wifi_customers (
    id uuid default uuid_generate_v4() primary key,
    name text not null,
    phone text not null,
    device_name text not null,
    mac_address text not null unique,
    created_at timestamptz default timezone('utc'::text, now()) not null
);

create table public.wifi_packages (
    id uuid default uuid_generate_v4() primary key,
    name text not null,
    duration_minutes integer not null check (duration_minutes > 0),
    price numeric(10, 2) not null check (price >= 0),
    created_at timestamptz default timezone('utc'::text, now()) not null
);

create table public.wifi_sessions (
    id uuid default uuid_generate_v4() primary key,
    customer_id uuid references public.wifi_customers(id) on delete restrict not null,
    package_id uuid references public.wifi_packages(id) on delete restrict not null,
    start_time timestamptz not null,
    end_time timestamptz not null,
    duration_minutes integer not null check (duration_minutes > 0),
    amount numeric(10, 2) not null check (amount >= 0),
    status text default 'ACTIVE' not null check (status in ('ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED')),
    created_at timestamptz default timezone('utc'::text, now()) not null
);

create table public.wifi_usage_logs (
    id uuid default uuid_generate_v4() primary key,
    customer_id uuid references public.wifi_customers(id) on delete set null,
    device_name text not null,
    mac_address text not null,
    action text not null check (action in ('CONNECTED', 'DISCONNECTED', 'EXPIRED')),
    created_at timestamptz default timezone('utc'::text, now()) not null
);

create table public.router_settings (
    id uuid default uuid_generate_v4() primary key,
    router_name text not null,
    router_brand text not null,
    router_model text not null,
    integration_type text not null check (integration_type in ('REST_API', 'SSH_COMMAND', 'WEB_HOOK')),
    created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.wifi_customers enable row level security;
alter table public.wifi_packages enable row level security;
alter table public.wifi_sessions enable row level security;
alter table public.wifi_usage_logs enable row level security;
alter table public.router_settings enable row level security;

create policy "Authorized users manage wifi customers" on public.wifi_customers for all
    using (public.is_role(array['ADMIN','STAFF','CAFE_OPERATOR']::public.user_role[]))
    with check (public.is_role(array['ADMIN','STAFF','CAFE_OPERATOR']::public.user_role[]));
create policy "Authorized users manage wifi packages" on public.wifi_packages for all
    using (public.is_role(array['ADMIN','STAFF','CAFE_OPERATOR']::public.user_role[]))
    with check (public.is_role(array['ADMIN','STAFF','CAFE_OPERATOR']::public.user_role[]));
create policy "Authorized users manage wifi sessions" on public.wifi_sessions for all
    using (public.is_role(array['ADMIN','STAFF','CAFE_OPERATOR']::public.user_role[]))
    with check (public.is_role(array['ADMIN','STAFF','CAFE_OPERATOR']::public.user_role[]));
create policy "Authorized users manage wifi usage logs" on public.wifi_usage_logs for all
    using (public.is_role(array['ADMIN','STAFF','CAFE_OPERATOR']::public.user_role[]))
    with check (public.is_role(array['ADMIN','STAFF','CAFE_OPERATOR']::public.user_role[]));
create policy "Authorized users read router settings" on public.router_settings for select
    using (public.is_role(array['ADMIN','STAFF','CAFE_OPERATOR']::public.user_role[]));
create policy "Admins manage router settings" on public.router_settings for all
    using (public.is_role(array['ADMIN']::public.user_role[]))
    with check (public.is_role(array['ADMIN']::public.user_role[]));

create or replace function public.process_sale_item_deduction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.products
    set quantity = quantity - new.quantity,
        updated_at = timezone('utc'::text, now())
    where id = new.product_id
      and quantity >= new.quantity;

    if not found then
        raise exception 'Insufficient stock for product %', new.product_id;
    end if;

    insert into public.inventory_transactions (product_id, type, quantity, created_by)
    select new.product_id, 'SALE', -new.quantity, s.created_by
    from public.sales s
    where s.id = new.sale_id;

    return new;
end;
$$;

create trigger tr_on_sale_item_insert
    after insert on public.sale_items
    for each row execute function public.process_sale_item_deduction();

create or replace function public.log_user_activity(user_uuid uuid, act_detail text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.activity_logs(user_id, action)
    values (user_uuid, act_detail);
end;
$$;

create index users_role_idx on public.users (role);
create index products_category_idx on public.products (category);
create index customers_email_idx on public.customers (email) where email is not null;
create index customers_phone_idx on public.customers (phone) where phone is not null;
create index sales_customer_id_idx on public.sales (customer_id);
create index sales_created_by_idx on public.sales (created_by);
create index sales_created_at_idx on public.sales (created_at desc);
create index sale_items_sale_id_idx on public.sale_items (sale_id);
create index sale_items_product_id_idx on public.sale_items (product_id);
create index inventory_transactions_product_id_idx on public.inventory_transactions (product_id);
create index inventory_transactions_created_at_idx on public.inventory_transactions (created_at desc);
create index printing_orders_customer_id_idx on public.printing_orders (customer_id);
create index printing_orders_status_idx on public.printing_orders (status);
create index printing_orders_created_at_idx on public.printing_orders (created_at desc);
create index computers_status_idx on public.computers (status);
create index cafe_sessions_computer_id_idx on public.cafe_sessions (computer_id);
create index cafe_sessions_status_idx on public.cafe_sessions (status);
create index cafe_sessions_start_time_idx on public.cafe_sessions (start_time desc);
create index activity_logs_user_id_idx on public.activity_logs (user_id);
create index activity_logs_timestamp_idx on public.activity_logs (timestamp desc);
create index wifi_customers_mac_address_idx on public.wifi_customers (mac_address);
create index wifi_sessions_customer_id_idx on public.wifi_sessions (customer_id);
create index wifi_sessions_package_id_idx on public.wifi_sessions (package_id);
create index wifi_sessions_status_idx on public.wifi_sessions (status);
create index wifi_sessions_created_at_idx on public.wifi_sessions (created_at desc);
create index wifi_usage_logs_customer_id_idx on public.wifi_usage_logs (customer_id);
create index wifi_usage_logs_created_at_idx on public.wifi_usage_logs (created_at desc);

alter publication supabase_realtime add table public.computers;
alter publication supabase_realtime add table public.cafe_sessions;
alter publication supabase_realtime add table public.wifi_sessions;
alter publication supabase_realtime add table public.wifi_usage_logs;

-- <<<<<<<<<< END schema.sql <<<<<<<<<<

-- >>>>>>>>>> BEGIN print_schema.sql >>>>>>>>>>
-- ============================================================================
-- URUU OS PRINT MANAGER — Supabase / PostgreSQL Schema
-- Applies on top of the base schema (schema.sql).
-- Run this file in the Supabase SQL editor after schema.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------------------------

do $$ begin
    if not exists (select 1 from pg_type where typname = 'printer_status') then
        create type public.printer_status as enum (
            'Online', 'Offline', 'Paused', 'Error'
        );
    end if;
end $$;

do $$ begin
    if not exists (select 1 from pg_type where typname = 'print_job_status') then
        create type public.print_job_status as enum (
            'Completed', 'Cancelled', 'Failed'
        );
    end if;
end $$;

do $$ begin
    if not exists (select 1 from pg_type where typname = 'paper_size') then
        create type public.paper_size as enum (
            'A4', 'A3', 'A5', 'Letter', 'Legal', 'Custom'
        );
    end if;
end $$;

do $$ begin
    if not exists (select 1 from pg_type where typname = 'color_mode') then
        create type public.color_mode as enum ('BW', 'Colour');
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. PRINTERS
-- ---------------------------------------------------------------------------

create table if not exists public.printers (
    id                    uuid default uuid_generate_v4() primary key,
    printer_name          text not null,
    windows_printer_name  text not null unique,   -- must match exactly what Windows reports
    location              text not null default '',
    branch                text not null default '',
    status                public.printer_status not null default 'Offline',
    cost_per_bw_page      numeric(10, 4) not null default 0.00 check (cost_per_bw_page >= 0),
    cost_per_colour_page  numeric(10, 4) not null default 0.00 check (cost_per_colour_page >= 0),
    paper_sizes           public.paper_size[] not null default array['A4']::public.paper_size[],
    is_active             boolean not null default true,
    created_at            timestamptz default timezone('utc', now()) not null,
    updated_at            timestamptz default timezone('utc', now()) not null
);

alter table public.printers enable row level security;

create policy "Authenticated users read printers" on public.printers
    for select using (auth.role() = 'authenticated');

create policy "Admins manage printers" on public.printers
    for all
    using (public.is_role(array['ADMIN']::public.user_role[]))
    with check (public.is_role(array['ADMIN']::public.user_role[]));

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$;

create trigger tr_printers_updated_at
    before update on public.printers
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. PRINT JOBS
-- ---------------------------------------------------------------------------

create table if not exists public.print_jobs (
    id              uuid default uuid_generate_v4() primary key,
    printer_id      uuid not null references public.printers(id) on delete restrict,
    computer_id     uuid references public.computers(id) on delete set null,
    employee_id     uuid references public.users(id) on delete set null,
    customer_id     uuid references public.customers(id) on delete set null,
    session_id      uuid references public.cafe_sessions(id) on delete set null,

    document_name   text,
    page_count      integer not null check (page_count > 0),
    color_mode      public.color_mode not null default 'BW',
    paper_size      public.paper_size not null default 'A4',

    -- financials auto-calculated on insert by trigger
    cost            numeric(10, 4) not null default 0.00 check (cost >= 0),
    revenue         numeric(10, 4) not null default 0.00 check (revenue >= 0),
    profit          numeric(10, 4) generated always as (revenue - cost) stored,

    status          public.print_job_status not null default 'Completed',
    print_time      timestamptz not null default timezone('utc', now()),
    created_at      timestamptz default timezone('utc', now()) not null
);

alter table public.print_jobs enable row level security;

create policy "Admins read print jobs" on public.print_jobs
    for select using (public.is_role(array['ADMIN']::public.user_role[]));

create policy "Admins and cafe operators manage print jobs" on public.print_jobs
    for all
    using (public.is_role(array['ADMIN','CAFE_OPERATOR']::public.user_role[]))
    with check (public.is_role(array['ADMIN','CAFE_OPERATOR']::public.user_role[]));

-- ---------------------------------------------------------------------------
-- Auto-calculate cost and revenue from pricing settings on insert
-- ---------------------------------------------------------------------------

create or replace function public.calculate_print_job_financials()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_bw_price       numeric(10,4);
    v_colour_price   numeric(10,4);
    v_paper_cost     numeric(10,4);
    v_price_per_page numeric(10,4);
begin
    -- fetch org pricing or fall back to printer cost
    select
        coalesce(ps.bw_price_per_page,     0),
        coalesce(ps.colour_price_per_page, 0),
        coalesce(ps.paper_cost_per_page,   0)
    into v_bw_price, v_colour_price, v_paper_cost
    from public.print_pricing_settings ps
    limit 1;

    -- fall back to printer's own cost columns if no pricing row exists
    if v_bw_price = 0 and v_colour_price = 0 then
        select cost_per_bw_page, cost_per_colour_page
        into v_bw_price, v_colour_price
        from public.printers
        where id = new.printer_id;
        v_paper_cost := 0;
    end if;

    if new.color_mode = 'Colour' then
        v_price_per_page := v_colour_price;
    else
        v_price_per_page := v_bw_price;
    end if;

    new.revenue := new.page_count * v_price_per_page;
    new.cost    := new.page_count * v_paper_cost;

    return new;
end;
$$;

create trigger tr_print_job_financials
    before insert on public.print_jobs
    for each row execute function public.calculate_print_job_financials();

-- Deduct paper inventory on every completed job
create or replace function public.deduct_paper_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_pages_per_ream integer;
begin
    if new.status <> 'Completed' then
        return new;
    end if;

    select pages_per_ream
    into v_pages_per_ream
    from public.paper_inventory
    where paper_size = new.paper_size
    order by updated_at desc
    limit 1;

    if not found then
        return new;  -- no inventory row yet — skip silently
    end if;

    update public.paper_inventory
    set reams_remaining = greatest(
            0,
            reams_remaining - (new.page_count::numeric / greatest(v_pages_per_ream, 1))
        ),
        updated_at = timezone('utc', now())
    where paper_size = new.paper_size;

    return new;
end;
$$;

create trigger tr_deduct_paper_on_print
    after insert on public.print_jobs
    for each row execute function public.deduct_paper_inventory();

-- ---------------------------------------------------------------------------
-- 3. PAPER INVENTORY
-- ---------------------------------------------------------------------------

create table if not exists public.paper_inventory (
    id               uuid default uuid_generate_v4() primary key,
    paper_size       public.paper_size not null unique,
    description      text not null default '',
    reams_purchased  numeric(10, 2) not null default 0 check (reams_purchased >= 0),
    reams_remaining  numeric(10, 2) not null default 0 check (reams_remaining >= 0),
    pages_per_ream   integer not null default 500 check (pages_per_ream > 0),
    cost_per_ream    numeric(10, 2) not null default 0 check (cost_per_ream >= 0),
    min_stock_reams  numeric(10, 2) not null default 1 check (min_stock_reams >= 0),
    created_at       timestamptz default timezone('utc', now()) not null,
    updated_at       timestamptz default timezone('utc', now()) not null
);

alter table public.paper_inventory enable row level security;

create policy "Admins manage paper inventory" on public.paper_inventory
    for all
    using (public.is_role(array['ADMIN']::public.user_role[]))
    with check (public.is_role(array['ADMIN']::public.user_role[]));

create trigger tr_paper_inventory_updated_at
    before update on public.paper_inventory
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. PRINT PRICING SETTINGS
-- ---------------------------------------------------------------------------

create table if not exists public.print_pricing_settings (
    id                    uuid default uuid_generate_v4() primary key,
    bw_price_per_page     numeric(10, 4) not null default 1.00 check (bw_price_per_page >= 0),
    colour_price_per_page numeric(10, 4) not null default 5.00 check (colour_price_per_page >= 0),
    paper_cost_per_page   numeric(10, 4) not null default 0.20 check (paper_cost_per_page >= 0),
    created_at            timestamptz default timezone('utc', now()) not null,
    updated_at            timestamptz default timezone('utc', now()) not null
);

alter table public.print_pricing_settings enable row level security;

create policy "Admins manage pricing" on public.print_pricing_settings
    for all
    using (public.is_role(array['ADMIN']::public.user_role[]))
    with check (public.is_role(array['ADMIN']::public.user_role[]));

create trigger tr_print_pricing_updated_at
    before update on public.print_pricing_settings
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------

create index if not exists print_jobs_printer_idx    on public.print_jobs (printer_id);
create index if not exists print_jobs_computer_idx   on public.print_jobs (computer_id);
create index if not exists print_jobs_employee_idx   on public.print_jobs (employee_id);
create index if not exists print_jobs_customer_idx   on public.print_jobs (customer_id);
create index if not exists print_jobs_print_time_idx on public.print_jobs (print_time desc);
create index if not exists print_jobs_status_idx     on public.print_jobs (status);
create index if not exists printers_status_idx       on public.printers (status);

-- ---------------------------------------------------------------------------
-- REALTIME
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.printers;
alter publication supabase_realtime add table public.print_jobs;
alter publication supabase_realtime add table public.paper_inventory;

-- <<<<<<<<<< END print_schema.sql <<<<<<<<<<

-- >>>>>>>>>> BEGIN agent_schema.sql >>>>>>>>>>
-- ============================================================================
-- URUU OS — PC AGENT SCHEMA
-- Adds live usage metrics, the session countdown, a remote-command queue, and
-- the access policies the café PC agent needs.
-- Run in the Supabase SQL editor AFTER schema.sql and print_schema.sql.
-- Safe to re-run.
-- ============================================================================

-- 1. Live usage metrics on computers (written by the agent heartbeat) ---------
alter table public.computers add column if not exists cpu_usage  numeric(5,2);
alter table public.computers add column if not exists ram_usage  numeric(5,2);
alter table public.computers add column if not exists disk_usage numeric(5,2);
alter table public.computers add column if not exists hostname   text;
alter table public.computers add column if not exists ip_address text;

-- 2. Session countdown the agent decrements each second -----------------------
alter table public.cafe_sessions add column if not exists seconds_remaining integer;

-- 3. Remote command queue (LOCK / UNLOCK / RESTART / …) -----------------------
create table if not exists public.computer_commands (
    id            uuid default uuid_generate_v4() primary key,
    computer_code text not null,
    command       text not null check (command in ('LOCK','UNLOCK','RESTART','SHUTDOWN','REFRESH','EXTEND_SESSION')),
    payload       jsonb,
    status        text not null default 'PENDING' check (status in ('PENDING','COMPLETED','FAILED')),
    created_at    timestamptz default timezone('utc', now()) not null,
    completed_at  timestamptz
);
alter table public.computer_commands enable row level security;
create index if not exists computer_commands_code_status_idx on public.computer_commands (computer_code, status);

-- Console (admins / café operators) issues and reads commands
drop policy if exists "Staff manage computer commands" on public.computer_commands;
create policy "Staff manage computer commands" on public.computer_commands for all
    using (public.is_role(array['ADMIN','CAFE_OPERATOR']::public.user_role[]))
    with check (public.is_role(array['ADMIN','CAFE_OPERATOR']::public.user_role[]));

-- ============================================================================
-- PC AGENT ACCESS (anon / publishable key)
-- The café agents authenticate with the project's public anon/publishable key
-- (agent .env: SUPABASE_ANON_KEY). These policies grant the `anon` role ONLY
-- the narrow operations the agent performs.
--
-- ⚠ SECURITY: the anon key is public (it ships in the web bundle). This is an
-- MVP posture appropriate for trusted café LAN machines. For production, move
-- agent writes behind an Edge Function using the service_role key, or issue
-- each device a signed token, and drop these anon policies.
-- ============================================================================

grant select, insert, update on public.computers        to anon;
grant select, update          on public.cafe_sessions    to anon;
grant select, update          on public.printers         to anon;
grant select, insert          on public.print_jobs       to anon;
grant select, update          on public.computer_commands to anon;

-- computers: read, register, heartbeat metrics
drop policy if exists "Agent reads computers"    on public.computers;
drop policy if exists "Agent registers computer" on public.computers;
drop policy if exists "Agent updates computer"   on public.computers;
create policy "Agent reads computers"    on public.computers for select to anon using (true);
create policy "Agent registers computer" on public.computers for insert to anon with check (true);
create policy "Agent updates computer"   on public.computers for update to anon using (true) with check (true);

-- cafe_sessions: read active + decrement countdown / complete
drop policy if exists "Agent reads cafe sessions"   on public.cafe_sessions;
drop policy if exists "Agent updates cafe sessions" on public.cafe_sessions;
create policy "Agent reads cafe sessions"   on public.cafe_sessions for select to anon using (true);
create policy "Agent updates cafe sessions" on public.cafe_sessions for update to anon using (true) with check (true);

-- computer_commands: read pending + mark complete
drop policy if exists "Agent reads commands"     on public.computer_commands;
drop policy if exists "Agent completes commands" on public.computer_commands;
create policy "Agent reads commands"     on public.computer_commands for select to anon using (true);
create policy "Agent completes commands" on public.computer_commands for update to anon using (true) with check (true);

-- printers: resolve id + push online/offline status
drop policy if exists "Agent reads printers"   on public.printers;
drop policy if exists "Agent updates printers" on public.printers;
create policy "Agent reads printers"   on public.printers for select to anon using (true);
create policy "Agent updates printers" on public.printers for update to anon using (true) with check (true);

-- print_jobs: insert scanned spooler jobs (+ read back the inserted row)
drop policy if exists "Agent inserts print jobs" on public.print_jobs;
drop policy if exists "Agent reads print jobs"   on public.print_jobs;
create policy "Agent inserts print jobs" on public.print_jobs for insert to anon with check (true);
create policy "Agent reads print jobs"   on public.print_jobs for select to anon using (true);

-- realtime for the command queue
do $$ begin
  alter publication supabase_realtime add table public.computer_commands;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- DEMO metrics so the café station cards show live usage before a real agent
-- connects. Harmless to keep; a running agent immediately overwrites these.
-- ---------------------------------------------------------------------------
update public.computers set cpu_usage = 41, ram_usage = 63, disk_usage = 72, hostname = 'CAFE-PC-01', ip_address = '192.168.1.11' where computer_code = 'PC-01';
update public.computers set cpu_usage = 12, ram_usage = 38, disk_usage = 55, hostname = 'CAFE-PC-02', ip_address = '192.168.1.12' where computer_code = 'PC-02';
update public.computers set cpu_usage =  8, ram_usage = 33, disk_usage = 61, hostname = 'CAFE-PC-03', ip_address = '192.168.1.13' where computer_code = 'PC-03';
update public.computers set cpu_usage = 57, ram_usage = 71, disk_usage = 68, hostname = 'CAFE-PC-04', ip_address = '192.168.1.14' where computer_code = 'PC-04';
update public.computers set cpu_usage = 15, ram_usage = 40, disk_usage = 59, hostname = 'CAFE-PC-05', ip_address = '192.168.1.15' where computer_code = 'PC-05';
update public.computers set cpu_usage = 19, ram_usage = 44, disk_usage = 63, hostname = 'CAFE-PC-06', ip_address = '192.168.1.16' where computer_code = 'PC-06';

-- <<<<<<<<<< END agent_schema.sql <<<<<<<<<<

-- >>>>>>>>>> BEGIN migrations/001_multi_tenancy.sql >>>>>>>>>>
-- ============================================================================
-- MIGRATION 001: MULTI-TENANCY
-- Adds `organizations` + `user_organization_memberships`, tags every business
-- table with `organization_id`, and scopes RLS so one tenant can never read
-- or write another tenant's rows — even though they now share one database.
--
-- Reference: modeled on uchi-c/dube-man-system-v2's
-- `database/migrations/001_device_abstraction.sql` (organizations +
-- memberships) and `003_multi_tenancy_analytics.sql` (org-scoped RLS shape),
-- adapted to this project's existing table set instead of v2's device
-- abstraction layer.
--
-- Safe to re-run. Apply AFTER schema.sql, print_schema.sql and
-- agent_schema.sql (fresh installs), or directly against an already-live
-- project (upgrade path) — every existing row is auto-assigned to a
-- "Default Organization" so nothing already deployed breaks.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. ORGANIZATIONS + MEMBERSHIPS
-- ---------------------------------------------------------------------------

create table if not exists public.organizations (
    id uuid default uuid_generate_v4() primary key,
    name text not null unique,
    created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.organizations enable row level security;

create table if not exists public.user_organization_memberships (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid not null references public.users(id) on delete cascade,
    org_id uuid not null references public.organizations(id) on delete cascade,
    created_at timestamptz default timezone('utc'::text, now()) not null,
    unique (user_id, org_id)
);

alter table public.user_organization_memberships enable row level security;

-- Policies below reference user_organization_memberships, so it must exist
-- first (hence this table is created before its own policies here).

drop policy if exists "Members and admins read organizations" on public.organizations;
create policy "Members and admins read organizations" on public.organizations for select
    using (
        id in (select org_id from public.user_organization_memberships where user_id = auth.uid())
        or public.is_role(array['ADMIN']::public.user_role[])
    );

drop policy if exists "Admins manage organizations" on public.organizations;
create policy "Admins manage organizations" on public.organizations for all
    using (public.is_role(array['ADMIN']::public.user_role[]))
    with check (public.is_role(array['ADMIN']::public.user_role[]));

drop policy if exists "Users read own memberships" on public.user_organization_memberships;
create policy "Users read own memberships" on public.user_organization_memberships for select
    using (user_id = auth.uid() or public.is_role(array['ADMIN']::public.user_role[]));

drop policy if exists "Admins manage memberships" on public.user_organization_memberships;
create policy "Admins manage memberships" on public.user_organization_memberships for all
    using (public.is_role(array['ADMIN']::public.user_role[]))
    with check (public.is_role(array['ADMIN']::public.user_role[]));

-- Resolves the organization a row should fall into when the caller doesn't
-- supply one explicitly (used as a column DEFAULT below). Reuses the first
-- organization ever created, or creates "Default Organization" the first
-- time it's called. This keeps every existing single-tenant deployment
-- working unmodified — most installs will only ever have this one org.
create or replace function public.default_organization_id()
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
    v_org_id uuid;
begin
    select id into v_org_id from public.organizations order by created_at asc limit 1;
    if v_org_id is null then
        insert into public.organizations (name) values ('Default Organization')
        returning id into v_org_id;
    end if;
    return v_org_id;
end;
$$;

-- Set-returning helper for RLS policies: every org the calling user belongs
-- to. SECURITY DEFINER so it can read user_organization_memberships without
-- itself triggering that table's RLS (avoids recursive policy evaluation).
create or replace function public.current_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
    select org_id from public.user_organization_memberships where user_id = auth.uid()
$$;

-- Ensures a default organization exists and that every already-registered
-- user (from before this migration) is a member of it. Run once here; safe
-- to call again by hand after adding users out-of-band.
create or replace function public.bootstrap_default_organization()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_org_id uuid;
begin
    v_org_id := public.default_organization_id();

    insert into public.user_organization_memberships (user_id, org_id)
    select u.id, v_org_id
    from public.users u
    on conflict (user_id, org_id) do nothing;
end;
$$;

-- The one-off backfill above only covers users that already existed when
-- this migration ran. public.users rows are also created later — on first
-- login (see fetchProfileForAuthUser in src/services/supabase.ts) and via
-- the tenant-onboarding SQL in docs/DEPLOYMENT.md — and those get no
-- membership without this trigger, which would leave current_org_ids()
-- empty for them (every org-scoped read returns nothing, and
-- getCurrentOrganizationId() throws on write).
--
-- This only auto-enrolls while the deployment is still single-tenant
-- (exactly one organization exists) — that's the unambiguous case where
-- "the org this new user belongs to" has exactly one right answer. Once a
-- second organization exists, auto-enrolling every new user into org #1
-- would leak subsequent tenants' users into the first tenant, so the
-- trigger steps back and membership must be assigned explicitly (as
-- docs/DEPLOYMENT.md's onboarding flow already does).
create or replace function public.auto_enroll_default_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_org_count integer;
begin
    select count(*) into v_org_count from public.organizations;
    if v_org_count = 1 then
        insert into public.user_organization_memberships (user_id, org_id)
        select new.id, o.id from public.organizations o
        on conflict (user_id, org_id) do nothing;
    end if;
    return new;
end;
$$;

drop trigger if exists tr_auto_enroll_default_organization on public.users;
create trigger tr_auto_enroll_default_organization
    after insert on public.users
    for each row execute function public.auto_enroll_default_organization();

-- ---------------------------------------------------------------------------
-- 2. TAG EVERY BUSINESS TABLE WITH organization_id
-- Each ADD COLUMN carries a DEFAULT of default_organization_id(), so
-- Postgres backfills every pre-existing row to the (auto-created) default
-- organization as part of the same statement, then the column can be made
-- NOT NULL safely. New inserts from the app pass their real organization_id
-- explicitly; anything that omits it (the anon-key pc-agent, ad-hoc SQL)
-- falls back to the default org, which is exactly correct for the common
-- single-tenant deployment.
-- ---------------------------------------------------------------------------

alter table public.products               add column if not exists organization_id uuid references public.organizations(id) default public.default_organization_id();
alter table public.customers               add column if not exists organization_id uuid references public.organizations(id) default public.default_organization_id();
alter table public.sales                   add column if not exists organization_id uuid references public.organizations(id) default public.default_organization_id();
alter table public.sale_items              add column if not exists organization_id uuid references public.organizations(id) default public.default_organization_id();
alter table public.inventory_transactions  add column if not exists organization_id uuid references public.organizations(id) default public.default_organization_id();
alter table public.printing_orders         add column if not exists organization_id uuid references public.organizations(id) default public.default_organization_id();
alter table public.computers               add column if not exists organization_id uuid references public.organizations(id) default public.default_organization_id();
alter table public.cafe_sessions           add column if not exists organization_id uuid references public.organizations(id) default public.default_organization_id();
alter table public.activity_logs           add column if not exists organization_id uuid references public.organizations(id) default public.default_organization_id();
alter table public.wifi_customers          add column if not exists organization_id uuid references public.organizations(id) default public.default_organization_id();
alter table public.wifi_packages           add column if not exists organization_id uuid references public.organizations(id) default public.default_organization_id();
alter table public.wifi_sessions           add column if not exists organization_id uuid references public.organizations(id) default public.default_organization_id();
alter table public.wifi_usage_logs         add column if not exists organization_id uuid references public.organizations(id) default public.default_organization_id();
alter table public.router_settings         add column if not exists organization_id uuid references public.organizations(id) default public.default_organization_id();

do $$ begin
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'printers') then
        alter table public.printers add column if not exists organization_id uuid references public.organizations(id) default public.default_organization_id();
    end if;
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'print_jobs') then
        alter table public.print_jobs add column if not exists organization_id uuid references public.organizations(id) default public.default_organization_id();
    end if;
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'paper_inventory') then
        alter table public.paper_inventory add column if not exists organization_id uuid references public.organizations(id) default public.default_organization_id();
    end if;
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'print_pricing_settings') then
        alter table public.print_pricing_settings add column if not exists organization_id uuid references public.organizations(id) default public.default_organization_id();
    end if;
end $$;

-- Backfill safety net, then lock the column down. (No-op on fresh installs
-- where every ADD COLUMN above already ran with zero rows.)
update public.products              set organization_id = public.default_organization_id() where organization_id is null;
update public.customers              set organization_id = public.default_organization_id() where organization_id is null;
update public.sales                  set organization_id = public.default_organization_id() where organization_id is null;
update public.sale_items             set organization_id = public.default_organization_id() where organization_id is null;
update public.inventory_transactions set organization_id = public.default_organization_id() where organization_id is null;
update public.printing_orders        set organization_id = public.default_organization_id() where organization_id is null;
update public.computers              set organization_id = public.default_organization_id() where organization_id is null;
update public.cafe_sessions          set organization_id = public.default_organization_id() where organization_id is null;
update public.activity_logs          set organization_id = public.default_organization_id() where organization_id is null;
update public.wifi_customers         set organization_id = public.default_organization_id() where organization_id is null;
update public.wifi_packages          set organization_id = public.default_organization_id() where organization_id is null;
update public.wifi_sessions          set organization_id = public.default_organization_id() where organization_id is null;
update public.wifi_usage_logs        set organization_id = public.default_organization_id() where organization_id is null;
update public.router_settings        set organization_id = public.default_organization_id() where organization_id is null;

alter table public.products               alter column organization_id set not null;
alter table public.customers               alter column organization_id set not null;
alter table public.sales                   alter column organization_id set not null;
alter table public.sale_items              alter column organization_id set not null;
alter table public.inventory_transactions  alter column organization_id set not null;
alter table public.printing_orders         alter column organization_id set not null;
alter table public.computers               alter column organization_id set not null;
alter table public.cafe_sessions           alter column organization_id set not null;
alter table public.activity_logs           alter column organization_id set not null;
alter table public.wifi_customers          alter column organization_id set not null;
alter table public.wifi_packages           alter column organization_id set not null;
alter table public.wifi_sessions           alter column organization_id set not null;
alter table public.wifi_usage_logs         alter column organization_id set not null;
alter table public.router_settings         alter column organization_id set not null;

do $$ begin
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'printers') then
        update public.printers set organization_id = public.default_organization_id() where organization_id is null;
        alter table public.printers alter column organization_id set not null;
    end if;
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'print_jobs') then
        update public.print_jobs set organization_id = public.default_organization_id() where organization_id is null;
        alter table public.print_jobs alter column organization_id set not null;
    end if;
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'paper_inventory') then
        update public.paper_inventory set organization_id = public.default_organization_id() where organization_id is null;
        alter table public.paper_inventory alter column organization_id set not null;
    end if;
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'print_pricing_settings') then
        update public.print_pricing_settings set organization_id = public.default_organization_id() where organization_id is null;
        alter table public.print_pricing_settings alter column organization_id set not null;
    end if;
end $$;

-- Note: computers.computer_code / computer_name and printers.windows_printer_name
-- intentionally stay GLOBALLY unique (not per-org). Both are looked up by the
-- anon-key pc-agent, which today has no organization context (see
-- docs/SECURITY-CHECKLIST.md) — scoping those constraints per-org would let
-- two tenants silently collide on the same device/printer identifier from the
-- agent's point of view. wifi_customers.mac_address also stays globally
-- unique, correctly, since a MAC address is physically unique regardless of
-- tenant.

-- Per-org uniqueness where the client (not the anon agent) owns the write:
do $$ begin
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'paper_inventory') then
        alter table public.paper_inventory drop constraint if exists paper_inventory_paper_size_key;
        alter table public.paper_inventory drop constraint if exists paper_inventory_org_paper_size_key;
        alter table public.paper_inventory add constraint paper_inventory_org_paper_size_key unique (organization_id, paper_size);
    end if;
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'print_pricing_settings') then
        alter table public.print_pricing_settings drop constraint if exists print_pricing_settings_org_key;
        alter table public.print_pricing_settings add constraint print_pricing_settings_org_key unique (organization_id);
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. RE-SCOPE RLS: every existing policy gets an
--    `organization_id in (select public.current_org_ids())` clause layered
--    on top of its original role check.
-- ---------------------------------------------------------------------------

-- products
drop policy if exists "Authenticated users read products" on public.products;
create policy "Org members read products" on public.products for select
    using (organization_id in (select public.current_org_ids()));
drop policy if exists "Admins and staff manage products" on public.products;
create policy "Org admins and staff manage products" on public.products for all
    using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]))
    with check (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]));

-- customers
drop policy if exists "Authenticated users read customers" on public.customers;
create policy "Org members read customers" on public.customers for select
    using (organization_id in (select public.current_org_ids()));
drop policy if exists "Admins and staff manage customers" on public.customers;
create policy "Org admins and staff manage customers" on public.customers for all
    using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]))
    with check (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]));

-- sales
drop policy if exists "Admins and staff read sales" on public.sales;
create policy "Org admins and staff read sales" on public.sales for select
    using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]));
drop policy if exists "Admins and staff insert sales" on public.sales;
create policy "Org admins and staff insert sales" on public.sales for insert
    with check (auth.uid() = created_by and organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]));

-- sale_items
drop policy if exists "Admins and staff read sale items" on public.sale_items;
create policy "Org admins and staff read sale items" on public.sale_items for select
    using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]));
drop policy if exists "Admins and staff insert sale items" on public.sale_items;
create policy "Org admins and staff insert sale items" on public.sale_items for insert
    with check (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]));

-- inventory_transactions
drop policy if exists "Admins and staff read inventory transactions" on public.inventory_transactions;
create policy "Org admins and staff read inventory transactions" on public.inventory_transactions for select
    using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]));
drop policy if exists "Admins and staff insert inventory transactions" on public.inventory_transactions;
create policy "Org admins and staff insert inventory transactions" on public.inventory_transactions for insert
    with check (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]));

-- printing_orders
drop policy if exists "Admins and staff manage printing orders" on public.printing_orders;
create policy "Org admins and staff manage printing orders" on public.printing_orders for all
    using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]))
    with check (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]));

-- computers (authenticated-user policies only — anon agent policies untouched)
drop policy if exists "Authenticated users read computers" on public.computers;
create policy "Org members read computers" on public.computers for select
    using (organization_id in (select public.current_org_ids()));
drop policy if exists "Admins and cafe operators manage computers" on public.computers;
create policy "Org admins and cafe operators manage computers" on public.computers for all
    using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','CAFE_OPERATOR']::public.user_role[]))
    with check (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','CAFE_OPERATOR']::public.user_role[]));

-- cafe_sessions
drop policy if exists "Admins and cafe operators read cafe sessions" on public.cafe_sessions;
create policy "Org admins and cafe operators read cafe sessions" on public.cafe_sessions for select
    using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','CAFE_OPERATOR']::public.user_role[]));
drop policy if exists "Admins and cafe operators manage cafe sessions" on public.cafe_sessions;
create policy "Org admins and cafe operators manage cafe sessions" on public.cafe_sessions for all
    using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','CAFE_OPERATOR']::public.user_role[]))
    with check (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','CAFE_OPERATOR']::public.user_role[]));

-- activity_logs
drop policy if exists "Admins read activity logs" on public.activity_logs;
create policy "Org admins read activity logs" on public.activity_logs for select
    using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN']::public.user_role[]));
drop policy if exists "Authenticated users insert own activity logs" on public.activity_logs;
create policy "Org members insert own activity logs" on public.activity_logs for insert
    with check (auth.uid() = user_id and organization_id in (select public.current_org_ids()));

-- wifi_*
drop policy if exists "Authorized users manage wifi customers" on public.wifi_customers;
create policy "Org authorized users manage wifi customers" on public.wifi_customers for all
    using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF','CAFE_OPERATOR']::public.user_role[]))
    with check (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF','CAFE_OPERATOR']::public.user_role[]));

drop policy if exists "Authorized users manage wifi packages" on public.wifi_packages;
create policy "Org authorized users manage wifi packages" on public.wifi_packages for all
    using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF','CAFE_OPERATOR']::public.user_role[]))
    with check (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF','CAFE_OPERATOR']::public.user_role[]));

drop policy if exists "Authorized users manage wifi sessions" on public.wifi_sessions;
create policy "Org authorized users manage wifi sessions" on public.wifi_sessions for all
    using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF','CAFE_OPERATOR']::public.user_role[]))
    with check (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF','CAFE_OPERATOR']::public.user_role[]));

drop policy if exists "Authorized users manage wifi usage logs" on public.wifi_usage_logs;
create policy "Org authorized users manage wifi usage logs" on public.wifi_usage_logs for all
    using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF','CAFE_OPERATOR']::public.user_role[]))
    with check (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF','CAFE_OPERATOR']::public.user_role[]));

drop policy if exists "Authorized users read router settings" on public.router_settings;
create policy "Org authorized users read router settings" on public.router_settings for select
    using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF','CAFE_OPERATOR']::public.user_role[]));
drop policy if exists "Admins manage router settings" on public.router_settings;
create policy "Org admins manage router settings" on public.router_settings for all
    using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN']::public.user_role[]))
    with check (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN']::public.user_role[]));

-- printers / print_jobs / paper_inventory / print_pricing_settings
-- (authenticated-user policies only — anon agent policies from
-- agent_schema.sql are untouched)
do $$ begin
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'printers') then
        execute 'drop policy if exists "Authenticated users read printers" on public.printers';
        execute 'create policy "Org members read printers" on public.printers for select using (organization_id in (select public.current_org_ids()))';
        execute 'drop policy if exists "Admins manage printers" on public.printers';
        execute $p$create policy "Org admins manage printers" on public.printers for all using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN']::public.user_role[])) with check (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN']::public.user_role[]))$p$;
    end if;

    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'print_jobs') then
        execute $p$drop policy if exists "Admins read print jobs" on public.print_jobs$p$;
        execute $p$create policy "Org admins read print jobs" on public.print_jobs for select using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN']::public.user_role[]))$p$;
        execute $p$drop policy if exists "Admins and cafe operators manage print jobs" on public.print_jobs$p$;
        execute $p$create policy "Org admins and cafe operators manage print jobs" on public.print_jobs for all using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','CAFE_OPERATOR']::public.user_role[])) with check (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','CAFE_OPERATOR']::public.user_role[]))$p$;
    end if;

    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'paper_inventory') then
        execute $p$drop policy if exists "Admins manage paper inventory" on public.paper_inventory$p$;
        execute $p$create policy "Org admins manage paper inventory" on public.paper_inventory for all using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN']::public.user_role[])) with check (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN']::public.user_role[]))$p$;
    end if;

    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'print_pricing_settings') then
        execute $p$drop policy if exists "Admins manage pricing" on public.print_pricing_settings$p$;
        execute $p$create policy "Org admins manage pricing" on public.print_pricing_settings for all using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN']::public.user_role[])) with check (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN']::public.user_role[]))$p$;
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. TRIGGER FUNCTIONS: carry organization_id through derived inserts
-- ---------------------------------------------------------------------------

create or replace function public.process_sale_item_deduction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- organization_id match is required here, not just relied on via RLS:
    -- the INSERT policy on sale_items only checks that sale_items.organization_id
    -- is one of the caller's orgs, not that product_id actually belongs to that
    -- org. Without this filter, a crafted sale_items row could reference a
    -- product_id from a different tenant and this SECURITY DEFINER trigger
    -- would silently deduct that other tenant's stock.
    update public.products
    set quantity = quantity - new.quantity,
        updated_at = timezone('utc'::text, now())
    where id = new.product_id
      and organization_id = new.organization_id
      and quantity >= new.quantity;

    if not found then
        raise exception 'Insufficient stock for product % (or product does not belong to organization %)', new.product_id, new.organization_id;
    end if;

    insert into public.inventory_transactions (product_id, type, quantity, created_by, organization_id)
    select new.product_id, 'SALE', -new.quantity, s.created_by, new.organization_id
    from public.sales s
    where s.id = new.sale_id;

    return new;
end;
$$;

do $$ begin
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'print_pricing_settings') then
        execute $f$
        create or replace function public.calculate_print_job_financials()
        returns trigger
        language plpgsql
        security definer
        set search_path = public
        as $body$
        declare
            v_bw_price       numeric(10,4);
            v_colour_price   numeric(10,4);
            v_paper_cost     numeric(10,4);
            v_price_per_page numeric(10,4);
        begin
            select
                coalesce(ps.bw_price_per_page,     0),
                coalesce(ps.colour_price_per_page, 0),
                coalesce(ps.paper_cost_per_page,   0)
            into v_bw_price, v_colour_price, v_paper_cost
            from public.print_pricing_settings ps
            where ps.organization_id = new.organization_id
            limit 1;

            if v_bw_price = 0 and v_colour_price = 0 then
                select cost_per_bw_page, cost_per_colour_page
                into v_bw_price, v_colour_price
                from public.printers
                where id = new.printer_id;
                v_paper_cost := 0;
            end if;

            if new.color_mode = 'Colour' then
                v_price_per_page := v_colour_price;
            else
                v_price_per_page := v_bw_price;
            end if;

            new.revenue := new.page_count * v_price_per_page;
            new.cost    := new.page_count * v_paper_cost;

            return new;
        end;
        $body$;
        $f$;
    end if;

    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'paper_inventory') then
        execute $f$
        create or replace function public.deduct_paper_inventory()
        returns trigger
        language plpgsql
        security definer
        set search_path = public
        as $body$
        declare
            v_pages_per_ream integer;
        begin
            if new.status <> 'Completed' then
                return new;
            end if;

            select pages_per_ream
            into v_pages_per_ream
            from public.paper_inventory
            where paper_size = new.paper_size
              and organization_id = new.organization_id
            order by updated_at desc
            limit 1;

            if not found then
                return new;
            end if;

            update public.paper_inventory
            set reams_remaining = greatest(
                    0,
                    reams_remaining - (new.page_count::numeric / greatest(v_pages_per_ream, 1))
                ),
                updated_at = timezone('utc', now())
            where paper_size = new.paper_size
              and organization_id = new.organization_id;

            return new;
        end;
        $body$;
        $f$;
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. INDEXES
-- ---------------------------------------------------------------------------

create index if not exists organizations_name_idx on public.organizations (name);
create index if not exists user_org_memberships_user_idx on public.user_organization_memberships (user_id);
create index if not exists user_org_memberships_org_idx on public.user_organization_memberships (org_id);

create index if not exists products_organization_id_idx              on public.products (organization_id);
create index if not exists customers_organization_id_idx              on public.customers (organization_id);
create index if not exists sales_organization_id_idx                  on public.sales (organization_id);
create index if not exists sale_items_organization_id_idx             on public.sale_items (organization_id);
create index if not exists inventory_transactions_organization_id_idx on public.inventory_transactions (organization_id);
create index if not exists printing_orders_organization_id_idx        on public.printing_orders (organization_id);
create index if not exists computers_organization_id_idx              on public.computers (organization_id);
create index if not exists cafe_sessions_organization_id_idx          on public.cafe_sessions (organization_id);
create index if not exists activity_logs_organization_id_idx          on public.activity_logs (organization_id);
create index if not exists wifi_customers_organization_id_idx         on public.wifi_customers (organization_id);
create index if not exists wifi_packages_organization_id_idx          on public.wifi_packages (organization_id);
create index if not exists wifi_sessions_organization_id_idx          on public.wifi_sessions (organization_id);
create index if not exists wifi_usage_logs_organization_id_idx        on public.wifi_usage_logs (organization_id);
create index if not exists router_settings_organization_id_idx        on public.router_settings (organization_id);

do $$ begin
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'printers') then
        create index if not exists printers_organization_id_idx on public.printers (organization_id);
    end if;
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'print_jobs') then
        create index if not exists print_jobs_organization_id_idx on public.print_jobs (organization_id);
    end if;
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'paper_inventory') then
        create index if not exists paper_inventory_organization_id_idx on public.paper_inventory (organization_id);
    end if;
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'print_pricing_settings') then
        create index if not exists print_pricing_settings_organization_id_idx on public.print_pricing_settings (organization_id);
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. BOOTSTRAP — guarantee a default org + map any pre-existing users to it.
-- ---------------------------------------------------------------------------

select public.bootstrap_default_organization();

comment on table public.organizations is 'Tenants. Every business table carries organization_id and is RLS-scoped to the caller''s memberships.';
comment on table public.user_organization_memberships is 'Which organizations a user belongs to. Drives every org-scoped RLS policy via current_org_ids().';
comment on function public.current_org_ids() is 'Org ids the calling user is a member of — use in RLS as organization_id in (select public.current_org_ids())';
comment on function public.default_organization_id() is 'Fallback organization for inserts that omit organization_id (e.g. the anon-key pc-agent). Auto-creates "Default Organization" on first use.';

-- <<<<<<<<<< END migrations/001_multi_tenancy.sql <<<<<<<<<<

-- >>>>>>>>>> BEGIN migrations/002_pharmacy_module.sql >>>>>>>>>>
-- ============================================================================
-- MIGRATION 002: PHARMACY MODULE
-- Adds a full pharmacy silo: medicine catalog, batch/lot + expiry tracking,
-- prescriptions, and an append-only dispensing ledger — all organization-
-- scoped exactly like every other table (see migrations/001_multi_tenancy.sql).
--
-- Apply AFTER migration 001_multi_tenancy.sql.
-- Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------------------------

do $$ begin
    if not exists (select 1 from pg_type where typname = 'medicine_dosage_form') then
        create type public.medicine_dosage_form as enum (
            'TABLET', 'CAPSULE', 'SYRUP', 'INJECTION', 'OINTMENT',
            'DROPS', 'INHALER', 'CREAM', 'POWDER', 'OTHER'
        );
    end if;
end $$;

do $$ begin
    if not exists (select 1 from pg_type where typname = 'prescription_status') then
        create type public.prescription_status as enum (
            'PENDING', 'PARTIALLY_DISPENSED', 'DISPENSED', 'CANCELLED'
        );
    end if;
end $$;

-- Note: pharmacy access is gated with the existing ADMIN / STAFF roles
-- rather than a new enum value. Postgres can't use a value added via
-- `ALTER TYPE ... ADD VALUE` in the same transaction that added it, and the
-- Supabase SQL editor runs a pasted multi-statement script as one implicit
-- transaction — so introducing and immediately using a new role value in a
-- single migration file would fail with "unsafe use of new value of enum
-- type". Reusing ADMIN/STAFF keeps this migration a single safe-to-paste run.

-- Re-declared here (idempotently) so this migration doesn't require
-- print_schema.sql to have been applied first — pharmacy-only tenants may
-- skip the Print Manager module entirely.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. MEDICINES (catalog)
-- ---------------------------------------------------------------------------

create table if not exists public.medicines (
    id                      uuid default uuid_generate_v4() primary key,
    organization_id         uuid not null references public.organizations(id) default public.default_organization_id(),

    name                    text not null,
    generic_name            text,
    dosage_form             public.medicine_dosage_form not null default 'TABLET',
    strength                text,                 -- e.g. '500mg', '5ml'
    unit                    text not null default 'Unit',  -- e.g. Tablet, Bottle, Vial, Box
    category                text,                 -- therapeutic class e.g. 'Analgesic', 'Antibiotic'

    requires_prescription   boolean not null default false,
    controlled_substance    boolean not null default false,

    reorder_level           integer not null default 10 check (reorder_level >= 0),
    buying_price            numeric(10, 2) not null default 0 check (buying_price >= 0),
    selling_price           numeric(10, 2) not null default 0 check (selling_price >= 0),
    barcode                 text,
    is_active               boolean not null default true,

    created_at              timestamptz default timezone('utc'::text, now()) not null,
    updated_at              timestamptz default timezone('utc'::text, now()) not null,

    unique (organization_id, name, strength)
);

alter table public.medicines enable row level security;

drop policy if exists "Org members read medicines" on public.medicines;
create policy "Org members read medicines" on public.medicines for select
    using (organization_id in (select public.current_org_ids()));
drop policy if exists "Org pharmacy staff manage medicines" on public.medicines;
create policy "Org pharmacy staff manage medicines" on public.medicines for all
    using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]))
    with check (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]));

drop trigger if exists tr_medicines_updated_at on public.medicines;
create trigger tr_medicines_updated_at
    before update on public.medicines
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. MEDICINE BATCHES (lot / expiry tracking, FEFO stock)
-- ---------------------------------------------------------------------------

create table if not exists public.medicine_batches (
    id                uuid default uuid_generate_v4() primary key,
    organization_id   uuid not null references public.organizations(id) default public.default_organization_id(),
    medicine_id       uuid not null references public.medicines(id) on delete cascade,

    batch_number      text not null,
    quantity          integer not null default 0 check (quantity >= 0),
    expiry_date       date not null,
    manufacture_date  date,
    supplier          text,
    cost_price        numeric(10, 2) default 0 check (cost_price >= 0),

    received_at       timestamptz default timezone('utc'::text, now()) not null,
    created_by        uuid references public.users(id) on delete set null,
    created_at        timestamptz default timezone('utc'::text, now()) not null,

    unique (organization_id, medicine_id, batch_number)
);

alter table public.medicine_batches enable row level security;

drop policy if exists "Org members read medicine batches" on public.medicine_batches;
create policy "Org members read medicine batches" on public.medicine_batches for select
    using (organization_id in (select public.current_org_ids()));
drop policy if exists "Org pharmacy staff manage medicine batches" on public.medicine_batches;
create policy "Org pharmacy staff manage medicine batches" on public.medicine_batches for all
    using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]))
    with check (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]));

-- ---------------------------------------------------------------------------
-- 3. PRESCRIPTIONS + ITEMS
-- ---------------------------------------------------------------------------

create table if not exists public.prescriptions (
    id                    uuid default uuid_generate_v4() primary key,
    organization_id       uuid not null references public.organizations(id) default public.default_organization_id(),
    customer_id           uuid references public.customers(id) on delete set null,

    patient_name          text not null,
    prescribing_doctor    text,
    diagnosis             text,
    issued_date           date not null default current_date,
    status                public.prescription_status not null default 'PENDING',
    notes                 text,

    created_by            uuid references public.users(id) on delete set null,
    created_at            timestamptz default timezone('utc'::text, now()) not null,
    updated_at            timestamptz default timezone('utc'::text, now()) not null
);

alter table public.prescriptions enable row level security;

drop policy if exists "Org members read prescriptions" on public.prescriptions;
create policy "Org members read prescriptions" on public.prescriptions for select
    using (organization_id in (select public.current_org_ids()));
drop policy if exists "Org pharmacy staff manage prescriptions" on public.prescriptions;
create policy "Org pharmacy staff manage prescriptions" on public.prescriptions for all
    using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]))
    with check (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]));

drop trigger if exists tr_prescriptions_updated_at on public.prescriptions;
create trigger tr_prescriptions_updated_at
    before update on public.prescriptions
    for each row execute function public.set_updated_at();

create table if not exists public.prescription_items (
    id                    uuid default uuid_generate_v4() primary key,
    organization_id       uuid not null references public.organizations(id) default public.default_organization_id(),
    prescription_id       uuid not null references public.prescriptions(id) on delete cascade,
    medicine_id           uuid not null references public.medicines(id) on delete restrict,

    quantity_prescribed   integer not null check (quantity_prescribed > 0),
    quantity_dispensed    integer not null default 0 check (quantity_dispensed >= 0),
    dosage_instructions   text,

    created_at            timestamptz default timezone('utc'::text, now()) not null,

    constraint prescription_items_dispensed_lte_prescribed check (quantity_dispensed <= quantity_prescribed)
);

alter table public.prescription_items enable row level security;

drop policy if exists "Org members read prescription items" on public.prescription_items;
create policy "Org members read prescription items" on public.prescription_items for select
    using (organization_id in (select public.current_org_ids()));
drop policy if exists "Org pharmacy staff manage prescription items" on public.prescription_items;
create policy "Org pharmacy staff manage prescription items" on public.prescription_items for all
    using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]))
    with check (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]));

-- ---------------------------------------------------------------------------
-- 4. DISPENSING RECORDS (append-only ledger — no update/delete policy,
--    mirroring how `sales` is handled elsewhere in this schema)
-- ---------------------------------------------------------------------------

create table if not exists public.dispensing_records (
    id                      uuid default uuid_generate_v4() primary key,
    organization_id         uuid not null references public.organizations(id) default public.default_organization_id(),

    prescription_id         uuid references public.prescriptions(id) on delete set null,
    prescription_item_id    uuid references public.prescription_items(id) on delete set null,
    medicine_id             uuid not null references public.medicines(id) on delete restrict,
    batch_id                uuid not null references public.medicine_batches(id) on delete restrict,
    customer_id              uuid references public.customers(id) on delete set null,

    quantity                integer not null check (quantity > 0),
    unit_price              numeric(10, 2) not null check (unit_price >= 0),
    total_price             numeric(10, 2) generated always as (quantity * unit_price) stored,

    dispensed_by            uuid references public.users(id) on delete set null,
    dispensed_at            timestamptz not null default timezone('utc'::text, now()),
    notes                   text
);

alter table public.dispensing_records enable row level security;

drop policy if exists "Org members read dispensing records" on public.dispensing_records;
create policy "Org members read dispensing records" on public.dispensing_records for select
    using (organization_id in (select public.current_org_ids()));
drop policy if exists "Org pharmacists dispense medicine" on public.dispensing_records;
create policy "Org pharmacists dispense medicine" on public.dispensing_records for insert
    with check (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]));

-- ---------------------------------------------------------------------------
-- 5. STOCK DEDUCTION + PRESCRIPTION STATUS TRIGGER
-- ---------------------------------------------------------------------------

create or replace function public.process_dispensing_deduction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_expiry date;
begin
    -- organization_id and medicine_id must both be checked here, not just
    -- relied on via RLS: the INSERT policy on dispensing_records only
    -- validates dispensing_records.organization_id, not that batch_id
    -- actually belongs to that org or to the stated medicine_id. Without
    -- these filters, a crafted insert could drain another tenant's batch,
    -- or log one medicine while silently deducting a different one.
    select expiry_date into v_expiry
    from public.medicine_batches
    where id = new.batch_id
      and organization_id = new.organization_id
      and medicine_id = new.medicine_id;

    if not found then
        raise exception 'Batch % not found for medicine % in organization %', new.batch_id, new.medicine_id, new.organization_id;
    end if;

    if v_expiry is not null and v_expiry < current_date then
        raise exception 'Cannot dispense from expired batch (expired %)', v_expiry;
    end if;

    update public.medicine_batches
    set quantity = quantity - new.quantity
    where id = new.batch_id
      and organization_id = new.organization_id
      and medicine_id = new.medicine_id
      and quantity >= new.quantity;

    if not found then
        raise exception 'Insufficient batch stock for medicine %', new.medicine_id;
    end if;

    if new.prescription_item_id is not null then
        update public.prescription_items
        set quantity_dispensed = least(quantity_prescribed, quantity_dispensed + new.quantity)
        where id = new.prescription_item_id;
    end if;

    if new.prescription_id is not null then
        update public.prescriptions p
        set status = case
                when (
                    select bool_and(pi.quantity_dispensed >= pi.quantity_prescribed)
                    from public.prescription_items pi
                    where pi.prescription_id = p.id
                ) then 'DISPENSED'::public.prescription_status
                when (
                    select bool_or(pi.quantity_dispensed > 0)
                    from public.prescription_items pi
                    where pi.prescription_id = p.id
                ) then 'PARTIALLY_DISPENSED'::public.prescription_status
                else p.status
            end,
            updated_at = timezone('utc'::text, now())
        where p.id = new.prescription_id;
    end if;

    return new;
end;
$$;

drop trigger if exists tr_on_dispensing_insert on public.dispensing_records;
create trigger tr_on_dispensing_insert
    after insert on public.dispensing_records
    for each row execute function public.process_dispensing_deduction();

-- ---------------------------------------------------------------------------
-- 6. STOCK + EXPIRY VIEWS (dashboard alerts)
-- ---------------------------------------------------------------------------

-- security_invoker = true is required: without it, Postgres checks
-- permissions against the underlying tables as the VIEW OWNER (the role
-- that ran this migration, which bypasses RLS), not the querying user —
-- silently leaking every organization's stock/expiry data to any
-- authenticated caller. Confirmed against Supabase's security advisor.
create or replace view public.medicine_stock_levels
with (security_invoker = true) as
select
    m.id as medicine_id,
    m.organization_id,
    m.name,
    m.reorder_level,
    coalesce(sum(b.quantity), 0)::bigint as total_quantity,
    case
        when coalesce(sum(b.quantity), 0) = 0 then 'OUT_OF_STOCK'
        when coalesce(sum(b.quantity), 0) <= m.reorder_level then 'LOW_STOCK'
        else 'OK'
    end as stock_status
from public.medicines m
left join public.medicine_batches b
    on b.medicine_id = m.id and b.expiry_date >= current_date
where m.is_active
group by m.id, m.organization_id, m.name, m.reorder_level;

create or replace view public.expiring_medicine_batches
with (security_invoker = true) as
select
    b.id as batch_id,
    b.organization_id,
    b.medicine_id,
    m.name as medicine_name,
    b.batch_number,
    b.quantity,
    b.expiry_date,
    (b.expiry_date - current_date) as days_until_expiry,
    case
        when b.expiry_date < current_date then 'EXPIRED'
        when b.expiry_date <= current_date + interval '30 days' then 'CRITICAL'
        when b.expiry_date <= current_date + interval '90 days' then 'WARNING'
        else 'OK'
    end as alert_level
from public.medicine_batches b
join public.medicines m on m.id = b.medicine_id
where b.quantity > 0
  and b.expiry_date <= current_date + interval '90 days';

-- ---------------------------------------------------------------------------
-- 7. INDEXES
-- ---------------------------------------------------------------------------

create index if not exists medicines_organization_id_idx           on public.medicines (organization_id);
create index if not exists medicines_name_idx                      on public.medicines (name);
create index if not exists medicines_is_active_idx                 on public.medicines (is_active);

create index if not exists medicine_batches_organization_id_idx    on public.medicine_batches (organization_id);
create index if not exists medicine_batches_medicine_id_idx        on public.medicine_batches (medicine_id);
create index if not exists medicine_batches_expiry_date_idx        on public.medicine_batches (expiry_date);

create index if not exists prescriptions_organization_id_idx       on public.prescriptions (organization_id);
create index if not exists prescriptions_customer_id_idx           on public.prescriptions (customer_id);
create index if not exists prescriptions_status_idx                on public.prescriptions (status);
create index if not exists prescriptions_created_at_idx            on public.prescriptions (created_at desc);

create index if not exists prescription_items_organization_id_idx  on public.prescription_items (organization_id);
create index if not exists prescription_items_prescription_id_idx  on public.prescription_items (prescription_id);
create index if not exists prescription_items_medicine_id_idx      on public.prescription_items (medicine_id);

create index if not exists dispensing_records_organization_id_idx  on public.dispensing_records (organization_id);
create index if not exists dispensing_records_prescription_id_idx  on public.dispensing_records (prescription_id);
create index if not exists dispensing_records_medicine_id_idx      on public.dispensing_records (medicine_id);
create index if not exists dispensing_records_batch_id_idx         on public.dispensing_records (batch_id);
create index if not exists dispensing_records_dispensed_at_idx     on public.dispensing_records (dispensed_at desc);

-- ---------------------------------------------------------------------------
-- REALTIME
-- ---------------------------------------------------------------------------

do $$ begin
  alter publication supabase_realtime add table public.medicine_batches;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.dispensing_records;
exception when duplicate_object then null; end $$;

comment on table public.medicines is 'Pharmacy catalog: drug name, form, strength, pricing, prescription/controlled-substance flags.';
comment on table public.medicine_batches is 'Lot-level stock with expiry dates. Dispensing draws down a specific batch (client picks the soonest-expiring batch — FEFO).';
comment on table public.prescriptions is 'A prescription issued to a customer/patient; tracks fulfillment status across its items.';
comment on table public.dispensing_records is 'Append-only ledger of every unit dispensed, prescription-linked or over-the-counter.';
comment on view public.medicine_stock_levels is 'Live stock per medicine (non-expired batches only) with OUT_OF_STOCK / LOW_STOCK / OK status.';
comment on view public.expiring_medicine_batches is 'Batches expired or expiring within 90 days, for the pharmacy dashboard alert feed.';

-- <<<<<<<<<< END migrations/002_pharmacy_module.sql <<<<<<<<<<

-- >>>>>>>>>> BEGIN migrations/003_organization_signup.sql >>>>>>>>>>
-- ============================================================================
-- MIGRATION 003: SELF-SERVICE ORGANIZATION SIGNUP
-- Lets a brand-new Supabase Auth user create their own organization and
-- become its ADMIN in one transaction, from the app's Signup page —
-- previously this required an admin to run SQL by hand (see
-- docs/DEPLOYMENT.md "Onboarding a new tenant").
--
-- Why a SECURITY DEFINER function instead of plain inserts: a brand-new
-- user has no public.users row yet (or, at best, only enough privilege to
-- insert themselves as STAFF — see "Users can create own staff profile" in
-- schema.sql). Both public.organizations and
-- public.user_organization_memberships only allow INSERT from an existing
-- ADMIN. A signing-up user is, by definition, neither yet — so this
-- function runs with elevated privileges to bootstrap all three rows
-- (organizations, users, user_organization_memberships), but is scoped
-- tightly to auth.uid() so it can only ever act on the CALLING user's own
-- account, not anyone else's.
--
-- Apply AFTER migration 001_multi_tenancy.sql.
-- Safe to re-run.
-- ============================================================================

create or replace function public.signup_new_organization(org_name text, owner_name text default null)
returns table (organization_id uuid, role public.user_role)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_email text;
    v_org_id uuid;
    v_org_name text := trim(coalesce(org_name, ''));
begin
    if v_user_id is null then
        raise exception 'Must be signed in to create an organization';
    end if;

    -- One organization-creation per auth account. An account that already
    -- has a profile (whether from a prior signup or an admin-provisioned
    -- invite) must be added to additional organizations by an existing
    -- ADMIN instead — see docs/DEPLOYMENT.md "Onboarding a new tenant".
    if exists (select 1 from public.users where id = v_user_id) then
        raise exception 'This account already has a profile. Sign in instead, or ask an admin to add you to another organization.';
    end if;

    if v_org_name = '' then
        raise exception 'Organization name is required';
    end if;

    select email into v_email from auth.users where id = v_user_id;
    if v_email is null then
        raise exception 'Could not resolve the signed-in account''s email';
    end if;

    insert into public.organizations (name)
    values (v_org_name)
    returning id into v_org_id;

    insert into public.users (id, name, email, role)
    values (
        v_user_id,
        coalesce(nullif(trim(owner_name), ''), split_part(v_email, '@', 1)),
        v_email,
        'ADMIN'
    );

    -- Usually redundant with tr_auto_enroll_default_organization (which
    -- fires on the users insert above and already enrolls into the org when
    -- it's the only one), but explicit here so this function is correct
    -- standalone even if that trigger is ever changed — and it's a no-op
    -- via ON CONFLICT when the trigger already did it.
    insert into public.user_organization_memberships (user_id, org_id)
    values (v_user_id, v_org_id)
    on conflict (user_id, org_id) do nothing;

    return query select v_org_id, 'ADMIN'::public.user_role;
end;
$$;

-- Belt-and-suspenders: the function already raises an exception when
-- auth.uid() is null, so an anon caller gets a clean error either way. But
-- Supabase re-applies its default anon/authenticated/service_role execute
-- grants around function creation, so a single REVOKE ALL FROM PUBLIC issued
-- alongside the CREATE doesn't reliably strip anon's grant — REVOKE EXECUTE
-- FROM anon explicitly, as its own statement, does.
revoke all on function public.signup_new_organization(text, text) from public;
grant execute on function public.signup_new_organization(text, text) to authenticated;
revoke execute on function public.signup_new_organization(text, text) from anon;

comment on function public.signup_new_organization(text, text) is 'Self-service signup: creates an organization and makes the calling (already-authenticated) user its ADMIN. Scoped to auth.uid() — cannot act on any other account.';

-- <<<<<<<<<< END migrations/003_organization_signup.sql <<<<<<<<<<

-- >>>>>>>>>> BEGIN migrations/004_business_type.sql >>>>>>>>>>
-- ============================================================================
-- MIGRATION 004: ORGANIZATION BUSINESS TYPE
-- Lets a tenant declare what kind of business it runs (general, pharmacy,
-- cafe, printing, retail) so the app can tailor which modules its nav shows.
-- Purely additive — existing organizations default to 'general', which shows
-- every module exactly like before this migration (nothing hides itself
-- without an explicit choice).
--
-- Apply AFTER migration 003_organization_signup.sql.
-- Safe to re-run.
-- ============================================================================

do $$ begin
    create type public.business_type as enum ('general', 'pharmacy', 'cafe', 'printing', 'retail');
exception when duplicate_object then null; end $$;

alter table public.organizations
    add column if not exists business_type public.business_type not null default 'general';

comment on column public.organizations.business_type is
    'What kind of business this tenant runs. Drives which nav modules the app shows by default (general = everything, unchanged from pre-migration behavior).';

-- Replace the 2-arg signup_new_organization from migration 003 with a
-- 3-arg version. Drop the old overload first (rather than leaving both) so
-- there's exactly one signature to grant/revoke and reason about.
drop function if exists public.signup_new_organization(text, text) cascade;

create or replace function public.signup_new_organization(
    org_name text,
    owner_name text default null,
    business_type text default 'general'
)
returns table (organization_id uuid, role public.user_role)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_email text;
    v_org_id uuid;
    v_org_name text := trim(coalesce(org_name, ''));
    v_business_type public.business_type;
begin
    if v_user_id is null then
        raise exception 'Must be signed in to create an organization';
    end if;

    if exists (select 1 from public.users where id = v_user_id) then
        raise exception 'This account already has a profile. Sign in instead, or ask an admin to add you to another organization.';
    end if;

    if v_org_name = '' then
        raise exception 'Organization name is required';
    end if;

    begin
        v_business_type := coalesce(nullif(trim(business_type), ''), 'general')::public.business_type;
    exception when invalid_text_representation then
        raise exception 'Unknown business type: %', business_type;
    end;

    select email into v_email from auth.users where id = v_user_id;
    if v_email is null then
        raise exception 'Could not resolve the signed-in account''s email';
    end if;

    insert into public.organizations (name, business_type)
    values (v_org_name, v_business_type)
    returning id into v_org_id;

    insert into public.users (id, name, email, role)
    values (
        v_user_id,
        coalesce(nullif(trim(owner_name), ''), split_part(v_email, '@', 1)),
        v_email,
        'ADMIN'
    );

    insert into public.user_organization_memberships (user_id, org_id)
    values (v_user_id, v_org_id)
    on conflict (user_id, org_id) do nothing;

    return query select v_org_id, 'ADMIN'::public.user_role;
end;
$$;

-- Same ACL hardening as migration 003 (Supabase re-applies default schema
-- grants around CREATE FUNCTION, so anon's execute grant must be revoked as
-- its own later statement — see 003_organization_signup.sql for detail).
revoke all on function public.signup_new_organization(text, text, text) from public;
grant execute on function public.signup_new_organization(text, text, text) to authenticated;
revoke execute on function public.signup_new_organization(text, text, text) from anon;

comment on function public.signup_new_organization(text, text, text) is 'Self-service signup: creates an organization (with a business type) and makes the calling (already-authenticated) user its ADMIN. Scoped to auth.uid() — cannot act on any other account.';

-- <<<<<<<<<< END migrations/004_business_type.sql <<<<<<<<<<

-- >>>>>>>>>> BEGIN migrations/005_team_invites.sql >>>>>>>>>>
-- ============================================================================
-- MIGRATION 005: TEAM INVITES + ORG-SCOPED USER VISIBILITY
-- Lets an org's ADMIN invite a teammate by email and assign them a role
-- (ADMIN, STAFF, or CAFE_OPERATOR) instead of every new signup always
-- creating a brand-new organization. Also closes a cross-tenant gap: the
-- pre-existing "Admins manage users" policy on public.users had no
-- organization_id filter (public.users itself carries no organization_id —
-- membership lives in user_organization_memberships), so any ADMIN of ANY
-- org could read/update every user row platform-wide. That was harmless
-- while every deployment stayed single-tenant, but this migration's own
-- Team page is the first UI to actually list "all users" back to an admin,
-- so it's fixed here rather than shipped alongside a feature that would
-- immediately exercise the leak.
--
-- Apply AFTER migration 004_business_type.sql.
-- Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. ORG-SCOPE public.users RLS
-- ---------------------------------------------------------------------------

drop policy if exists "Users can read own profile" on public.users;
create policy "Users read own profile or org admins read org members" on public.users for select
    using (
        id = auth.uid()
        or (
            public.is_role(array['ADMIN']::public.user_role[])
            and id in (select user_id from public.user_organization_memberships where org_id in (select public.current_org_ids()))
        )
    );

-- Split the old blanket "Admins manage users" (for all) into update/delete
-- only, both org-scoped. Insert stays covered by "Users can create own staff
-- profile" (self-service) and the SECURITY DEFINER signup/invite functions
-- below, which don't need a direct table grant to admins at all.
drop policy if exists "Admins manage users" on public.users;

create policy "Org admins update org members" on public.users for update
    using (
        public.is_role(array['ADMIN']::public.user_role[])
        and id in (select user_id from public.user_organization_memberships where org_id in (select public.current_org_ids()))
    )
    with check (
        public.is_role(array['ADMIN']::public.user_role[])
        and id in (select user_id from public.user_organization_memberships where org_id in (select public.current_org_ids()))
    );

create policy "Org admins delete org members" on public.users for delete
    using (
        public.is_role(array['ADMIN']::public.user_role[])
        and id in (select user_id from public.user_organization_memberships where org_id in (select public.current_org_ids()))
    );

-- ---------------------------------------------------------------------------
-- 2. INVITES TABLE
-- ---------------------------------------------------------------------------

create table if not exists public.organization_invites (
    id uuid default uuid_generate_v4() primary key,
    org_id uuid not null references public.organizations(id) on delete cascade,
    email text not null,
    role public.user_role not null default 'STAFF',
    token text not null unique,
    invited_by uuid references public.users(id) on delete set null,
    created_at timestamptz default timezone('utc'::text, now()) not null,
    expires_at timestamptz default (timezone('utc'::text, now()) + interval '7 days') not null,
    accepted_at timestamptz,
    revoked_at timestamptz
);

alter table public.organization_invites enable row level security;

drop policy if exists "Org admins view their invites" on public.organization_invites;
create policy "Org admins view their invites" on public.organization_invites for select
    using (org_id in (select public.current_org_ids()) and public.is_role(array['ADMIN']::public.user_role[]));

-- Update-only (used to revoke a pending invite) — creation always goes
-- through create_organization_invite() below so token generation and the
-- "revoke any existing pending invite for this email" dedup logic can't be
-- bypassed by a direct insert.
drop policy if exists "Org admins revoke their invites" on public.organization_invites;
create policy "Org admins revoke their invites" on public.organization_invites for update
    using (org_id in (select public.current_org_ids()) and public.is_role(array['ADMIN']::public.user_role[]))
    with check (org_id in (select public.current_org_ids()) and public.is_role(array['ADMIN']::public.user_role[]));

comment on table public.organization_invites is 'Pending/accepted/revoked invitations for someone to join an organization with a specific role. Tokens are opaque bearer credentials — anyone with the link can accept, so get_invite_info() and accept_organization_invite() are the only ways to read/consume one.';

-- ---------------------------------------------------------------------------
-- 3. RPCs
-- ---------------------------------------------------------------------------

-- Admin action: invite a teammate into the caller's own organization.
create or replace function public.create_organization_invite(p_email text, p_role text default 'STAFF')
returns table (id uuid, token text, email text, role public.user_role, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_org_id uuid;
    v_role public.user_role;
    v_token text;
begin
    if not public.is_role(array['ADMIN']::public.user_role[]) then
        raise exception 'Only an organization admin can invite teammates';
    end if;

    select org_id into v_org_id from public.user_organization_memberships where user_id = auth.uid() limit 1;
    if v_org_id is null then
        raise exception 'You are not a member of any organization';
    end if;

    if p_email is null or trim(p_email) = '' then
        raise exception 'Email is required';
    end if;

    begin
        v_role := coalesce(nullif(trim(p_role), ''), 'STAFF')::public.user_role;
    exception when invalid_text_representation then
        raise exception 'Unknown role: %', p_role;
    end;

    -- Revoke any still-pending invite to the same email in this org first,
    -- so re-inviting someone (e.g. they lost the link) doesn't leave two
    -- valid tokens floating around.
    update public.organization_invites oi
    set revoked_at = timezone('utc'::text, now())
    where oi.org_id = v_org_id
      and lower(oi.email) = lower(trim(p_email))
      and oi.accepted_at is null
      and oi.revoked_at is null;

    v_token := replace(uuid_generate_v4()::text || uuid_generate_v4()::text, '-', '');

    return query
    insert into public.organization_invites (org_id, email, role, token, invited_by)
    values (v_org_id, lower(trim(p_email)), v_role, v_token, auth.uid())
    returning organization_invites.id, organization_invites.token, organization_invites.email, organization_invites.role, organization_invites.expires_at;
end;
$$;

revoke all on function public.create_organization_invite(text, text) from public;
grant execute on function public.create_organization_invite(text, text) to authenticated;
revoke execute on function public.create_organization_invite(text, text) from anon;

comment on function public.create_organization_invite(text, text) is 'Admin-only: creates (or replaces, if one is already pending for the same email) an invite for the caller''s own organization. Scoped to auth.uid()''s org — cannot invite into another tenant.';

-- Public lookup so the Signup page can show "You''re invited to join {org}
-- as {role}" before the visitor has authenticated. Safe to expose: the
-- token itself is the secret, and this only echoes back what its holder
-- already implicitly knows (which org, which role) — no other tenant data.
create or replace function public.get_invite_info(p_token text)
returns table (org_name text, role public.user_role, email text)
language sql
stable
security definer
set search_path = public
as $$
    select o.name, i.role, i.email
    from public.organization_invites i
    join public.organizations o on o.id = i.org_id
    where i.token = p_token
      and i.accepted_at is null
      and i.revoked_at is null
      and i.expires_at > timezone('utc'::text, now())
$$;

revoke all on function public.get_invite_info(text) from public;
grant execute on function public.get_invite_info(text) to anon, authenticated;

comment on function public.get_invite_info(text) is 'Anon-callable: resolves a still-valid invite token to its org name / role / invited email, for the Signup page''s pre-auth "you''re joining X as Y" preview.';

-- Mirrors signup_new_organization's shape but joins an EXISTING org with
-- whatever role the inviting admin chose, instead of creating a new one.
create or replace function public.accept_organization_invite(p_token text, p_name text default null)
returns table (organization_id uuid, role public.user_role)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_email text;
    v_invite record;
begin
    if v_user_id is null then
        raise exception 'Must be signed in to accept an invite';
    end if;

    if exists (select 1 from public.users where id = v_user_id) then
        raise exception 'This account already has a profile. Sign in instead, or ask an admin to add you to another organization.';
    end if;

    select * into v_invite from public.organization_invites
    where token = p_token
      and accepted_at is null
      and revoked_at is null
      and expires_at > timezone('utc'::text, now());

    if v_invite is null then
        raise exception 'This invite link is invalid, expired, or already used';
    end if;

    select email into v_email from auth.users where id = v_user_id;
    if v_email is null then
        raise exception 'Could not resolve the signed-in account''s email';
    end if;

    insert into public.users (id, name, email, role)
    values (
        v_user_id,
        coalesce(nullif(trim(p_name), ''), split_part(v_email, '@', 1)),
        v_email,
        v_invite.role
    );

    insert into public.user_organization_memberships (user_id, org_id)
    values (v_user_id, v_invite.org_id)
    on conflict (user_id, org_id) do nothing;

    update public.organization_invites set accepted_at = timezone('utc'::text, now()) where id = v_invite.id;

    return query select v_invite.org_id, v_invite.role;
end;
$$;

revoke all on function public.accept_organization_invite(text, text) from public;
grant execute on function public.accept_organization_invite(text, text) to authenticated;
revoke execute on function public.accept_organization_invite(text, text) from anon;

comment on function public.accept_organization_invite(text, text) is 'Self-service invite acceptance: joins the calling (already-authenticated) user to the invite''s organization with the invite''s role. Scoped to auth.uid() — cannot act on any other account. Consumes the invite (single use).';

-- <<<<<<<<<< END migrations/005_team_invites.sql <<<<<<<<<<

