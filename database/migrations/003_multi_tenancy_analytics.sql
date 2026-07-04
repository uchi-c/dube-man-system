-- ============================================================================
-- MIGRATION 003: MULTI-TENANCY, ANALYTICS & REPORTING
-- Purpose: Create analytics views, alerts, and multi-org data isolation
-- ============================================================================

-- 1. Print analytics daily materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS public.print_analytics_daily AS
SELECT
    organization_id,
    DATE(completed_at) AS report_date,
    device_id,
    COUNT(*) AS total_print_jobs,
    SUM(page_count) AS total_pages,
    SUM(bw_page_count) AS total_bw_pages,
    SUM(color_page_count) AS total_color_pages,
    SUM(paper_sheets_used) AS total_paper_sheets,
    SUM(total_cost)::numeric(10,2) AS total_cost,
    SUM(total_revenue)::numeric(10,2) AS total_revenue,
    (SUM(total_revenue) - SUM(total_cost))::numeric(10,2) AS total_profit,
    AVG(total_cost)::numeric(10,4) AS avg_cost_per_job,
    AVG(total_revenue)::numeric(10,4) AS avg_revenue_per_job,
    MIN(completed_at) AS first_job_at,
    MAX(completed_at) AS last_job_at
FROM public.print_jobs
WHERE status = 'COMPLETED'::public.print_job_status
GROUP BY organization_id, DATE(completed_at), device_id;

CREATE INDEX idx_print_analytics_daily_org_date ON public.print_analytics_daily(organization_id, report_date DESC);
CREATE INDEX idx_print_analytics_daily_device ON public.print_analytics_daily(device_id);

-- 2. Print analytics by employee
CREATE MATERIALIZED VIEW IF NOT EXISTS public.print_analytics_by_employee AS
SELECT
    organization_id,
    employee_id,
    COUNT(*) AS total_print_jobs,
    SUM(page_count) AS total_pages,
    SUM(bw_page_count) AS total_bw_pages,
    SUM(color_page_count) AS total_color_pages,
    SUM(total_cost)::numeric(10,2) AS total_cost,
    SUM(total_revenue)::numeric(10,2) AS total_revenue,
    (SUM(total_revenue) - SUM(total_cost))::numeric(10,2) AS total_profit,
    AVG(total_cost)::numeric(10,4) AS avg_cost_per_job,
    MIN(completed_at) AS first_job_at,
    MAX(completed_at) AS last_job_at
FROM public.print_jobs
WHERE status = 'COMPLETED'::public.print_job_status
  AND employee_id IS NOT NULL
GROUP BY organization_id, employee_id;

CREATE INDEX idx_print_analytics_employee_org ON public.print_analytics_by_employee(organization_id, total_print_jobs DESC);

-- 3. Print analytics by customer
CREATE MATERIALIZED VIEW IF NOT EXISTS public.print_analytics_by_customer AS
SELECT
    organization_id,
    customer_id,
    COUNT(*) AS total_print_jobs,
    SUM(page_count) AS total_pages,
    SUM(bw_page_count) AS total_bw_pages,
    SUM(color_page_count) AS total_color_pages,
    SUM(total_cost)::numeric(10,2) AS total_cost,
    SUM(total_revenue)::numeric(10,2) AS total_revenue,
    (SUM(total_revenue) - SUM(total_cost))::numeric(10,2) AS total_profit,
    AVG(total_revenue)::numeric(10,4) AS avg_revenue_per_job,
    MIN(completed_at) AS first_job_at,
    MAX(completed_at) AS last_job_at
FROM public.print_jobs
WHERE status = 'COMPLETED'::public.print_job_status
  AND customer_id IS NOT NULL
GROUP BY organization_id, customer_id;

CREATE INDEX idx_print_analytics_customer_org ON public.print_analytics_by_customer(organization_id, total_print_jobs DESC);

