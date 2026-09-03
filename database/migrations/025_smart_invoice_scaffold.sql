-- ============================================================================
-- MIGRATION 025: SMART INVOICE (ZRA VSDC) SCAFFOLD
--
-- Foundational tables for ZRA's Smart Invoice/VSDC fiscalisation, built ahead
-- of any tenant actually having real ZRA credentials, so integration testing
-- can start the moment they do. See the VSDC API's own field names (tpin,
-- bhfId, dvcSrlNo, itemClsCd, vatCatCd, cisInvcNo, ...) -- kept verbatim
-- rather than renamed, so payloads built from this data need no translation
-- layer when calling ZRA's saveSales/selectInitInfo endpoints.
--
-- Deliberately NOT wired into the POS sale-completion flow yet -- each org
-- opts in via smart_invoice_settings.is_enabled, and the actual "send to
-- ZRA" action starts out as an explicit per-sale trigger, not automatic on
-- every sale, until this has been proven against ZRA's sandbox with a real
-- TPIN.
--
-- Important real-world fact this schema assumes: ZRA's VSDC is a *local*
-- install (a WAR file the taxpayer deploys on their own server/PC), not a
-- shared cloud API -- vsdc_base_url is per-organization and configurable
-- for exactly that reason. ZRA does host a shared sandbox
-- (https://api-sandbox.zra.org.zm/vsdc-api/v1) for pre-production testing.
-- ============================================================================

create table if not exists public.smart_invoice_settings (
    id                  uuid primary key default gen_random_uuid(),
    organization_id     uuid not null unique references public.organizations(id) on delete cascade,
    environment         text not null default 'sandbox' check (environment in ('sandbox', 'production')),
    tpin                text,
    branch_id           text not null default '000',
    device_serial_no    text,
    vsdc_base_url       text,
    is_enabled          boolean not null default false,
    is_initialized       boolean not null default false,
    last_init_result    jsonb,
    created_at          timestamptz not null default timezone('utc'::text, now()),
    updated_at          timestamptz not null default timezone('utc'::text, now())
);

comment on table public.smart_invoice_settings is 'Per-tenant ZRA Smart Invoice (VSDC) configuration: TPIN, branch/device identifiers ZRA issues after Smart Invoice Taxpayer Portal + VSDC approval, and the VSDC server URL (local install, so this varies per tenant -- see migration header). is_enabled gates whether the Sales flow offers "Submit to ZRA" at all.';

alter table public.smart_invoice_settings enable row level security;

drop policy if exists "Org admins manage smart invoice settings" on public.smart_invoice_settings;
create policy "Org admins manage smart invoice settings" on public.smart_invoice_settings
    for all
    using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN']::public.user_role[]))
    with check (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN']::public.user_role[]));

create index if not exists smart_invoice_settings_organization_id_idx on public.smart_invoice_settings (organization_id);

-- ---------------------------------------------------------------------------
-- Per-product ZRA classification -- required on every saveSales line item.
-- Defaults are safe no-ops until a tenant actually enables Smart Invoice and
-- starts filling these in for their real product catalogue.
-- ---------------------------------------------------------------------------
alter table public.products add column if not exists vat_category_code text not null default 'A';
alter table public.products add column if not exists item_classification_code text;

comment on column public.products.vat_category_code is 'ZRA VAT category code for this item (A=standard-rated 16%%, B=zero-rated, C1-C3/D/E=various exempt/other categories). Defaults to A (standard-rated) until a tenant reviews their catalogue.';
comment on column public.products.item_classification_code is 'ZRA item classification code (UNSPSC-style, e.g. "50202306") required by saveSales. NULL until set -- Smart Invoice submission for a sale containing an unclassified item should be blocked client-side rather than sent with a guessed code.';

-- ---------------------------------------------------------------------------
-- Per-sale ZRA fiscalisation status.
-- ---------------------------------------------------------------------------
alter table public.sales add column if not exists zra_status text not null default 'not_submitted' check (zra_status in ('not_submitted', 'submitted', 'failed'));
alter table public.sales add column if not exists zra_invoice_number text;
alter table public.sales add column if not exists zra_receipt_signature text;
alter table public.sales add column if not exists zra_submitted_at timestamptz;
alter table public.sales add column if not exists zra_error text;

comment on column public.sales.zra_status is 'Whether this sale has been submitted to ZRA Smart Invoice via saveSales. not_submitted is the default for every sale unless/until the org enables Smart Invoice and explicitly submits it.';
comment on column public.sales.zra_invoice_number is 'The rcptNo/invoice reference ZRA''s saveSales response returns once fiscalised -- what a compliant receipt must display.';
comment on column public.sales.zra_receipt_signature is 'The signature/verification data (e.g. intrlData/rcptSgnt) ZRA returns, used to generate the receipt QR code.';
