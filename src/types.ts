/**
 * Dube Man General Dealers - TypeScript Definitions
 * Updated: Device Abstraction & Print Management Module
 */

export type UserRole = 'ADMIN' | 'STAFF' | 'CAFE_OPERATOR';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
}

// ============================================================================
// DEVICE ABSTRACTION TYPES
// ============================================================================

export type DeviceType = 'COMPUTER' | 'PRINTER' | 'SCANNER' | 'POS' | 'ROUTER' | 'BIOMETRIC' | 'CAMERA';
export type DeviceStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE' | 'OFFLINE' | 'ERROR';
export type PrinterType = 'RECEIPT' | 'LASER' | 'INKJET' | 'LABEL' | 'MULTIFUNCTION';
export type ColorMode = 'BW' | 'COLOR' | 'MIXED';
export type PaperType = 'A4' | 'A3' | 'LETTER' | 'LEGAL' | 'RECEIPT_ROLL' | 'LABEL_4X6' | 'LABEL_CUSTOM' | 'PHOTO';

export interface Organization {
  id: string;
  name: string;
  created_at: string;
}

export interface Device {
  id: string;
  organization_id: string;
  device_name: string;
  device_code: string;
  device_type: DeviceType;
  status: DeviceStatus;
  hostname?: string;
  ip_address?: string;
  mac_address?: string;
  location?: string;
  agent_version?: string;
  last_seen?: string;
  last_heartbeat_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ComputerAttributes {
  device_id: string;
  cpu_usage?: number;
  ram_usage?: number;
  disk_usage?: number;
  hourly_rate: number;
  rate_per_minute: number;
  updated_at: string;
}

export interface PrinterAttributes {
  device_id: string;
  printer_type: PrinterType;
  printer_model?: string;
  printer_brand?: string;
  toner_level?: number;
  paper_capacity: number;
  cost_per_page_bw: number;
  cost_per_page_color: number;
  revenue_per_page_bw: number;
  revenue_per_page_color: number;
  total_page_count: number;
  total_print_jobs: number;
  error_count: number;
  last_maintenance_date?: string;
  toner_low_threshold: number;
  updated_at: string;
}

export interface DeviceWithAttributes extends Device {
  computer_attributes?: ComputerAttributes;
  printer_attributes?: PrinterAttributes;
}

export interface DeviceHealthStatus {
  id: string;
  organization_id: string;
  device_name: string;
  device_code: string;
  device_type: DeviceType;
  status: DeviceStatus;
  last_seen?: string;
  seconds_since_last_seen: number;
  health_status: 'OFFLINE' | 'STALE' | 'LATE' | 'HEALTHY';
  toner_level?: number;
  total_page_count?: number;
  error_count?: number;
  toner_low_alert: boolean;
}

export interface PrinterAlert {
  id: string;
  organization_id: string;
  device_name: string;
  alert_type: 'TONER_LOW' | 'DEVICE_OFFLINE' | 'DEVICE_STALE' | 'DEVICE_LATE' | 'HIGH_ERROR_RATE' | null;
  alert_message?: string;
  last_seen?: string;
  severity: 1 | 2 | 3 | 4 | 5; // 1=critical, 5=info
}

// ============================================================================
// PRINT JOB TYPES
// ============================================================================

export type PrintJobStatus = 'QUEUED' | 'PRINTING' | 'COMPLETED' | 'CANCELLED' | 'ERROR';

export interface PrintJob {
  id: string;
  organization_id: string;
  device_id: string;
  print_job_id?: string;
  job_name?: string;
  status: PrintJobStatus;
  page_count: number;
  color_mode: ColorMode;
  bw_page_count: number;
  color_page_count: number;
  duplex: boolean;
  paper_type: PaperType;
  paper_sheets_used?: number;
  employee_id?: string;
  customer_id?: string;
  cost_per_page: number;
  total_cost: number;
  revenue_per_page: number;
  total_revenue: number;
  queued_at: string;
  started_at?: string;
  completed_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface PrintJobWithDetails extends PrintJob {
  device_name?: string;
  employee_name?: string;
  customer_name?: string;
}

export interface PrintAnalyticsDaily {
  organization_id: string;
  report_date: string;
  device_id: string;
  total_print_jobs: number;
  total_pages: number;
  total_bw_pages: number;
  total_color_pages: number;
  total_paper_sheets: number;
  total_cost: number;
  total_revenue: number;
  total_profit: number;
  avg_cost_per_job: number;
  avg_revenue_per_job: number;
  first_job_at: string;
  last_job_at: string;
}

export interface PrintAnalyticsByEmployee {
  organization_id: string;
  employee_id: string;
  total_print_jobs: number;
  total_pages: number;
  total_bw_pages: number;
  total_color_pages: number;
  total_cost: number;
  total_revenue: number;
  total_profit: number;
  avg_cost_per_job: number;
  first_job_at: string;
  last_job_at: string;
}

export interface PrintAnalyticsByCustomer {
  organization_id: string;
  customer_id: string;
  total_print_jobs: number;
  total_pages: number;
  total_bw_pages: number;
  total_color_pages: number;
  total_cost: number;
  total_revenue: number;
  total_profit: number;
  avg_revenue_per_job: number;
  first_job_at: string;
  last_job_at: string;
}

// ============================================================================
// PAPER INVENTORY TYPES
// ============================================================================

export interface PaperInventory {
  id: string;
  organization_id: string;
  paper_type: PaperType;
  paper_name: string;
  quantity_sheets: number;
  min_stock_threshold: number;
  cost_per_sheet: number;
  total_cost: number;
  supplier_name?: string;
  last_reorder_date?: string;
  reorder_quantity?: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface PaperInventoryAlert {
  id: string;
  organization_id: string;
  paper_type: PaperType;
  paper_name: string;
  quantity_sheets: number;
  min_stock_threshold: number;
  alert_level: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'APPROACHING_THRESHOLD' | 'OK';
  alert_message?: string;
}

export interface PaperInventoryTransaction {
  id: string;
  organization_id: string;
  inventory_id: string;
  transaction_type: 'PURCHASE' | 'USAGE' | 'ADJUSTMENT' | 'RETURN';
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  print_job_id?: string;
  reason?: string;
  created_by?: string;
  created_at: string;
}

// ============================================================================
// ORGANIZATION & SETTINGS TYPES
// ============================================================================

export interface OrganizationSettings {
  organization_id: string;
  track_paper_inventory: boolean;
  paper_cost_factor: number;
  default_cost_per_page_bw: number;
  default_cost_per_page_color: number;
  default_revenue_per_page_bw: number;
  default_revenue_per_page_color: number;
  paper_reorder_threshold_pct: number;
  toner_low_threshold_pct: number;
  device_heartbeat_timeout_seconds: number;
  currency_code: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// CUSTOMER FEEDBACK & ROADMAP TYPES
// ============================================================================

export type FeedbackPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type FeedbackStatus = 'NEW' | 'UNDER_REVIEW' | 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';
export type RoadmapPhase = 'MUST_HAVE' | 'SHOULD_HAVE' | 'COULD_HAVE' | 'FUTURE';
export type RoadmapItemStatus = 'BACKLOG' | 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED';

export interface CustomerFeedback {
  id: string;
  organization_id: string;
  customer_name: string;
  business_type?: string;
  requested_feature: string;
  problem_description: string;
  business_impact?: string;
  priority: FeedbackPriority;
  status: FeedbackStatus;
  votes: number;
  roadmap_phase: RoadmapPhase;
  submitted_by?: string;
  submitted_at: string;
  updated_at: string;
}

export interface RoadmapItem {
  id: string;
  organization_id: string;
  feature_name: string;
  description: string;
  phase: RoadmapPhase;
  customer_count: number;
  linked_feedback_ids: string[];
  business_impact?: string;
  status: RoadmapItemStatus;
  planned_start_date?: string;
  planned_completion_date?: string;
  actual_completion_date?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// LEGACY TYPES (MAINTAINED FOR BACKWARD COMPATIBILITY)
// ============================================================================

export interface Product {
  id: string;
  name: string;
  category: string; // 'Printing', 'Stationery', 'Embroidery', 'Cafe', 'Digital'
  quantity: number;
  buying_price: number;
  selling_price: number;
  supplier: string;
  min_stock_level?: number; // threshold for "Low stock warning"
  created_at: string;
  updated_at: string;
}

export interface InventoryTransaction {
  id: string;
  product_id: string;
  type: 'STOCK_IN' | 'STOCK_OUT' | 'SALE' | 'ADJUSTMENT';
  quantity: number;
  created_by: string;
  created_at: string;
}

export interface Sale {
  id: string;
  customer_id: string | null;
  customer_name?: string;
  total_amount: number;
  payment_method: 'Cash' | 'Mobile Money' | 'Bank';
  created_by: string;
  created_at: string;
  items: SaleItem[];
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  product_name?: string;
  quantity: number;
  unit_price: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  created_at: string;
}

export type PrintingStatus = 'Pending' | 'Designing' | 'Printing' | 'Completed' | 'Collected';

export interface PrintingOrder {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_phone?: string;
  description: string;
  quantity: number;
  amount: number; // total cost
  amount_paid: number; // deposit/full paid
  status: PrintingStatus;
  created_by: string;
  created_at: string;
}

export type ComputerStatus = 'Available' | 'Occupied' | 'Maintenance';

export interface Computer {
  id: string;
  computer_name: string;
  computer_code: string;
  status: ComputerStatus;
  hourly_rate: number;
  rate_per_minute: number;
  last_seen: string;
}

export type CafeSessionStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface CafeSession {
  id: string;
  computer_id: string;
  computer_name: string;
  customer_name: string;
  start_time: string;
  end_time?: string;
  duration_minutes?: number;
  rate_per_minute: number;
  amount?: number;
  status: CafeSessionStatus;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  timestamp: string;
}

// Wifi dynamic trackers
export interface WifiSessionRecord {
  id: string;
  customer_name: string;
  device_name: string;
  access_duration_minutes: number;
  bandwidth_used_mb: number;
  created_at: string;
}

export interface WifiCustomer {
  id: string;
  name: string;
  phone: string;
  device_name: string;
  mac_address: string;
  created_at: string;
}

export interface WifiPackage {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
  created_at: string;
}

export interface WifiSession {
  id: string;
  customer_id: string;
  package_id: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  amount: number;
  status: 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';
  created_at: string;
  
  // Joined/embedded objects
  wifi_customers?: WifiCustomer;
  wifi_packages?: WifiPackage;
}

export interface WifiUsageLog {
  id: string;
  customer_id: string;
  device_name: string;
  mac_address: string;
  action: 'CONNECTED' | 'DISCONNECTED' | 'EXPIRED';
  created_at: string;
  
  // Joined/embedded objects
  wifi_customers?: WifiCustomer;
}

export interface RouterSetting {
  id: string;
  router_name: string;
  router_brand: string;
  router_model: string;
  integration_type: string;
  created_at: string;
}