-- 4. Device health status view
CREATE VIEW IF NOT EXISTS public.device_health_status AS
SELECT
    d.id,
    d.organization_id,
    d.device_name,
    d.device_code,
    d.device_type,
    d.status,
    d.last_seen,
    EXTRACT(EPOCH FROM (now() - d.last_seen))::integer AS seconds_since_last_seen,
    CASE 
        WHEN d.status = 'OFFLINE'::public.device_status THEN 'OFFLINE'
        WHEN EXTRACT(EPOCH FROM (now() - d.last_seen)) > 3600 THEN 'STALE'  -- > 1 hour
        WHEN EXTRACT(EPOCH FROM (now() - d.last_seen)) > 600 THEN 'LATE'    -- > 10 min
        ELSE 'HEALTHY'
    END AS health_status,
    CASE 
        WHEN d.device_type = 'PRINTER'::public.device_type THEN pa.toner_level
        ELSE NULL
    END AS toner_level,
    CASE 
        WHEN d.device_type = 'PRINTER'::public.device_type THEN pa.total_page_count
        ELSE NULL
    END AS total_page_count,
    CASE 
        WHEN d.device_type = 'PRINTER'::public.device_type THEN pa.error_count
        ELSE NULL
    END AS error_count,
    CASE 
        WHEN d.device_type = 'PRINTER'::public.device_type 
             AND pa.toner_level IS NOT NULL
             AND pa.toner_level < pa.toner_low_threshold THEN true
        ELSE false
    END AS toner_low_alert
FROM public.devices d
LEFT JOIN public.printer_attributes pa ON pa.device_id = d.id;

-- 5. Paper inventory alerts view
CREATE VIEW IF NOT EXISTS public.paper_inventory_alerts AS
SELECT
    pi.id,
    pi.organization_id,
    pi.paper_type,
    pi.paper_name,
    pi.quantity_sheets,
    pi.min_stock_threshold,
    CASE 
        WHEN pi.quantity_sheets = 0 THEN 'OUT_OF_STOCK'
        WHEN pi.quantity_sheets < pi.min_stock_threshold THEN 'LOW_STOCK'
        WHEN pi.quantity_sheets < (pi.min_stock_threshold * 1.5) THEN 'APPROACHING_THRESHOLD'
        ELSE 'OK'
    END AS alert_level,
    CASE 
        WHEN pi.quantity_sheets = 0 THEN 'IMMEDIATE: Order paper immediately'
        WHEN pi.quantity_sheets < pi.min_stock_threshold THEN 'WARNING: Paper below minimum threshold'
        WHEN pi.quantity_sheets < (pi.min_stock_threshold * 1.5) THEN 'INFO: Paper approaching reorder threshold'
        ELSE NULL
    END AS alert_message
FROM public.paper_inventory pi;

-- 6. Printer alerts view (combines health and consumables)
CREATE VIEW IF NOT EXISTS public.printer_alerts AS
SELECT
    d.id,
    d.organization_id,
    d.device_name,
    CASE 
        WHEN dhs.toner_low_alert THEN 'TONER_LOW'
        WHEN dhs.health_status = 'OFFLINE' THEN 'DEVICE_OFFLINE'
        WHEN dhs.health_status = 'STALE' THEN 'DEVICE_STALE'
        WHEN dhs.health_status = 'LATE' THEN 'DEVICE_LATE'
        WHEN dhs.error_count > 5 THEN 'HIGH_ERROR_RATE'
        ELSE NULL
    END AS alert_type,
    CASE 
        WHEN dhs.toner_low_alert THEN 'Toner level: ' || dhs.toner_level::text || '% (threshold: 20%)'
        WHEN dhs.health_status = 'OFFLINE' THEN 'Device offline for ' || (dhs.seconds_since_last_seen / 3600)::integer || ' hours'
        WHEN dhs.health_status = 'STALE' THEN 'No heartbeat for ' || (dhs.seconds_since_last_seen / 60)::integer || ' minutes'
        WHEN dhs.health_status = 'LATE' THEN 'Late heartbeat: ' || (dhs.seconds_since_last_seen / 60)::integer || ' minutes ago'
        WHEN dhs.error_count > 5 THEN dhs.error_count::text || ' errors since last maintenance'
        ELSE NULL
    END AS alert_message,
    dhs.last_seen,
    CASE 
        WHEN dhs.toner_low_alert THEN 1
        WHEN dhs.health_status = 'OFFLINE' THEN 2
        WHEN dhs.health_status = 'STALE' THEN 3
        WHEN dhs.error_count > 5 THEN 4
        ELSE 5
    END AS severity  -- 1=critical, 5=info
