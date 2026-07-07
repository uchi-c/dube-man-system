/**
 * Dube Man General Dealers - TypeScript Definitions
 */

export type UserRole = 'ADMIN' | 'STAFF' | 'CAFE_OPERATOR';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
}

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

// ============================================================
// PRINT MANAGER — Types
// ============================================================

export type PrinterStatus = 'Online' | 'Offline' | 'Paused' | 'Error';
export type PrintJobStatus = 'Completed' | 'Cancelled' | 'Failed';
export type PaperSize = 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal' | 'Custom';
export type ColorMode = 'BW' | 'Colour';

/** A physical or virtual printer registered in the system */
export interface Printer {
  id: string;
  printer_name: string;
  /** Exact name as shown in Windows Devices & Printers */
  windows_printer_name: string;
  location: string;
  branch: string;
  status: PrinterStatus;
  cost_per_bw_page: number;
  cost_per_colour_page: number;
  paper_sizes: PaperSize[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** A single print job captured by the pc-agent */
export interface PrintJob {
  id: string;
  printer_id: string;
  printer_name?: string;
  computer_id: string | null;
  computer_name?: string;
  employee_id: string | null;
  employee_name?: string;
  customer_id: string | null;
  customer_name?: string;
  session_id: string | null;
  document_name: string | null;
  page_count: number;
  color_mode: ColorMode;
  paper_size: PaperSize;
  cost: number;
  revenue: number;
  profit: number;
  status: PrintJobStatus;
  print_time: string;       // ISO timestamp when job completed
  created_at: string;
}

/** Paper stock for a specific paper type / size */
export interface PaperInventory {
  id: string;
  paper_size: PaperSize;
  description: string;
  reams_purchased: number;   // 1 ream = 500 sheets
  reams_remaining: number;
  pages_per_ream: number;    // default 500
  cost_per_ream: number;
  min_stock_reams: number;   // alert threshold
  created_at: string;
  updated_at: string;
}

/** Organization-wide print pricing configuration */
export interface PrintPricingSettings {
  id: string;
  bw_price_per_page: number;
  colour_price_per_page: number;
  paper_cost_per_page: number;
  created_at: string;
  updated_at: string;
}

// ---- aggregated view types used by dashboard/reports ----

export interface PrintDashboardStats {
  pages_today: number;
  bw_pages_today: number;
  colour_pages_today: number;
  revenue_today: number;
  cost_today: number;
  estimated_paper_used: number; // pages
  most_used_printer: string;
  most_active_computer: string;
  most_active_employee: string;
  top_customer: string;
  offline_printers: number;
  total_printers: number;
  daily_trend: DailyPrintTrend[];
}

export interface DailyPrintTrend {
  date: string;        // 'Mon', 'Tue' etc or 'DD/MM'
  bw: number;
  colour: number;
  revenue: number;
}

export interface PrintReportRow {
  label: string;       // printer name / employee / customer / computer
  jobs: number;
  pages: number;
  bw_pages: number;
  colour_pages: number;
  revenue: number;
  cost: number;
  profit: number;
}

