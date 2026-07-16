# WiFi Control & Usage Management System (Module 2)

Welcome to the **WiFi Control & Usage Management System** for **Uruu OS**. This advanced module coordinates prepaid internet vouchers with physical MAC address allocations, logging dynamic connections, and preparing the dashboard for future physical gateway router APIs (e.g. Mikrotik, Cisco, TP-Link).

---

## 1. System Architecture Flow

The system runs on a **Full-Stack Hybrid Architecture** integrating a React-Vite client, a Supabase Cloud database with Real-time synchronization support, and a secure local storage fallback simulator.

```
+-------------------------------------+
|         React-Vite Client           | <---- [Supabase Realtime WebSockets]
|  (Voucher Form, MAC validation,     |       Synchronizes dashboard timers
|   Live Session Cards, Live Charts)   |       and logs instantly on changes.
+-------------------------------------+
                 |
                 v [Service Layer API calls]
+-------------------------------------+
|        Supabase Service API         |
|  (IsOLates credentials, handles RLS,|
|   safely manages auth sessions)     |
+-------------------------------------+
                 |
                 v
+-------------------------------------+
|        Supabase Cloud Tables        | <---- [Physical Gateway Switches]
| (wifi_customers, wifi_packages,     |       Future hardware API bindings
|  wifi_sessions, wifi_usage_logs,    |       trigger firewall queues.
|  router_settings)                   |
+-------------------------------------+
```

---

## 2. Implemented Features

1. **Prepaid Access Voucher Form**: Capture guest name, phone, device name, and physical MAC address. Features robust regex validation for standard hardware physical addresses.
2. **Dynamic Live Session Timers**: Active voucher cards contain client-side countdown clocks calculating `remaining_time = package duration - elapsed duration` with reactive percent progress indicators.
3. **Automated Expiration Handlers**: When a voucher clock hits zero, an automatic background trigger updates the `wifi_sessions` database status to `EXPIRED` and dispatches disconnect signals.
4. **Hardware Device Registry & MACs**: Searchable table organizing connected network cards, status badges, and device brand categories (Apple, Samsung, Huawei, PC).
5. **Gateway Router Integration panel**: Handshake panel for administrative users to test connection routes and bind firewall policies.
6. **Live Financial Analytics**: Gorgeous `recharts` graphs calculating daily WiFi income streams and package allocation counts.
7. **Role-Based Access Control**:
   - **STAFF / CAFE_OPERATOR**: Can issue vouchers, search MACs, monitor connections, and view charts.
   - **ADMIN**: Holds exclusive access to configure Router settings, create plans, and write hardware policies.

---

## 3. Supabase SQL Schema Migrations

Run the following SQL inside your **Supabase SQL Editor** to bootstrap the required relational structures and Row Level Security (RLS) rules:

