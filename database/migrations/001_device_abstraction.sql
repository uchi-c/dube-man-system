-- ============================================================================
-- MIGRATION 001: DEVICE ABSTRACTION LAYER
-- Purpose: Create unified device registry to support computers, printers,
--          scanners, and future device types. Replace device-specific tables.
-- ============================================================================

-- 1. Create organizations table (for multi-tenancy)
CREATE TABLE IF NOT EXISTS public.organizations (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    name text NOT NULL UNIQUE,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read organizations" ON public.organizations FOR SELECT
    USING (public.is_role(array['ADMIN']::public.user_role[]));

-- 2. Device type enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'device_type') THEN
        CREATE TYPE public.device_type AS ENUM (
            'COMPUTER',
            'PRINTER',
            'SCANNER',
            'POS',
            'ROUTER',
            'BIOMETRIC',
            'CAMERA'
        );
    END IF;
END $$;

-- 3. Printer type enum (subset of device_type PRINTER)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'printer_type') THEN
        CREATE TYPE public.printer_type AS ENUM (
            'RECEIPT',
            'LASER',
            'INKJET',
            'LABEL',
            'MULTIFUNCTION'
        );
    END IF;
END $$;

-- 4. Device status enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'device_status') THEN
        CREATE TYPE public.device_status AS ENUM (
            'AVAILABLE',
            'OCCUPIED',
            'MAINTENANCE',
            'OFFLINE',
            'ERROR'
        );
    END IF;
END $$;

