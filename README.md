# Dube Man Innovation Business Management System

React + Vite business console for Dube Man General Dealers, backed by Supabase Auth, PostgreSQL, RLS, and Supabase Realtime-ready tables. Multi-tenant: every table is scoped to an `organization_id` and isolated by row-level security, so one Supabase project can safely host several independent businesses.

**Live:** https://dube-man-system-two.vercel.app

## Modules

- Multi-tenant organizations with row-level-security isolation per tenant
- Authentication and role-gated navigation
- Dashboard and operational KPIs
- Inventory and stock adjustments
- Sales / POS ledger
- Customer registry
- Pharmacy: medicine catalog, batch/lot expiry tracking, prescriptions, dispensing ledger
- Printing and branding orders
- Internet cafe workstation sessions
- WiFi voucher/session management foundation
- PC agent heartbeat prototype foundation
- Security activity logs

## Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and set:
   ```bash
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-or-publishable-key
   ```
3. Apply, in order, in the Supabase SQL editor for a fresh project:
   `database/schema.sql` → `database/print_schema.sql` → `database/agent_schema.sql` →
   `database/migrations/001_multi_tenancy.sql` → `database/migrations/002_pharmacy_module.sql`.
   See `docs/SUPABASE-SETUP.md` for the full runbook.
4. Run the app:
   ```bash
   npm run dev
   ```

## Verification

```bash
npm run lint
npm run build
npm run test
```

Secrets for PC agents, router credentials, service-role operations, and HMAC signing must not use `VITE_*` variables. Keep them in backend, Edge Function, or per-device secure configuration.

## Deploying to production

See **`docs/DEPLOYMENT.md`** for the full guide: Vercel deployment, PC agent
setup/install for café workstations, onboarding additional tenants (and how
many a project can hold), and removing demo seed data before going live.
