-- ============================================================================
-- MIGRATION 035: FLUTTERWAVE MOBILE MONEY PUSH-CHARGE TRACKING
--
-- Adds columns so a 'Mobile Money' sale can optionally be followed up with
-- a real push-payment request to the customer's phone (via Flutterwave),
-- and the outcome tracked -- separate from and never overriding the
-- existing sales.payment_status/amount_paid semantics.
--
-- Deliberately does NOT touch sync_sale_payment_status() or the existing
-- "Mobile Money sales are always fully paid at write time" behavior --
-- that trigger is depended on by every sale in the system, tested, and
-- live. A 'Mobile Money' sale created today already means "the cashier is
-- recording that the customer paid via mobile money" (manual, trust-based,
-- same as Cash/Bank); flw_charge_status below is purely metadata about
-- whether an actual Flutterwave push-request was sent for this sale and
-- what happened to it -- useful for the cashier/owner to know whether the
-- customer actually completed the prompt, without changing what counts as
-- "paid" in the ledger.
-- ============================================================================

alter table public.sales add column if not exists flw_tx_ref text;
alter table public.sales add column if not exists flw_transaction_id text;
alter table public.sales add column if not exists flw_charge_status text check (flw_charge_status in ('pending', 'successful', 'failed') or flw_charge_status is null);
alter table public.sales add column if not exists flw_initiated_at timestamptz;

comment on column public.sales.flw_tx_ref is 'Our own reference sent to Flutterwave for a mobile money push-charge on this sale (set by the flutterwave-charge edge function). NULL if no push-charge was ever requested for this sale.';
comment on column public.sales.flw_transaction_id is 'Flutterwave''s own transaction ID, set once the webhook confirms the charge (success or failure).';
comment on column public.sales.flw_charge_status is 'Status of the Flutterwave push-charge request itself -- NOT the same as payment_status/amount_paid, which already reflect the sale as paid the moment it''s recorded (see header comment). pending = prompt sent, waiting on the customer; successful/failed = webhook confirmed the outcome.';
comment on column public.sales.flw_initiated_at is 'When the push-charge request was sent to Flutterwave.';

create unique index if not exists sales_flw_tx_ref_idx on public.sales (flw_tx_ref) where flw_tx_ref is not null;
