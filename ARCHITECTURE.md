# URUU OS - Dube Man System Architecture

## Phase 1: Device Abstraction & Print Management Module

### Why This Architecture?

**Customer Request:** Owner cannot track paper consumption, printing revenue, employee accountability, printing waste, and printer utilization.

**Business Problem:** No visibility into printing costs and operational efficiency.

**Solution:** Implement Device Abstraction layer to support printers, scanners, and other business devices as first-class entities (not just PCs).

---

## 1. Device Abstraction Layer

### 1.1 Core Concept

Instead of separate tables for `computers`, `printers`, `scanners`, create a unified `devices` table with type classification:

```
devices
├── Device Type: COMPUTER (existing cafe PCs)
├── Device Type: PRINTER (receipt, laser, inkjet, label)
├── Device Type: SCANNER (document scanning)
├── Device Type: POS (point-of-sale terminals)
├── Device Type: ROUTER (network devices)
├── Device Type: BIOMETRIC (future expansion)
└── Device Type: CAMERA (future expansion)
```

### 1.2 Database Schema Changes

**NEW TABLES:**

1. `device_types` — catalog of device types (COMPUTER, PRINTER, SCANNER, etc.)
2. `devices` — unified device registry with `organization_id` for multi-tenancy
3. `computer_attributes` — specific columns for PCs (CPU, RAM, disk, rate_per_minute)
4. `printer_attributes` — specific columns for printers (toner level, page count, cost per page)
5. `paper_inventory` — organization-wide paper stock tracking
6. `print_jobs` — every print job logged with pages, cost, revenue, employee, customer
7. `print_analytics` — daily materialized view of printing metrics per device/employee/customer
8. `organizations` — for multi-tenant isolation

**MIGRATION PATH:**

- `computers` table → migrate to `devices` with type COMPUTER
- All existing cafe sessions continue to reference `device_id` (via computers → devices join)
- New printers added as `devices` with type PRINTER
- PC Agent reads/writes to unified `devices` table

---

## 2. Print Management Module

### 2.1 Core Features (MVP = "Must Have")

#### A. Print Job Monitoring
- Every print job creates a record in `print_jobs`
- Fields: pages (total, B&W, color), paper size, duplex, cost, revenue, device, employee, customer
- Status: QUEUED → PRINTING → COMPLETED (or ERROR/CANCELLED)

#### B. Paper Consumption Tracking
- `paper_inventory` tracks paper stock by type (A4, A3, Label, Receipt)
- Paper deducted when print job completes
- Automatic reorder alerts when stock < threshold

#### C. Cost Per Page Calculation
- B&W: (toner_cost + paper_cost) / pages
- Color: (toner_cost × 3 + paper_cost) / pages
- Stored in `printer_attributes.cost_per_page_bw` and `cost_per_page_color`

#### D. Revenue Tracking
- Revenue charged per job (may differ from cost)
- Enables profit margin analysis per printer

#### E. Print Analytics Dashboard
- Pages printed today / this week / this month
- B&W vs Color breakdown
- Cost per page
- Revenue per device
- Top printer, top employee, top customer
- Paper remaining estimate

#### F. Device Health Monitoring
- Toner level warnings
- Offline detection (heartbeat)
- Page count trending
- Error rate by device

---

## 3. URUU Agent Evolution

### 3.1 From PC Agent → Business Device Agent

**Current State (Python PC Agent):**
- Monitors single PC
- Sends: heartbeat, metrics (CPU, RAM, disk)
- Receives: commands from dashboard
- Manages: cafe sessions

**New State (Business Device Agent):**
- Monitors any business device type
- PC Agent: heartbeat, metrics, session management
- Printer Agent: page count, toner level, error logs, print queue
- Scanner Agent: scan count, error logs
- Router Agent: device discovery, network metrics
- Future: POS terminal, biometric device agents

### 3.2 Agent Capabilities (Phase 1)

**For Computers:**
- Heartbeat (every 30s)
- System metrics (CPU, RAM, disk)
- Session management (start/stop cafe session)
- Remote commands (lock, restart, shutdown)

