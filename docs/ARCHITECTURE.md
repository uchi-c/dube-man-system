# SYSTEM TECHNICAL ARCHITECTURE
## Dube Man Innovation - Business Management System

This document outlines the architectural flow, modularity, and database mapping rules of the Dube Man Innovation System MVP.

---

### 1. High-Level System Architecture

The Dube Man Innovation System is structured as a modern **full-stack decoupled system** utilizing React + Supabase (PostgreSQL with integrated RLS) to handle five business processes in a single integrated console:

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
4. **Printing & Custom Branding Module**: Coordinates designer milestones (Designing -> Printing -> Completed -> Collected) with a payment tracker to collect deposit balances.
5. **Internet Café Control Desk**: Manages terminal allocation, tracks sessions, computes accurate user billing automatically according to customized hourly rates, and signals hardware agents.
6. **WiFi Handover Provisioning**: Provides tracking logs for client bandwidth, maintaining high database security by isolating external router tokens from standard business accounts.

---

### 3. Role-Based Access Control (RBAC) Matrix

We strictly partition pages based on the verified role metadata:

| Feature / Resource | ADMIN | STAFF | CAFE_OPERATOR |
|---|---|---|---|
| Core Profit Overview | ✅ Read | ❌ No Access | ❌ No Access |
| Log Stock In / Custom Sales | ✅ Write | ✅ Write | ❌ No Access |
| Manage Base Products | ✅ Write | ✅ Write | ❌ No Access |
| Manage Printing Workflows | ✅ Write | ✅ Write | ❌ No Access |
| Manage Café Sessions | ✅ Write | ✅ Write | ✅ Write |
| View System Audit Logs | ✅ Read | ❌ No Access | ❌ No Access |
| Manage System Variables | ✅ Write | ❌ No Access | ❌ No Access |
