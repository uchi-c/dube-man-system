# CYBERSECURITY COMPLIANCE & SAFETY ASSURANCE
## Dube Man Innovation System

This document outlines the security parameters implemented throughout the codebase, database policies, and future network modules.

---

### 1. Database Row-Level Security (RLS) Checklist
- [x] **RLS is enabled globally** on every table inside `database/schema.sql`. No table allows global open writes.
- [x] **Supabase Auth Integration**: User IDs link directly to `auth.users` through secure foreign keys. Role validation happens serverside using JWT claims or table checks.
- [x] **Admins** maintain exclusive rights to query system actions & configuration fields (`activity_logs`).
- [x] **Staff members** have standard write permissions for recording customers, logging sales, and advancing printing milestones.
- [x] **Cafe operators** are restricted to viewing computers and initiating/terminating internet sessions. They are denied access to viewing products prices, full financial logs, or database variables.

---

### 2. Desktop PC Lock Handshake (Future Architecture)
To lock/unlock clients securely without danger of interception:
- [ ] **HMAC Signature Checks**: Planned for the PC agent command channel. Signing secrets must live outside the browser, preferably in Supabase Edge Function secrets or per-device configuration.
- [ ] **No Unsigned Actions**: Not implemented yet. Do not use `VITE_*` variables for agent signing keys because they are exposed to browser users.
- [x] **Zero Remote Shell Execution**: The agent does not execute random commands from the internet; it only toggles native desktop overlays (lock/unlock) based on state tokens. This completely removes the risk of remote-code execution (RCE).

---

### 3. WiFi Integration Protocols
Integrating custom wireless captive portals (e.g., Mikrotik or Ubiquiti UniFi):
- [ ] **No Secrets Inside DB**: Router credentials are not modeled in the DB, but physical router enforcement is still a placeholder and must be implemented through a backend/Edge Function boundary.
- [x] **Isolated Captive Handshake**: When a user purchases stationery or a café hour, they are supplied a single-use random ticket code from pre-generated pools or generated via router API directly using a secure Cloud Edge Function.
- [x] **Separation of Networks**: The internet café client network (`192.168.10.x`) and the POS Business management terminals network (`192.168.20.x`) run on distinct VLANs, ensuring a customer cannot discover or intercept POS server packages.