**For Printers:**
- Page count polling (every 5 min)
- Toner level (SNMPv3 if available, else manual input)
- Print queue monitoring
- Error log capture (paper jam, offline, etc.)
- Paper type detection (via metadata or manual config)

**For All Devices:**
- Device registration (automatic or manual)
- Status updates (Available, Occupied, Maintenance, Offline)
- Health monitoring (uptime, error rate)
- Automatic organization_id assignment via agent auth token

### 3.3 Agent Architecture

```
URUU Agent (Python)
├── heartbeat.py → Device.last_seen (periodic)
├── device_registry.py → Auto-register on first startup
├── command_handler.py → Process remote commands from dashboard
├── device_monitor.py → Poll device-specific metrics
│   ├── computer_monitor.py → CPU, RAM, disk, sessions
│   ├── printer_monitor.py → Page count, toner, error log
│   ├── scanner_monitor.py → Scan count, error log
│   └── router_monitor.py → Device discovery, metrics
├── cache.py → Local cache of metrics (redundancy)
├── logger.py → Send logs to dashboard
└── realtime_service.py → Supabase Realtime for instant updates
```

---

## 4. Multi-Tenancy Architecture

### 4.1 Multi-Org Isolation

**Every table (except users, auth) has `organization_id`:**

```
organizations
├── devices.organization_id
├── print_jobs.organization_id
├── paper_inventory.organization_id
├── print_analytics.organization_id
├── devices.organization_id
└── (all future modules)
```

**Row-Level Security (RLS) Rules:**

```sql
-- Example for print_jobs
CREATE POLICY "Organizations see own print jobs"
ON public.print_jobs
FOR SELECT
USING (
  organization_id IN (
    SELECT org_id FROM user_organization_memberships 
    WHERE user_id = auth.uid()
  )
);
```

**Agent Auth:**
- Agent token includes `organization_id`
- Agent can only write to its own organization
- Dashboard filters all queries by current user's organization

---

## 5. Dashboard UI Changes

### 5.1 New Print Management Dashboard

**Header Metrics:**
```
Pages Printed Today: 342
├─ B&W: 250 pages
├─ Color: 92 pages
├─ Paper Used: ~12 sheets (estimate)
└─ Estimated Cost: $8.50

Revenue: $42.50 (profit: $34.00)
Printers: 3 (2 online, 1 offline)
```

**Main Content:**
```
[Printer Status Grid]
├─ HP LaserJet Pro M404n
│  ├─ Status: Online | Toner: 75% | Pages Today: 145
│  └─ Cost/Page: $0.025 | Revenue: $18.50
├─ Brother DCP-L8410CDW
│  ├─ Status: Online | Toner: 32% | Pages Today: 157
│  └─ Cost/Page: $0.032 | Revenue: $21.00
└─ Ricoh MP C3004 (color)
   ├─ Status: Offline | Toner: 14% | Pages Today: 40
   └─ Cost/Page: $0.085 | Revenue: $3.00

[Analytics Tab]
├─ Daily Chart: Pages printed (B&W vs Color)
├─ Top Employee: John (87 pages)
├─ Top Customer: ABC Trading (120 pages)
└─ Paper Remaining: A4 (2000 sheets) — reorder in 5 days

[Alerts]
├─ ⚠️ Ricoh offline for 2 hours
├─ ⚠️ HP toner at 75% (reorder recommended)
└─ ⚠️ A4 paper at 2000 sheets (reorder level: 1500)
```

### 5.2 Existing Pages Affected

**Modified Pages:**
- Dashboard → Add print metrics card
- Inventory → Add paper inventory management
- Activity Logs → Include print job logs

**New Pages:**
- Print Management → Main printing dashboard
- Devices → Unified device registry (future: includes all device types)

---

## 6. Implementation Roadmap (Sequenced)

### Step 1: Database Schema Refactor (SQL)
- Create device abstraction tables
- Migrate existing computers → devices
- Add print job tracking tables
- Create RLS policies for multi-tenancy

