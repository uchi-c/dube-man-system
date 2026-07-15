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
    update public.products
    set quantity = quantity - new.quantity,
        updated_at = timezone('utc'::text, now())
    where id = new.product_id
      and quantity >= new.quantity;

    if not found then
        raise exception 'Insufficient stock for product %', new.product_id;
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
