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
