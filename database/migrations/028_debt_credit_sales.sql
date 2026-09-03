-- ============================================================================
-- MIGRATION 028: DEBT / CREDIT SALES TRACKING
--
-- The most-requested feature from tenants: selling "on the book" -- a
-- customer takes goods now and pays later, common across Zambian informal
-- retail. Until now `sales.payment_method` only covered Cash/Mobile
-- Money/Bank, all of which are settled in full at checkout.
--
-- This adds a fourth payment_method, 'Credit', plus the bookkeeping a
-- credit sale needs:
--
--   - sales.amount_paid / sales.payment_status -- how much of a sale has
--     actually been collected. Non-credit sales are always paid in full
--     at insert time (enforced by trigger, not just convention); a
--     Credit sale starts at amount_paid = 0 / payment_status = 'unpaid'
--     and is paid down over time.
--   - debt_payments -- one row per repayment against a credit sale.
--     Locked down the same way tenant_payments is (migration 014/015):
--     RLS enabled, zero policies, reachable only through the RPCs below.
--   - record_debt_payment() -- the only way to add a repayment. Locks
--     the sale row, rejects overpayment, and updates sales.amount_paid
--     in the same transaction.
--   - list_debt_payments() -- repayment history for one sale.
--   - list_outstanding_debts() -- per-customer rollup of what's owed,
--     for the tenant's new Debts view.
--
-- A credit sale requires a named customer (enforced by check constraint)
-- -- there's no way to collect from "Walk-in customer" later.
-- ============================================================================

alter table public.sales drop constraint sales_payment_method_check;
alter table public.sales add constraint sales_payment_method_check
    check (payment_method = any (array['Cash', 'Mobile Money', 'Bank', 'Credit']));

alter table public.sales add column if not exists amount_paid numeric not null default 0 check (amount_paid >= 0);
alter table public.sales add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('paid', 'partial', 'unpaid'));

-- Backfill: every existing row predates 'Credit', so all of them are
-- already fully settled.
update public.sales set amount_paid = total_amount, payment_status = 'paid';

alter table public.sales add constraint sales_amount_paid_not_exceeding_total check (amount_paid <= total_amount);
alter table public.sales add constraint sales_credit_requires_customer check (payment_method <> 'Credit' or customer_id is not null);

comment on column public.sales.amount_paid is 'How much of total_amount has actually been collected. Always equals total_amount for non-Credit sales (enforced by tr_sync_sale_payment_status); paid down over time for Credit sales via record_debt_payment().';
comment on column public.sales.payment_status is 'Derived from amount_paid vs total_amount by tr_sync_sale_payment_status -- paid / partial / unpaid. Not directly writable.';

create or replace function public.sync_sale_payment_status()
returns trigger
language plpgsql
as $$
begin
    if new.payment_method <> 'Credit' then
        new.amount_paid := new.total_amount;
    end if;

    if new.amount_paid >= new.total_amount then
        new.payment_status := 'paid';
    elsif new.amount_paid > 0 then
        new.payment_status := 'partial';
    else
        new.payment_status := 'unpaid';
    end if;

    return new;
end;
$$;

drop trigger if exists tr_sync_sale_payment_status on public.sales;
create trigger tr_sync_sale_payment_status
    before insert or update of amount_paid, total_amount, payment_method on public.sales
    for each row execute function public.sync_sale_payment_status();

comment on function public.sync_sale_payment_status() is 'Keeps sales.payment_status derived from amount_paid/total_amount, and forces non-Credit sales to always be fully paid at write time.';

