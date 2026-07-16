# SYSTEM TECHNICAL ARCHITECTURE
## Uruu OS - Business Management System

This document outlines the architectural flow, modularity, and database mapping rules of the Uruu OS MVP.

---

### 1. High-Level System Architecture

The Uruu OS is structured as a modern **full-stack decoupled system** utilizing React + Supabase (PostgreSQL with integrated RLS) to handle five business processes in a single integrated console:

```
                            +-------------------------------------------+
                            |                Frontend                   |
                            |       (React, Tailwind, Vite, TS)        |
                            +--------------------+----------------------+
                                                 |
                                                 | Secure Client Connection via TLS
                                                 v
                            +--------------------+----------------------+
                            |         Supabase Backend Platform         |
                            |   - Supabase Auth (Identity & JWT)        |
                            |   - PostgreSQL (RLS & Stock Triggers)    |
                            |   - Realtime Subscriptions (PC Heartbeat) |
                            +--------------------+----------------------+
                                                 |
                                                 | Secure Local IPC Handshake
                                                 v
                            +-------------------------------------------+
                            |             Local PC Agent                |
                            |      (Win32/Linux Locking Client)         |
                            +-------------------------------------------+
```

---

### 2. Core Functional Modules

The application is built of distinct modules designed to maintain isolated contexts while synchronizing stats in real-time:

1. **Dashboard & Analytics Module**: Distills live sales, active internet sessions, printing backlogs, and warning indicators into a real-time responsive command center.
2. **Point of Sale (POS) Module**: Standardizes barcode searches, multi-item cart selections, stock validation, payment methods (Cash, Mobile Money, Bank Account), and automatically emits inventory transactions.
3. **Inventory Management Module**: Alerts operators on low stock levels, regulates Stock-In and Stock-Out processes with complete auditing details.
4. **Pharmacy Module**: Medicine catalog with dosage form/strength/pricing, batch-and-lot stock with expiry dates (FEFO dispensing), prescriptions with per-item fulfillment tracking, and an append-only dispensing ledger. See `database/migrations/002_pharmacy_module.sql`.
5. **Printing & Custom Branding Module**: Coordinates designer milestones (Designing -> Printing -> Completed -> Collected) with a payment tracker to collect deposit balances.
6. **Internet Café Control Desk**: Manages terminal allocation, tracks sessions, computes accurate user billing automatically according to customized hourly rates, and signals hardware agents.
7. **WiFi Handover Provisioning**: Provides tracking logs for client bandwidth, maintaining high database security by isolating external router tokens from standard business accounts.

---

### 3. Multi-Tenancy

Every business table carries an `organization_id` foreign key into `public.organizations`, and every RLS policy filters on `organization_id in (select public.current_org_ids())` — the set of organizations the signed-in user belongs to via `public.user_organization_memberships`. See `database/migrations/001_multi_tenancy.sql`.

- **One Supabase project, many tenants.** A single deployment can host several independent businesses with hard data isolation enforced at the database layer, not just in application code.
- **Frontend org context**: `src/services/organizations.ts` resolves the caller's `organization_id` (cached per session) and every insert in `src/services/supabase.ts` / `src/services/pharmacy.ts` stamps it explicitly.
- **Backward-compatible default**: columns default to `public.default_organization_id()`, which auto-creates/reuses a single "Default Organization" for anything that omits the column — this keeps the common single-tenant deployment (and the anon-key pc-agent, which has no organization context) working unmodified.
- **Trust model**: the `ADMIN` role is platform-wide within a Supabase project (it can see all organizations in that project), not scoped per-tenant. This app targets an owner-operator provisioning their own project — not a multi-tenant SaaS marketplace with mutually-untrusted tenant admins. For that stronger model, `ADMIN`-level policies would need their own `organization_id` scoping too.
- Two deployment models coexist: **shared multi-tenant** (this migration; many orgs, one database) and **silo-per-tenant** (`scripts/provision-tenant/`; one Supabase project per client). Pick whichever isolation guarantee a client needs.
- **Self-service tenant signup**: `public.signup_new_organization()` (`database/migrations/003_organization_signup.sql`) lets a brand-new Supabase Auth user create their own organization and become its `ADMIN` in one transaction, from the app's Signup page. It's `SECURITY DEFINER` because a signing-up user isn't an `ADMIN` of anything yet — but it's scoped tightly to `auth.uid()`, so it can only ever act on the calling account, and it refuses to run a second time for an account that already has a profile.

---

### 4. Role-Based Access Control (RBAC) Matrix

We strictly partition pages based on the verified role metadata:

| Feature / Resource | ADMIN | STAFF | CAFE_OPERATOR |
|---|---|---|---|
| Core Profit Overview | ✅ Read | ❌ No Access | ❌ No Access |
| Log Stock In / Custom Sales | ✅ Write | ✅ Write | ❌ No Access |
| Manage Base Products | ✅ Write | ✅ Write | ❌ No Access |
| Manage Pharmacy Catalog & Stock | ✅ Write | ✅ Write | ❌ No Access |
| Dispense Medicine | ✅ Write | ✅ Write | ❌ No Access |
| Manage Printing Workflows | ✅ Write | ✅ Write | ❌ No Access |
| Manage Café Sessions | ✅ Write | ✅ Write | ✅ Write |
| View System Audit Logs | ✅ Read | ❌ No Access | ❌ No Access |
| Manage System Variables | ✅ Write | ❌ No Access | ❌ No Access |
| Manage Organizations | ✅ Write | ❌ No Access | ❌ No Access |