-- 5. Unified devices table (replaces device-specific tables)
CREATE TABLE IF NOT EXISTS public.devices (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    
    -- Core device info
    device_name text NOT NULL,
    device_code text NOT NULL,
    device_type public.device_type NOT NULL,
    status public.device_status DEFAULT 'OFFLINE'::public.device_status NOT NULL,
    
    -- Network/Location
    hostname text,
    ip_address inet,
    mac_address macaddr,
    location text,
    
    -- Agent info
    agent_version text,
    last_seen timestamptz,
    last_heartbeat_at timestamptz,
    
    -- Audit
    created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Constraints
    UNIQUE(organization_id, device_code),
    UNIQUE(organization_id, device_name)
);

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read devices in their organization" ON public.devices FOR SELECT
    USING (
        organization_id IN (
            SELECT org_id FROM public.user_organization_memberships 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Admins and staff manage devices in their organization" ON public.devices FOR ALL
    USING (
        organization_id IN (
            SELECT org_id FROM public.user_organization_memberships 
            WHERE user_id = auth.uid()
        )
        AND public.is_role(array['ADMIN','STAFF']::public.user_role[])
    )
    WITH CHECK (
        organization_id IN (
            SELECT org_id FROM public.user_organization_memberships 
            WHERE user_id = auth.uid()
        )
        AND public.is_role(array['ADMIN','STAFF']::public.user_role[])
    );

-- 6. Computer-specific attributes (denormalized from devices)
CREATE TABLE IF NOT EXISTS public.computer_attributes (
    device_id uuid PRIMARY KEY REFERENCES public.devices(id) ON DELETE CASCADE,
    
    -- Performance metrics
    cpu_usage numeric(5,2),
    ram_usage numeric(5,2),
    disk_usage numeric(5,2),
    
    -- Cafe session rates
    hourly_rate numeric(10,2) DEFAULT 60.00 NOT NULL CHECK (hourly_rate >= 0),
    rate_per_minute numeric(10,2) DEFAULT 1.00 NOT NULL CHECK (rate_per_minute >= 0),
    
    -- Audit
    updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.computer_attributes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read computer attributes" ON public.computer_attributes FOR SELECT
    USING (
        device_id IN (
            SELECT id FROM public.devices d
            WHERE d.organization_id IN (
                SELECT org_id FROM public.user_organization_memberships 
                WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Admins manage computer attributes" ON public.computer_attributes FOR ALL
    USING (
        device_id IN (
            SELECT id FROM public.devices d
            WHERE d.organization_id IN (
                SELECT org_id FROM public.user_organization_memberships 
                WHERE user_id = auth.uid()
            )
        )
        AND public.is_role(array['ADMIN']::public.user_role[])
    )
    WITH CHECK (
        device_id IN (
            SELECT id FROM public.devices d
            WHERE d.organization_id IN (
                SELECT org_id FROM public.user_organization_memberships 
                WHERE user_id = auth.uid()
            )
        )
        AND public.is_role(array['ADMIN']::public.user_role[])
    );

-- 7. Printer-specific attributes
CREATE TABLE IF NOT EXISTS public.printer_attributes (
    device_id uuid PRIMARY KEY REFERENCES public.devices(id) ON DELETE CASCADE,
    
    -- Printer specs
    printer_type public.printer_type NOT NULL,
    printer_model text,
    printer_brand text,
    
    -- Consumables tracking
    toner_level numeric(5,2),  -- Percentage 0-100
    paper_capacity integer DEFAULT 500,  -- sheets
    
    -- Cost tracking
    cost_per_page_bw numeric(10,4) DEFAULT 0.0050 CHECK (cost_per_page_bw >= 0),
    cost_per_page_color numeric(10,4) DEFAULT 0.0150 CHECK (cost_per_page_color >= 0),
    revenue_per_page_bw numeric(10,4) DEFAULT 0.0100 CHECK (revenue_per_page_bw >= 0),
    revenue_per_page_color numeric(10,4) DEFAULT 0.0300 CHECK (revenue_per_page_color >= 0),
    
    -- Metrics
    total_page_count bigint DEFAULT 0,
    total_print_jobs integer DEFAULT 0,
    error_count integer DEFAULT 0,
    
    -- Maintenance
    last_maintenance_date date,
    toner_low_threshold numeric(5,2) DEFAULT 20.00,
    
    -- Audit
    updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.printer_attributes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read printer attributes" ON public.printer_attributes FOR SELECT
    USING (
        device_id IN (
            SELECT id FROM public.devices d
            WHERE d.organization_id IN (
                SELECT org_id FROM public.user_organization_memberships 
                WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Admins manage printer attributes" ON public.printer_attributes FOR ALL
    USING (
        device_id IN (
            SELECT id FROM public.devices d
            WHERE d.organization_id IN (
                SELECT org_id FROM public.user_organization_memberships 
                WHERE user_id = auth.uid()
            )
        )
        AND public.is_role(array['ADMIN','STAFF']::public.user_role[])
    )
    WITH CHECK (
        device_id IN (
            SELECT id FROM public.devices d
            WHERE d.organization_id IN (
                SELECT org_id FROM public.user_organization_memberships 
                WHERE user_id = auth.uid()
            )
        )
        AND public.is_role(array['ADMIN','STAFF']::public.user_role[])
    );

-- 8. Create backward-compatibility VIEW for existing cafe_sessions
-- This allows existing code to continue working without modification
CREATE OR REPLACE VIEW public.computers AS
SELECT
    d.id,
    d.device_name AS computer_name,
    d.device_code AS computer_code,
    CASE 
        WHEN d.status = 'OFFLINE'::public.device_status THEN 'Available'::text
        WHEN d.status = 'OCCUPIED'::public.device_status THEN 'Occupied'::text
        WHEN d.status = 'MAINTENANCE'::public.device_status THEN 'Maintenance'::text
        ELSE 'Available'::text
    END AS status,
    ca.hourly_rate,
    ca.rate_per_minute,
    d.last_seen,
    d.organization_id,
    d.created_at,
    d.updated_at
FROM public.devices d
LEFT JOIN public.computer_attributes ca ON ca.device_id = d.id
WHERE d.device_type = 'COMPUTER'::public.device_type;

-- 9. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_devices_organization_id ON public.devices(organization_id);
CREATE INDEX IF NOT EXISTS idx_devices_device_type ON public.devices(device_type);
CREATE INDEX IF NOT EXISTS idx_devices_status ON public.devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON public.devices(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_devices_organization_status ON public.devices(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_computer_attributes_updated_at ON public.computer_attributes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_printer_attributes_toner_level ON public.printer_attributes(toner_level);
CREATE INDEX IF NOT EXISTS idx_printer_attributes_updated_at ON public.printer_attributes(updated_at DESC);

-- 10. Link users to organizations (required for multi-tenancy RLS)
CREATE TABLE IF NOT EXISTS public.user_organization_memberships (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    UNIQUE(user_id, org_id)
);

ALTER TABLE public.user_organization_memberships ENABLE ROW LEVEL SECURITY;

-- Ensure all existing users are mapped to a default organization
-- (This happens during migration setup)

COMMENT ON TABLE public.devices IS 'Unified device registry: computers, printers, scanners, POS, routers, biometric devices, cameras';
COMMENT ON TABLE public.computer_attributes IS 'PC-specific metrics and cafe session rates';
COMMENT ON TABLE public.printer_attributes IS 'Printer-specific specs, consumables, costs, and metrics';
COMMENT ON VIEW public.computers IS 'Backward-compatibility view for existing cafe_sessions table';