### Step 2: Backend Types & Services (TypeScript)
- Add device types to src/types.ts
- Create src/services/devices.ts (CRUD operations)
- Create src/services/print.ts (print job and analytics)
- Create src/services/paper.ts (inventory management)

### Step 3: Print Management Dashboard UI (React)
- Create src/pages/PrintManagement.tsx
- Add print metrics card to Dashboard
- Create device status grid component
- Add paper inventory tracker to Inventory page

### Step 4: URUU Agent Evolution (Python)
- Refactor pc-agent to accept device_type parameter
- Add device_registry.py (device-agnostic registration)
- Add device_monitor.py (polymorphic metric collection)
- Add printer_monitor.py (page count, toner, error logs)
- Update database.py to use unified devices table

### Step 5: Product Feedback Engine & Roadmap (Meta)
- Create customer_feedback table
- Create roadmap_items table (Must/Should/Could/Future classification)
- Add feedback UI to dashboard
- Publish roadmap to customers

---

## 7. Success Metrics (60-second value demo)

**Before:** "We don't know how much paper we use or who printed what."

**After (60 seconds):**
1. Open Print Management dashboard
2. See: "342 pages printed today" + "12 sheets of paper consumed"
3. See: "Printer utilization: HP (89%), Brother (92%), Ricoh (65%)"
4. See: "Revenue: $42.50, Cost: $8.50, Profit: $34.00"
5. See: "Paper remaining: 2000 sheets, reorder in 5 days"
6. See: "Top customer: ABC Trading (120 pages), Top employee: John (87 pages)"

**Customer validates:** "I can NOW track paper, cost, revenue, waste, and accountability. ✓"

---

## 8. Technical Dependencies

- **Database:** PostgreSQL (Supabase)
- **Frontend:** React 19, TypeScript 5.8, Tailwind CSS, Recharts
- **Backend:** Supabase Auth (RLS via organization_id), Supabase Realtime
- **Agent:** Python 3.10+, Supabase client, device discovery libraries (SNMP for printers)
- **Metrics:** Recharts (existing), PostgreSQL aggregations

---

## 9. File Structure (After All 5 Steps)

```
src/
├── pages/
│   ├── PrintManagement.tsx          [NEW - Step 3]
│   └── Devices.tsx                  [NEW - Future Step 6]
├── components/
│   ├── PrintMetricsCard.tsx         [NEW - Step 3]
│   ├── PrinterStatusGrid.tsx        [NEW - Step 3]
│   ├── PaperInventoryTracker.tsx    [NEW - Step 3]
│   └── DeviceHealthMonitor.tsx      [NEW - Step 3]
├── services/
│   ├── devices.ts                   [NEW - Step 2]
│   ├── print.ts                     [NEW - Step 2]
│   ├── paper.ts                     [NEW - Step 2]
│   └── supabase.ts                  [EXISTING]
├── types.ts                         [UPDATED - Step 2]
└── ...

database/
├── schema.sql                       [UPDATED - Step 1]
├── migrations/
│   ├── 001_device_abstraction.sql   [NEW - Step 1]
│   ├── 002_print_jobs.sql           [NEW - Step 1]
│   └── 003_multi_tenancy.sql        [NEW - Step 1]
└── ...

pc-agent/
├── device_monitor.py                [NEW - Step 4]
├── device_registry.py               [NEW - Step 4]
├── printer_monitor.py               [NEW - Step 4]
├── computer_monitor.py              [NEW - Step 4]
├── database.py                      [REFACTORED - Step 4]
└── ...
```

---

## 10. Risk Mitigation

**Risk:** Existing cafe_sessions references computers.id
**Mitigation:** Create view `computers_view` that joins devices → computer_attributes for backward compatibility

**Risk:** Agent downtime breaks print tracking
**Mitigation:** Queue print jobs locally, sync when agent reconnects

**Risk:** Paper inventory gets out of sync
**Mitigation:** Manual reconciliation UI + audit trail of all paper transactions

**Risk:** Multi-tenancy leaks data
**Mitigation:** All RLS policies tested, all queries parameterized by organization_id

---

END OF ARCHITECTURE DOCUMENT
