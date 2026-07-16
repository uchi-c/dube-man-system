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
