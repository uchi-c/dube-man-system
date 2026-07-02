# Dube Man Innovation Business Management System

React + Vite business console for Dube Man General Dealers, backed by Supabase Auth, PostgreSQL, RLS, and Supabase Realtime-ready tables.

## Modules

- Authentication and role-gated navigation
- Dashboard and operational KPIs
- Inventory and stock adjustments
- Sales / POS ledger
- Customer registry
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
3. Apply `database/schema.sql` in the Supabase SQL editor for a fresh project.
4. Run the app:
   ```bash
   npm run dev
   ```

## Verification

```bash
npm run lint
npm run build
```

Secrets for PC agents, router credentials, service-role operations, and HMAC signing must not use `VITE_*` variables. Keep them in backend, Edge Function, or per-device secure configuration.
