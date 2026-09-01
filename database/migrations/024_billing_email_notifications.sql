-- ============================================================================
-- MIGRATION 024: AUTOMATED BILLING EMAILS (TRIAL DUE SOON, LOCKED, PAYMENT
-- RECEIVED)
--
-- Sends a tenant's owner an email at the same three moments
-- BillingNotificationBanner already surfaces in-app (src/components/
-- BillingNotificationBanner.tsx): trial due within 3 days, access locked
-- (trial expired past next_payment_due, or admin-suspended), and a payment
-- just recorded. Mirrors is_org_locked()'s exact condition (migration 016/
-- 019) so the email and the in-app banner never disagree about what
-- "locked" means.
--
-- Delivery itself lives in a new edge function (send-billing-emails) that
-- calls Resend, invoked hourly by pg_cron via pg_net -- both functions below
-- are service_role-only (never callable by an authenticated tenant user)
-- since they read every org's owner email across all tenants, which no
-- ordinary RLS-scoped RPC in this codebase is allowed to do.
--
-- Dedup: each condition gets its own "already sent" marker so the hourly
-- cron doesn't re-email the same event every run:
--   - trial_reminder_sent_for stores the next_payment_due a reminder was
--     already sent for; a due-date change (i.e. after paying) naturally
--     makes it stale again.
--   - locked_notice_sent_at is cleared the moment an org stops being
--     locked, so a later lock (e.g. a second missed trial after re-signup,
--     or admin suspending an active tenant) sends a fresh notice.
--   - confirmation_sent_at is per payment row -- backfilled to created_at
--     for the two payments that already existed before this migration, so
--     deploying this doesn't retroactively email tenants for old payments.
-- ============================================================================

alter table public.organizations add column if not exists trial_reminder_sent_for date;
alter table public.organizations add column if not exists locked_notice_sent_at timestamptz;
alter table public.tenant_payments add column if not exists confirmation_sent_at timestamptz;

comment on column public.organizations.trial_reminder_sent_for is 'The next_payment_due value a trial-due-soon email was already sent for. NULL or stale (different from the current next_payment_due) means the org is still owed a reminder.';
comment on column public.organizations.locked_notice_sent_at is 'When a "your access is locked" email was last sent. Cleared automatically once the org is no longer locked (see get_pending_billing_emails), so the next lock sends fresh.';
comment on column public.tenant_payments.confirmation_sent_at is 'When a payment-received email was sent for this row. Backfilled to created_at for pre-existing rows so this feature does not retroactively email old payments.';

update public.tenant_payments set confirmation_sent_at = created_at where confirmation_sent_at is null;

-- ---------------------------------------------------------------------------
-- get_pending_billing_emails(): everything the cron-invoked edge function
-- needs to send this run, one row per (org or payment) x notification kind.
-- Owner = the org's earliest member (the only member for a self-service
-- signup; the same "who do we treat as the owner" convention this codebase
-- has no explicit role column for elsewhere).
-- ---------------------------------------------------------------------------
create or replace function public.get_pending_billing_emails()
returns table (
    kind text,
    org_id uuid,
    org_name text,
    email text,
    currency text,
    amount numeric,
    due_date date,
    payment_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Self-heal: an org that is no longer locked forgets its old notice, so
    -- a future lock (new trial, or admin re-suspending) emails again.
    update public.organizations o
    set locked_notice_sent_at = null
    where o.deleted_at is null
      and o.locked_notice_sent_at is not null
      and not (
          o.subscription_status = 'suspended'
          or (o.subscription_status = 'trialing' and o.next_payment_due < current_date)
      );

    return query
    with org_owner as (
        select distinct on (m.org_id) m.org_id, u.email::text as email
        from public.user_organization_memberships m
        join auth.users u on u.id = m.user_id
        order by m.org_id, m.created_at asc
    )
    select 'trial_due_soon'::text, o.id, o.name, oo.email, o.currency, null::numeric, o.next_payment_due, null::uuid
    from public.organizations o
    join org_owner oo on oo.org_id = o.id
    where o.deleted_at is null
      and o.subscription_status = 'trialing'
      and o.next_payment_due is not null
      and o.next_payment_due between current_date and current_date + 3
      and (o.trial_reminder_sent_for is null or o.trial_reminder_sent_for <> o.next_payment_due)

    union all
    select 'locked'::text, o.id, o.name, oo.email, o.currency, null::numeric, o.next_payment_due, null::uuid
    from public.organizations o
    join org_owner oo on oo.org_id = o.id
    where o.deleted_at is null
      and o.locked_notice_sent_at is null
      and (
          o.subscription_status = 'suspended'
          or (o.subscription_status = 'trialing' and o.next_payment_due < current_date)
      )

    union all
    select 'payment_confirmation'::text, o.id, o.name, oo.email, p.currency, p.amount, null::date, p.id
    from public.tenant_payments p
    join public.organizations o on o.id = p.org_id
    join org_owner oo on oo.org_id = o.id
    where p.confirmation_sent_at is null
      and o.deleted_at is null;
end;
$$;

revoke all on function public.get_pending_billing_emails() from public;
grant execute on function public.get_pending_billing_emails() to service_role;

comment on function public.get_pending_billing_emails() is 'service_role only -- reads every tenant''s owner email, so no authenticated/anon grant. Called by the send-billing-emails edge function on its hourly cron tick.';

-- ---------------------------------------------------------------------------
-- mark_billing_email_sent(): record that one row from the above was sent.
-- ---------------------------------------------------------------------------
create or replace function public.mark_billing_email_sent(
    p_kind text,
    p_org_id uuid,
    p_payment_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_kind = 'trial_due_soon' then
        update public.organizations set trial_reminder_sent_for = next_payment_due where id = p_org_id;
    elsif p_kind = 'locked' then
        update public.organizations set locked_notice_sent_at = timezone('utc'::text, now()) where id = p_org_id;
    elsif p_kind = 'payment_confirmation' then
        update public.tenant_payments set confirmation_sent_at = timezone('utc'::text, now()) where id = p_payment_id;
    else
        raise exception 'Unknown billing email kind: %', p_kind;
    end if;
end;
$$;

revoke all on function public.mark_billing_email_sent(text, uuid, uuid) from public;
grant execute on function public.mark_billing_email_sent(text, uuid, uuid) to service_role;

comment on function public.mark_billing_email_sent(text, uuid, uuid) is 'service_role only. Called by send-billing-emails right after Resend accepts one email, so a later cron tick does not resend it.';

-- ---------------------------------------------------------------------------
-- Hourly cron: invoke the edge function via pg_net. The bearer token here
-- is the project's anon key -- already public (shipped in the client
-- bundle) -- used only to pass the function gateway's JWT check; the
-- function itself authorizes its actual work with its own service-role key
-- from its runtime environment, not from this request.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
    'send-billing-emails-hourly',
    '0 * * * *',
    $cron$
    select net.http_post(
        url := 'https://ubchapxkmbvofmymulpi.supabase.co/functions/v1/send-billing-emails',
        headers := jsonb_build_object(
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViY2hhcHhrbWJ2b2ZteW11bHBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5OTc4NjksImV4cCI6MjA5OTU3Mzg2OX0.DsVyCkndwnyEIecXpXbajdaCLAHnq52CtcoByrIPkEc',
            'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
    ) as request_id;
    $cron$
);
