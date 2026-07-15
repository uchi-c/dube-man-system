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
    select expiry_date into v_expiry
    from public.medicine_batches
    where id = new.batch_id;

    if v_expiry is not null and v_expiry < current_date then
        raise exception 'Cannot dispense from expired batch (expired %)', v_expiry;
    end if;

    update public.medicine_batches
    set quantity = quantity - new.quantity
    where id = new.batch_id
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

create or replace view public.medicine_stock_levels as
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

create or replace view public.expiring_medicine_batches as
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
