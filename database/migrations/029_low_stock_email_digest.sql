-- ============================================================================
-- MIGRATION 029: LOW-STOCK EMAIL DIGEST
--
-- Inventory.tsx and Dashboard.tsx already surface low stock in-app (a
-- StockPill badge sorted low-first on Inventory, a warning banner and
-- "Inventory alerts" card on Dashboard, both driven by products.quantity
-- vs products.min_stock_level). That's all passive, though -- it only
-- helps if someone happens to open the app. This adds the missing half:
-- a once-daily email to the org's owner listing everything currently at
-- or under its threshold, the same "cron -> RPC -> edge function ->
-- Resend" shape as the billing emails from migration 024.
--
-- Dedup: organizations.low_stock_digest_sent_for stores the calendar
-- date a digest was last sent, so the daily cron tick only emails once
-- per org per day even though it may find the org still low on stock
-- the next several ticks (there's only one tick a day here, but the
-- same guard as migration 024 in case the schedule is ever tightened).
-- A day with nothing at/under threshold sends nothing and doesn't touch
-- the marker, so the very next day it's low again, it emails fresh.
-- ============================================================================

alter table public.organizations add column if not exists low_stock_digest_sent_for date;

comment on column public.organizations.low_stock_digest_sent_for is 'Calendar date a low-stock digest email was last sent for this org. NULL or a past date means it is still owed today''s digest if it currently has low-stock items.';

-- ---------------------------------------------------------------------------
-- get_pending_low_stock_digests(): one row per org that currently has at
-- least one low-stock product and hasn't been emailed today. service_role
-- only -- reads every tenant's owner email, same as get_pending_billing_emails.
-- ---------------------------------------------------------------------------
create or replace function public.get_pending_low_stock_digests()
returns table (org_id uuid, org_name text, email text, items jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
    return query
    with org_owner as (
        select distinct on (m.org_id) m.org_id, u.email::text as email
        from public.user_organization_memberships m
        join auth.users u on u.id = m.user_id
        order by m.org_id, m.created_at asc
    ),
    low_stock as (
        select
            p.organization_id,
            jsonb_agg(
                jsonb_build_object('name', p.name, 'quantity', p.quantity, 'min_stock_level', p.min_stock_level, 'category', p.category)
                order by p.quantity asc
            ) as items
        from public.products p
        where p.is_active
          and p.min_stock_level <> -1
          and p.quantity <= p.min_stock_level
        group by p.organization_id
    )
    select o.id, o.name, oo.email, ls.items
    from public.organizations o
    join low_stock ls on ls.organization_id = o.id
    join org_owner oo on oo.org_id = o.id
    where o.deleted_at is null
      and (o.low_stock_digest_sent_for is null or o.low_stock_digest_sent_for < current_date)
      and not (
          o.subscription_status = 'suspended'
          or (o.subscription_status = 'trialing' and o.next_payment_due < current_date)
      );
end;
$$;

revoke all on function public.get_pending_low_stock_digests() from public;
grant execute on function public.get_pending_low_stock_digests() to service_role;

comment on function public.get_pending_low_stock_digests() is 'service_role only -- reads every tenant''s owner email and stock levels. Called by the send-low-stock-digest edge function on its daily cron tick.';

-- ---------------------------------------------------------------------------
-- mark_low_stock_digest_sent(): record that today's digest went out.
-- ---------------------------------------------------------------------------
create or replace function public.mark_low_stock_digest_sent(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.organizations set low_stock_digest_sent_for = current_date where id = p_org_id;
end;
$$;

revoke all on function public.mark_low_stock_digest_sent(uuid) from public;
grant execute on function public.mark_low_stock_digest_sent(uuid) to service_role;

comment on function public.mark_low_stock_digest_sent(uuid) is 'service_role only. Called by send-low-stock-digest right after Resend accepts the email, so later ticks the same day do not resend it.';

-- ---------------------------------------------------------------------------
-- Daily cron at 06:00 UTC (~08:00 CAT, a reasonable "start of business day"
-- for Zambia) invoking the edge function via pg_net, same bearer-token
-- shape as migration 024's hourly billing-email cron.
-- ---------------------------------------------------------------------------
select cron.schedule(
    'send-low-stock-digest-daily',
    '0 6 * * *',
    $cron$
    select net.http_post(
        url := 'https://ubchapxkmbvofmymulpi.supabase.co/functions/v1/send-low-stock-digest',
        headers := jsonb_build_object(
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViY2hhcHhrbWJ2b2ZteW11bHBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5OTc4NjksImV4cCI6MjA5OTU3Mzg2OX0.DsVyCkndwnyEIecXpXbajdaCLAHnq52CtcoByrIPkEc',
            'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
    ) as request_id;
    $cron$
);
