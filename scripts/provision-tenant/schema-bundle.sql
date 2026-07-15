-- ============================================================
-- CaféOS tenant schema bundle — GENERATED. Do not edit by hand.
-- Regenerate with: scripts/provision-tenant/build-bundle.sh
-- Order: schema.sql -> print_schema.sql -> agent_schema.sql
-- Paste this whole file into a fresh Supabase project's SQL editor,
-- then run create-admin.sql to promote the owner account.
-- ============================================================

-- >>>>>>>>>> BEGIN schema.sql >>>>>>>>>>
-- ============================================================================
-- DUBE MAN INNOVATION SYSTEM - SUPABASE / POSTGRESQL SCHEMA
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
-- DUBE MAN PRINT MANAGER — Supabase / PostgreSQL Schema
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
-- DUBE MAN — PC AGENT SCHEMA
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