FROM public.devices d
JOIN public.device_health_status dhs ON dhs.id = d.id
WHERE dhs.health_status != 'HEALTHY' 
   OR dhs.toner_low_alert = true
   OR dhs.error_count > 5;

-- 7. Organization settings table
CREATE TABLE IF NOT EXISTS public.organization_settings (
    organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    
    -- Paper tracking
    track_paper_inventory boolean DEFAULT true,
    paper_cost_factor numeric(5,2) DEFAULT 1.00 CHECK (paper_cost_factor > 0),
    
    -- Printing costs
    default_cost_per_page_bw numeric(10,4) DEFAULT 0.0050,
    default_cost_per_page_color numeric(10,4) DEFAULT 0.0150,
    default_revenue_per_page_bw numeric(10,4) DEFAULT 0.0100,
    default_revenue_per_page_color numeric(10,4) DEFAULT 0.0300,
    
    -- Thresholds & Alerts
    paper_reorder_threshold_pct numeric(5,2) DEFAULT 30.0 CHECK (paper_reorder_threshold_pct > 0 AND paper_reorder_threshold_pct <= 100),
    toner_low_threshold_pct numeric(5,2) DEFAULT 20.0 CHECK (toner_low_threshold_pct > 0 AND toner_low_threshold_pct <= 100),
    device_heartbeat_timeout_seconds integer DEFAULT 3600,
    
    -- Preferences
    currency_code text DEFAULT 'USD',
    timezone text DEFAULT 'UTC',
    
    -- Audit
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read organization settings" ON public.organization_settings FOR SELECT
    USING (
        organization_id IN (
            SELECT org_id FROM public.user_organization_memberships 
            WHERE user_id = auth.uid()
        )
        AND public.is_role(array['ADMIN']::public.user_role[])
    );

CREATE POLICY "Admins manage organization settings" ON public.organization_settings FOR ALL
    USING (
        organization_id IN (
            SELECT org_id FROM public.user_organization_memberships 
            WHERE user_id = auth.uid()
        )
        AND public.is_role(array['ADMIN']::public.user_role[])
    )
    WITH CHECK (
        organization_id IN (
            SELECT org_id FROM public.user_organization_memberships 
            WHERE user_id = auth.uid()
        )
        AND public.is_role(array['ADMIN']::public.user_role[])
    );

-- 8. Customer feedback table
CREATE TABLE IF NOT EXISTS public.customer_feedback (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    
    -- Feedback details
    customer_name text NOT NULL,
    business_type text,
    requested_feature text NOT NULL,
    problem_description text NOT NULL,
    business_impact text,
    
    -- Triage
    priority text CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')) DEFAULT 'MEDIUM',
    status text CHECK (status IN ('NEW', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED')) DEFAULT 'NEW',
    votes integer DEFAULT 0 CHECK (votes >= 0),
    
    -- Roadmap mapping
    roadmap_phase text CHECK (roadmap_phase IN ('MUST_HAVE', 'SHOULD_HAVE', 'COULD_HAVE', 'FUTURE')) DEFAULT 'COULD_HAVE',
    
    -- Audit
    submitted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    submitted_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.customer_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read feedback in their organization" ON public.customer_feedback FOR SELECT
    USING (
        organization_id IN (
            SELECT org_id FROM public.user_organization_memberships 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Admins manage feedback in their organization" ON public.customer_feedback FOR ALL
    USING (
        organization_id IN (
            SELECT org_id FROM public.user_organization_memberships 
            WHERE user_id = auth.uid()
        )
        AND public.is_role(array['ADMIN']::public.user_role[])
    )
    WITH CHECK (
        organization_id IN (
            SELECT org_id FROM public.user_organization_memberships 
            WHERE user_id = auth.uid()
        )
        AND public.is_role(array['ADMIN']::public.user_role[])
    );

-- 9. Roadmap items table
CREATE TABLE IF NOT EXISTS public.roadmap_items (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    
    -- Feature details
    feature_name text NOT NULL,
    description text NOT NULL,
    phase text CHECK (phase IN ('MUST_HAVE', 'SHOULD_HAVE', 'COULD_HAVE', 'FUTURE')) NOT NULL,
    
    -- Motivation
    customer_count integer DEFAULT 0,  -- How many customers requested this
    linked_feedback_ids uuid[] DEFAULT '{}',  -- References to customer_feedback
    business_impact text,
    
    -- Status
    status text CHECK (status IN ('BACKLOG', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED')) DEFAULT 'BACKLOG',
    
    -- Timeline
    planned_start_date date,
    planned_completion_date date,
    actual_completion_date date,
    
    -- Audit
    created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.roadmap_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read roadmap in their organization" ON public.roadmap_items FOR SELECT
    USING (
        organization_id IN (
            SELECT org_id FROM public.user_organization_memberships 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Admins manage roadmap in their organization" ON public.roadmap_items FOR ALL
    USING (
        organization_id IN (
            SELECT org_id FROM public.user_organization_memberships 
            WHERE user_id = auth.uid()
        )
        AND public.is_role(array['ADMIN']::public.user_role[])
    )
    WITH CHECK (
        organization_id IN (
            SELECT org_id FROM public.user_organization_memberships 
            WHERE user_id = auth.uid()
        )
        AND public.is_role(array['ADMIN']::public.user_role[])
    );

-- 10. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_customer_feedback_org_priority ON public.customer_feedback(organization_id, priority);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_org_status ON public.customer_feedback(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_roadmap_phase ON public.customer_feedback(roadmap_phase);

CREATE INDEX IF NOT EXISTS idx_roadmap_items_org_phase ON public.roadmap_items(organization_id, phase);
CREATE INDEX IF NOT EXISTS idx_roadmap_items_org_status ON public.roadmap_items(organization_id, status);

-- 11. Materialized view refresh function
CREATE OR REPLACE FUNCTION public.refresh_print_analytics()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.print_analytics_daily;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.print_analytics_by_employee;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.print_analytics_by_customer;
$$;

-- 12. Migration helper: Create default organization and mappings
-- Run this once during deployment
CREATE OR REPLACE FUNCTION public.initialize_multi_tenancy_for_existing_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    default_org_id uuid;
    user_rec RECORD;
BEGIN
    -- Create default organization
    INSERT INTO public.organizations (name)
    VALUES ('Default Organization')
    ON CONFLICT (name) DO UPDATE SET name = 'Default Organization'
    RETURNING id INTO default_org_id;
    
    -- Map all existing users to default organization
    INSERT INTO public.user_organization_memberships (user_id, org_id)
    SELECT u.id, default_org_id
    FROM public.users u
    ON CONFLICT (user_id, org_id) DO NOTHING;
    
    -- Create default organization settings
    INSERT INTO public.organization_settings (organization_id)
    VALUES (default_org_id)
    ON CONFLICT (organization_id) DO NOTHING;
    
    -- Update all existing devices to belong to default organization
    UPDATE public.devices
    SET organization_id = default_org_id
    WHERE organization_id IS NULL;
    
    RAISE NOTICE 'Initialized multi-tenancy: Organization % created and all users mapped', default_org_id;
END $$;

COMMENT ON MATERIALIZED VIEW public.print_analytics_daily IS 'Daily print analytics: pages, costs, revenue, profit aggregated by org and device';
COMMENT ON MATERIALIZED VIEW public.print_analytics_by_employee IS 'Employee printing activity: total pages, costs, revenue per employee';
COMMENT ON MATERIALIZED VIEW public.print_analytics_by_customer IS 'Customer printing activity: total pages, revenue per customer';
COMMENT ON VIEW public.device_health_status IS 'Device health monitoring: heartbeat status, toner levels, error rates';
COMMENT ON VIEW public.paper_inventory_alerts IS 'Paper stock alerts: out of stock, low stock, approaching threshold';
COMMENT ON VIEW public.printer_alerts IS 'Printer alerts: offline, stale, high error rate, low toner';
COMMENT ON TABLE public.organization_settings IS 'Organization-level printing and cost settings';
COMMENT ON TABLE public.customer_feedback IS 'Customer feature requests and feedback linked to roadmap';
COMMENT ON TABLE public.roadmap_items IS 'Product roadmap classified as Must/Should/Could/Future';