-- ---------------------------------------------------------------------------
-- debt_payments -- repayment history against a Credit sale. Same lockdown
-- shape as tenant_payments: RLS on, no policies, RPC-only access.
-- ---------------------------------------------------------------------------
create table public.debt_payments (
    id uuid primary key default uuid_generate_v4(),
    sale_id uuid not null references public.sales(id) on delete cascade,
    organization_id uuid not null default public.default_organization_id(),
    amount numeric not null check (amount > 0),
    payment_method text not null check (payment_method in ('Cash', 'Mobile Money', 'Bank')),
    note text,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.debt_payments enable row level security;

comment on table public.debt_payments is 'One row per repayment recorded against a Credit sale. RLS enabled, zero policies -- reachable only via record_debt_payment() (write) and list_debt_payments()/list_outstanding_debts() (read).';

create index debt_payments_sale_id_idx on public.debt_payments(sale_id);
create index debt_payments_organization_id_idx on public.debt_payments(organization_id);

-- ---------------------------------------------------------------------------
-- record_debt_payment -- the only way to pay down a credit sale.
-- ---------------------------------------------------------------------------
create or replace function public.record_debt_payment(
    p_sale_id uuid,
    p_amount numeric,
    p_payment_method text,
    p_note text default null
)
returns table (amount_paid numeric, total_amount numeric, payment_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_sale record;
begin
    if not public.is_role(array['ADMIN'::user_role, 'STAFF'::user_role]) then
        raise exception 'Only staff or an admin can record a debt payment';
    end if;

    if p_amount is null or p_amount <= 0 then
        raise exception 'Payment amount must be greater than zero';
    end if;

    if p_payment_method not in ('Cash', 'Mobile Money', 'Bank') then
        raise exception 'Invalid payment method for a debt repayment';
    end if;

    select s.* into v_sale
    from public.sales s
    where s.id = p_sale_id
      and s.organization_id in (select public.current_org_ids())
    for update;

    if not found then
        raise exception 'Sale not found';
    end if;

    if v_sale.payment_method <> 'Credit' then
        raise exception 'This sale was not made on credit';
    end if;

    if v_sale.amount_paid + p_amount > v_sale.total_amount then
        raise exception 'Payment of % exceeds the outstanding balance of %', p_amount, (v_sale.total_amount - v_sale.amount_paid);
    end if;

    insert into public.debt_payments (sale_id, organization_id, amount, payment_method, note, created_by)
    values (p_sale_id, v_sale.organization_id, p_amount, p_payment_method, nullif(trim(p_note), ''), auth.uid());

    update public.sales s set amount_paid = s.amount_paid + p_amount where s.id = p_sale_id;

    return query select s.amount_paid, s.total_amount, s.payment_status from public.sales s where s.id = p_sale_id;
end;
$$;

revoke all on function public.record_debt_payment(uuid, numeric, text, text) from public;
grant execute on function public.record_debt_payment(uuid, numeric, text, text) to authenticated;
revoke execute on function public.record_debt_payment(uuid, numeric, text, text) from anon;

comment on function public.record_debt_payment(uuid, numeric, text, text) is 'Records a repayment against a Credit sale. Locks the sale row, rejects overpayment, updates amount_paid. Org-scoped ADMIN/STAFF callers only.';

-- ---------------------------------------------------------------------------
-- list_debt_payments -- repayment history for one sale.
-- ---------------------------------------------------------------------------
create or replace function public.list_debt_payments(p_sale_id uuid)
returns table (id uuid, amount numeric, payment_method text, note text, created_by_name text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if not public.is_role(array['ADMIN'::user_role, 'STAFF'::user_role]) then
        raise exception 'Only staff or an admin can view debt payment history';
    end if;

    return query
    select dp.id, dp.amount, dp.payment_method, dp.note, u.name, dp.created_at
    from public.debt_payments dp
    left join public.users u on u.id = dp.created_by
    where dp.sale_id = p_sale_id
      and dp.organization_id in (select public.current_org_ids())
    order by dp.created_at asc;
end;
$$;

revoke all on function public.list_debt_payments(uuid) from public;
grant execute on function public.list_debt_payments(uuid) to authenticated;
revoke execute on function public.list_debt_payments(uuid) from anon;

-- ---------------------------------------------------------------------------
-- list_outstanding_debts -- per-customer rollup of what's owed, for the
-- tenant's Debts view.
-- ---------------------------------------------------------------------------
create or replace function public.list_outstanding_debts()
returns table (
    customer_id uuid,
    customer_name text,
    customer_phone text,
    total_owed numeric,
    open_sale_count bigint,
    oldest_sale_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if not public.is_role(array['ADMIN'::user_role, 'STAFF'::user_role]) then
        raise exception 'Only staff or an admin can view outstanding debts';
    end if;

    return query
    select
        c.id,
        c.name,
        c.phone,
        sum(s.total_amount - s.amount_paid),
        count(*),
        min(s.created_at)
    from public.sales s
    join public.customers c on c.id = s.customer_id
    where s.organization_id in (select public.current_org_ids())
      and s.payment_method = 'Credit'
      and s.payment_status <> 'paid'
    group by c.id, c.name, c.phone
    order by sum(s.total_amount - s.amount_paid) desc;
end;
$$;

revoke all on function public.list_outstanding_debts() from public;
grant execute on function public.list_outstanding_debts() to authenticated;
revoke execute on function public.list_outstanding_debts() from anon;

comment on function public.list_outstanding_debts() is 'Per-customer rollup of unpaid/partial Credit sale balances, for the Debts view. Org-scoped ADMIN/STAFF callers only.';
