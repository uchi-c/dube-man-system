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

