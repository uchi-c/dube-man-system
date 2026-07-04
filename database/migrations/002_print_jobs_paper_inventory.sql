-- ============================================================================
-- MIGRATION 002: PRINT MANAGEMENT - JOBS & PAPER INVENTORY
-- Purpose: Create tables for print job tracking, paper inventory, and costs
-- ============================================================================

-- 1. Paper types enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'paper_type') THEN
        CREATE TYPE public.paper_type AS ENUM (
            'A4',
            'A3',
            'LETTER',
            'LEGAL',
            'RECEIPT_ROLL',
            'LABEL_4X6',
            'LABEL_CUSTOM',
            'PHOTO'
        );
    END IF;
END $$;

-- 2. Print job status enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'print_job_status') THEN
        CREATE TYPE public.print_job_status AS ENUM (
            'QUEUED',
            'PRINTING',
            'COMPLETED',
            'CANCELLED',
            'ERROR'
        );
    END IF;
END $$;

-- 3. Color mode enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'color_mode') THEN
        CREATE TYPE public.color_mode AS ENUM (
            'BW',           -- Black & White
            'COLOR',        -- Full color
            'MIXED'         -- Mix of B&W and color pages
        );
    END IF;
END $$;

-- 4. Print jobs table (core audit trail for every print)
CREATE TABLE IF NOT EXISTS public.print_jobs (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    
    -- Device & Job IDs
    device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE RESTRICT,
    print_job_id text,  -- External printer queue ID (for matching)
    
    -- Job details
    job_name text,
    status public.print_job_status DEFAULT 'QUEUED'::public.print_job_status NOT NULL,
    
    -- Pages
    page_count integer NOT NULL CHECK (page_count > 0),
    color_mode public.color_mode DEFAULT 'BW'::public.color_mode,
    bw_page_count integer DEFAULT 0 CHECK (bw_page_count >= 0),
    color_page_count integer DEFAULT 0 CHECK (color_page_count >= 0),
    duplex boolean DEFAULT false,
    
    -- Paper
    paper_type public.paper_type DEFAULT 'A4'::public.paper_type,
    paper_sheets_used integer,  -- Calculated: page_count / 2 if duplex, else page_count
    
    -- User & Customer
    employee_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
    
    -- Costs & Revenue
    cost_per_page numeric(10,4) NOT NULL DEFAULT 0.0050,
    total_cost numeric(10,2) NOT NULL DEFAULT 0.00 CHECK (total_cost >= 0),
    revenue_per_page numeric(10,4) NOT NULL DEFAULT 0.0100,
    total_revenue numeric(10,2) NOT NULL DEFAULT 0.00 CHECK (total_revenue >= 0),
    
    -- Timestamps
    queued_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    started_at timestamptz,
    completed_at timestamptz,
    
    -- Audit
    created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read print jobs in their organization" ON public.print_jobs FOR SELECT
    USING (
        organization_id IN (
            SELECT org_id FROM public.user_organization_memberships 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Admins and staff manage print jobs in their organization" ON public.print_jobs FOR ALL
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

-- 5. Paper inventory table
CREATE TABLE IF NOT EXISTS public.paper_inventory (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    
    -- Paper spec
    paper_type public.paper_type NOT NULL,
    paper_name text NOT NULL,  -- e.g., "A4 80gsm White"
    
    -- Stock levels
    quantity_sheets integer NOT NULL CHECK (quantity_sheets >= 0),
    min_stock_threshold integer DEFAULT 500 CHECK (min_stock_threshold >= 0),
    
    -- Cost tracking
    cost_per_sheet numeric(10,4) NOT NULL CHECK (cost_per_sheet >= 0),
    total_cost numeric(10,2) GENERATED ALWAYS AS (quantity_sheets * cost_per_sheet) STORED,
    
    -- Supplier info
    supplier_name text,
    last_reorder_date date,
    reorder_quantity integer,
    
    -- Audit
    created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    UNIQUE(organization_id, paper_type)
);

ALTER TABLE public.paper_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read paper inventory in their organization" ON public.paper_inventory FOR SELECT
    USING (
        organization_id IN (
            SELECT org_id FROM public.user_organization_memberships 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Admins and staff manage paper inventory in their organization" ON public.paper_inventory FOR ALL
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

-- 6. Paper inventory transactions (audit trail)
CREATE TABLE IF NOT EXISTS public.paper_inventory_transactions (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    
    -- Reference
    inventory_id uuid NOT NULL REFERENCES public.paper_inventory(id) ON DELETE CASCADE,
    
    -- Transaction
    transaction_type text NOT NULL CHECK (transaction_type IN ('PURCHASE', 'USAGE', 'ADJUSTMENT', 'RETURN')),
    quantity_change integer NOT NULL,  -- Positive for add, negative for subtract
    quantity_before integer NOT NULL,
    quantity_after integer NOT NULL,
    
    -- Reference links
    print_job_id uuid REFERENCES public.print_jobs(id) ON DELETE SET NULL,
    
    -- Notes
    reason text,
    
    -- Audit
    created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.paper_inventory_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read paper transactions in their organization" ON public.paper_inventory_transactions FOR SELECT
    USING (
        organization_id IN (
            SELECT org_id FROM public.user_organization_memberships 
            WHERE user_id = auth.uid()
        )
        AND public.is_role(array['ADMIN']::public.user_role[])
    );

CREATE POLICY "Admins insert paper transactions in their organization" ON public.paper_inventory_transactions FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT org_id FROM public.user_organization_memberships 
            WHERE user_id = auth.uid()
        )
        AND public.is_role(array['ADMIN']::public.user_role[])
    );

-- 7. Toner/consumables tracking
CREATE TABLE IF NOT EXISTS public.printer_consumables (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
    
    -- Consumable type
    consumable_type text NOT NULL CHECK (consumable_type IN ('TONER_BW', 'TONER_CYAN', 'TONER_MAGENTA', 'TONER_YELLOW', 'DRUM', 'FUSER', 'ROLLER')),
    
    -- Current state
    level_percentage numeric(5,2) CHECK (level_percentage >= 0 AND level_percentage <= 100),
    
    -- Lifecycle
    installed_date date,
    expected_replacement_date date,
    
    -- Audit
    last_updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.printer_consumables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read consumables in their organization" ON public.printer_consumables FOR SELECT
    USING (
        organization_id IN (
            SELECT org_id FROM public.user_organization_memberships 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Admins manage consumables in their organization" ON public.printer_consumables FOR ALL
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

-- 8. Print job cost calculation function
CREATE OR REPLACE FUNCTION public.calculate_print_job_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    printer_cost_bw numeric(10,4);
    printer_cost_color numeric(10,4);
    calculated_cost numeric(10,2);
BEGIN
    -- Get printer cost per page
    SELECT cost_per_page_bw, cost_per_page_color INTO printer_cost_bw, printer_cost_color
    FROM public.printer_attributes
    WHERE device_id = NEW.device_id;
    
    -- Default if not found
    printer_cost_bw := COALESCE(printer_cost_bw, 0.0050);
    printer_cost_color := COALESCE(printer_cost_color, 0.0150);
    
    -- Calculate based on color mode
    IF NEW.color_mode = 'BW'::public.color_mode THEN
        NEW.bw_page_count := NEW.page_count;
        NEW.color_page_count := 0;
        calculated_cost := (NEW.bw_page_count * printer_cost_bw)::numeric(10,2);
    ELSIF NEW.color_mode = 'COLOR'::public.color_mode THEN
        NEW.bw_page_count := 0;
        NEW.color_page_count := NEW.page_count;
        calculated_cost := (NEW.color_page_count * printer_cost_color)::numeric(10,2);
    ELSE  -- MIXED
        -- Assume 70% BW, 30% color (can be refined per printer)
        NEW.bw_page_count := (NEW.page_count * 0.7)::integer;
        NEW.color_page_count := NEW.page_count - NEW.bw_page_count;
        calculated_cost := (
            (NEW.bw_page_count * printer_cost_bw) + 
            (NEW.color_page_count * printer_cost_color)
        )::numeric(10,2);
    END IF;
    
    -- Store calculated cost
    NEW.total_cost := calculated_cost;
    NEW.cost_per_page := (calculated_cost / NEW.page_count)::numeric(10,4);
    
    -- Calculate paper sheets (duplex = 1 sheet per 2 pages)
    IF NEW.duplex THEN
        NEW.paper_sheets_used := CEIL(NEW.page_count::numeric / 2)::integer;
    ELSE
        NEW.paper_sheets_used := NEW.page_count;
    END IF;
    
    RETURN NEW;
END $$;

-- Trigger: auto-calculate costs before insert/update
CREATE TRIGGER tr_print_job_calculate_cost
    BEFORE INSERT OR UPDATE ON public.print_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.calculate_print_job_cost();

-- 9. Trigger: deduct paper inventory when print job completes
CREATE OR REPLACE FUNCTION public.deduct_paper_on_print_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Only deduct when job transitions to COMPLETED
    IF NEW.status = 'COMPLETED'::public.print_job_status 
       AND OLD.status IS DISTINCT FROM 'COMPLETED'::public.print_job_status THEN
        
        -- Deduct from paper inventory
        UPDATE public.paper_inventory
        SET quantity_sheets = quantity_sheets - NEW.paper_sheets_used,
            updated_at = now()
        WHERE organization_id = NEW.organization_id
          AND paper_type = NEW.paper_type
          AND quantity_sheets >= NEW.paper_sheets_used;
        
        -- Record transaction
        INSERT INTO public.paper_inventory_transactions (
            organization_id, inventory_id, transaction_type, 
            quantity_change, quantity_before, quantity_after, 
            print_job_id, created_by, reason
        )
        SELECT
            NEW.organization_id,
            pi.id,
            'USAGE'::text,
            -NEW.paper_sheets_used,
            (pi.quantity_sheets + NEW.paper_sheets_used),
            pi.quantity_sheets,
            NEW.id,
            NEW.created_by,
            'Print job ' || NEW.id::text || ' completed'
        FROM public.paper_inventory pi
        WHERE pi.organization_id = NEW.organization_id
          AND pi.paper_type = NEW.paper_type;
    END IF;
    
    RETURN NEW;
END $$;

-- Trigger: auto-deduct paper on print completion
CREATE TRIGGER tr_paper_deduct_on_print_complete
    AFTER UPDATE ON public.print_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.deduct_paper_on_print_complete();

-- 10. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_print_jobs_organization_id ON public.print_jobs(organization_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_device_id ON public.print_jobs(device_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON public.print_jobs(status);
CREATE INDEX IF NOT EXISTS idx_print_jobs_employee_id ON public.print_jobs(employee_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_customer_id ON public.print_jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_created_at ON public.print_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_jobs_org_device_status ON public.print_jobs(organization_id, device_id, status);

CREATE INDEX IF NOT EXISTS idx_paper_inventory_organization_id ON public.paper_inventory(organization_id);
CREATE INDEX IF NOT EXISTS idx_paper_inventory_paper_type ON public.paper_inventory(paper_type);
CREATE INDEX IF NOT EXISTS idx_paper_inventory_quantity ON public.paper_inventory(quantity_sheets);

CREATE INDEX IF NOT EXISTS idx_paper_transactions_organization_id ON public.paper_inventory_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_paper_transactions_inventory_id ON public.paper_inventory_transactions(inventory_id);
CREATE INDEX IF NOT EXISTS idx_paper_transactions_print_job_id ON public.paper_inventory_transactions(print_job_id);
CREATE INDEX IF NOT EXISTS idx_paper_transactions_created_at ON public.paper_inventory_transactions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_printer_consumables_device_id ON public.printer_consumables(device_id);
CREATE INDEX IF NOT EXISTS idx_printer_consumables_organization_id ON public.printer_consumables(organization_id);

-- Enable Realtime for analytics
ALTER PUBLICATION supabase_realtime ADD TABLE public.print_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.paper_inventory;

COMMENT ON TABLE public.print_jobs IS 'Audit trail for every print job: pages, costs, revenue, employee, customer';
COMMENT ON TABLE public.paper_inventory IS 'Organization paper stock: quantity, cost, reorder thresholds';
COMMENT ON TABLE public.paper_inventory_transactions IS 'Ledger of all paper stock changes: purchase, usage, adjustment, return';
COMMENT ON TABLE public.printer_consumables IS 'Toner, drums, rollers: level %, installation date, expected replacement';