```sql
-- ========================================================
-- 1. WIFI CUSTOMERS TABLE (Physical Hardware Address mapping)
-- ========================================================
CREATE TABLE IF NOT EXISTS public.wifi_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    device_name TEXT NOT NULL,
    mac_address TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.wifi_customers ENABLE ROW LEVEL SECURITY;

-- Create policies (Allows read/write for authenticated console operators)
CREATE POLICY "Enable all operations for authenticated staff" ON public.wifi_customers
    FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ========================================================
-- 2. WIFI PACKAGES TABLE (Prepaid rate plans)
-- ========================================================
CREATE TABLE IF NOT EXISTS public.wifi_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.wifi_packages ENABLE ROW LEVEL SECURITY;

-- Create Policies (Read for staff, Write for Admin only)
CREATE POLICY "Enable read access for authenticated staff" ON public.wifi_packages
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable administrative write access" ON public.wifi_packages
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE public.users.id = auth.uid() AND public.users.role = 'ADMIN'
        )
    );


-- ========================================================
-- 3. WIFI SESSIONS TABLE (Active network allocations)
-- ========================================================
CREATE TABLE IF NOT EXISTS public.wifi_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.wifi_customers(id) ON DELETE CASCADE,
    package_id UUID REFERENCES public.wifi_packages(id) ON DELETE RESTRICT,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INTEGER NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.wifi_sessions ENABLE ROW LEVEL SECURITY;

-- Create Policies
CREATE POLICY "Enable all access for authenticated staff" ON public.wifi_sessions
    FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ========================================================
-- 4. WIFI USAGE LOGS TABLE (Network audit trails)
-- ========================================================
CREATE TABLE IF NOT EXISTS public.wifi_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.wifi_customers(id) ON DELETE CASCADE,
    device_name TEXT NOT NULL,
    mac_address TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('CONNECTED', 'DISCONNECTED', 'EXPIRED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.wifi_usage_logs ENABLE ROW LEVEL SECURITY;

-- Create Policies
CREATE POLICY "Enable all access for authenticated staff" ON public.wifi_usage_logs
    FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ========================================================
-- 5. ROUTER SETTINGS TABLE (Gateway bindings)
-- ========================================================
CREATE TABLE IF NOT EXISTS public.router_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    router_name TEXT NOT NULL,
    router_brand TEXT NOT NULL,
    router_model TEXT NOT NULL,
    integration_type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.router_settings ENABLE ROW LEVEL SECURITY;

-- Create Policies
CREATE POLICY "Enable read for authenticated staff" ON public.router_settings
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable write for admin only" ON public.router_settings
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE public.users.id = auth.uid() AND public.users.role = 'ADMIN'
        )
    );


-- ========================================================
-- 6. INITIAL SEEDS (Default WiFi Packages)
-- ========================================================
INSERT INTO public.wifi_packages (name, duration_minutes, price) VALUES
('30 Minutes Spark', 30, 350.00),
('60 Minutes Pro', 60, 600.00),
('120 Minutes Extreme', 120, 1100.00),
('240 Minutes Enterprise', 240, 2000.00)
ON CONFLICT DO NOTHING;
```

---

## 4. Hardware Configuration & Future Router Integration

This system is completely future-proofed for physical local setups. When a WiFi session is created or terminated, `src/services/routerService.ts` executes placeholders ready for network API connections:

### Integrating with a Mikrotik Router
To directly control client traffic, replace the placeholders in `routerService.ts` using Mikrotik's Hotspot or Firewall API:
1. Ensure the Mikrotik's REST API is enabled (`/ip service set api-ssl disabled=no`).
2. When a session starts, call the RouterOS endpoint to authorize the MAC address:
   ```javascript
   await fetch(`https://${routerIP}/rest/ip/hotspot/active/login`, {
     method: 'POST',
     headers: { 'Authorization': `Basic ${base64Credentials}` },
     body: JSON.stringify({ "mac-address": macAddress })
   });
   ```
3. When the session expires or is manually disconnected, clear their active lease:
   ```javascript
   await fetch(`https://${routerIP}/rest/ip/hotspot/active/remove`, {
     method: 'POST',
     body: JSON.stringify({ ".id": activeSessionId })
   });
   ```

---

## 5. Security & Isolation Compliance

- **No Shared Credentials**: This module strictly avoids storing or exposing physical WiFi passwords or router admin credentials on the client.
- **Physical Boundary Isolation**: WiFi clients remain isolated at the switch/network layer. The console manages connections only by controlling gateway firewall authorization states.
- **No Mock Traps**: Local simulator fallback maps all CRUD triggers perfectly to LocalStorage, ensuring the application remains 100% testable and functional offline.

---

## 6. Testing Checklist

Use the following checks to verify perfect module compliance:
- [ ] **Access Authorization Form**: Submit the form with an invalid MAC (e.g., `invalid-mac`). Verify that a clear validation warning displays.
- [ ] **Prepaid Active Countdown**: Create a session and verify that the countdown clock runs in real-time, matching the package duration.
- [ ] **Timer Expiration Sync**: Create a simulated short voucher. Watch the timer reach zero, and confirm that the status badge updates to `EXPIRED` instantly.
- [ ] **Device Registry Search**: Search for device models (e.g. `MacBook`) or specific MAC bytes. Ensure results filter accurately.
- [ ] **Router Handshake Test**: Navigate to "Router Integration" tab. Click "Test API Handshake" and confirm that a successful connection message returns.
- [ ] **Administrative Gating**: Log in as a `STAFF` member. Navigate to "Router Integration" tab and verify that inputs are disabled, showing a "Read-Only" warning.
