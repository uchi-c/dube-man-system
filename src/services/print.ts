/**
 * src/services/print.ts
 * Print job management and analytics service
 */

import { supabase } from './supabase';
import {
  PrintJob,
  PrintJobWithDetails,
  PrintAnalyticsDaily,
  PrintAnalyticsByEmployee,
  PrintAnalyticsByCustomer,
  PrintJobStatus,
  ColorMode,
  PaperType,
} from '../types';

/**
 * Create a print job (queued status)
 */
export async function createPrintJob(
  organizationId: string,
  deviceId: string,
  pageCount: number,
  colorMode: ColorMode,
  paperType: PaperType,
  duplex: boolean = false,
  employeeId?: string,
  customerId?: string,
  jobName?: string
): Promise<PrintJob | null> {
  const { data, error } = await supabase
    .from('print_jobs')
    .insert({
      organization_id: organizationId,
      device_id: deviceId,
      page_count: pageCount,
      color_mode: colorMode,
      paper_type: paperType,
      duplex,
      employee_id: employeeId,
      customer_id: customerId,
      job_name: jobName,
      status: 'QUEUED',
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create print job:', error);
    return null;
  }

  return data;
}

/**
 * Update print job status
 */
export async function updatePrintJobStatus(
  jobId: string,
  status: PrintJobStatus,
  startedAt?: Date,
  completedAt?: Date
): Promise<PrintJob | null> {
  const updates: any = { status, updated_at: new Date().toISOString() };
  if (startedAt) updates.started_at = startedAt.toISOString();
  if (completedAt) updates.completed_at = completedAt.toISOString();

  const { data, error } = await supabase
    .from('print_jobs')
    .update(updates)
    .eq('id', jobId)
    .select()
    .single();

  if (error) {
    console.error('Failed to update print job status:', error);
    return null;
  }

  return data;
}

/**
 * Mark print job as printing
 */
export async function startPrintJob(jobId: string): Promise<boolean> {
  const result = await updatePrintJobStatus(jobId, 'PRINTING', new Date());
  return result !== null;
}

/**
 * Mark print job as completed (triggers paper deduction)
 */
export async function completePrintJob(jobId: string): Promise<boolean> {
  const result = await updatePrintJobStatus(jobId, 'COMPLETED', undefined, new Date());
  return result !== null;
}

/**
 * Cancel a print job
 */
export async function cancelPrintJob(jobId: string, reason?: string): Promise<boolean> {
  const { error } = await supabase
    .from('print_jobs')
    .update({
      status: 'CANCELLED',
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  if (error) {
    console.error('Failed to cancel print job:', error);
    return false;
  }

  return true;
}

/**
 * Get all print jobs for a device
 */
export async function getPrintJobsByDevice(deviceId: string, limit: number = 50): Promise<PrintJob[]> {
  const { data, error } = await supabase
    .from('print_jobs')
    .select('*')
    .eq('device_id', deviceId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch print jobs:', error);
    return [];
  }

  return data || [];
}

/**
 * Get print jobs by employee
 */
export async function getPrintJobsByEmployee(
  employeeId: string,
  limit: number = 50
): Promise<PrintJob[]> {
  const { data, error } = await supabase
    .from('print_jobs')
    .select('*')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch employee print jobs:', error);
    return [];
  }

  return data || [];
}

/**
 * Get print jobs by customer
 */
export async function getPrintJobsByCustomer(
  customerId: string,
  limit: number = 50
): Promise<PrintJob[]> {
  const { data, error } = await supabase
    .from('print_jobs')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch customer print jobs:', error);
    return [];
  }

  return data || [];
}

/**
 * Get completed print jobs for today
 */
export async function getTodaysPrintJobs(): Promise<PrintJob[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('print_jobs')
    .select('*')
    .eq('status', 'COMPLETED')
    .gte('completed_at', today.toISOString())
    .order('completed_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch today print jobs:', error);
    return [];
  }

  return data || [];
}

/**
 * Get print analytics for today
 */
export async function getTodaysPrintAnalytics(): Promise<{
  totalPages: number;
  bwPages: number;
  colorPages: number;
  totalCost: number;
  totalRevenue: number;
  totalProfit: number;
  paperSheetsUsed: number;
}> {
  const jobs = await getTodaysPrintJobs();

  return {
    totalPages: jobs.reduce((sum, j) => sum + j.page_count, 0),
    bwPages: jobs.reduce((sum, j) => sum + j.bw_page_count, 0),
    colorPages: jobs.reduce((sum, j) => sum + j.color_page_count, 0),
    totalCost: jobs.reduce((sum, j) => sum + j.total_cost, 0),
    totalRevenue: jobs.reduce((sum, j) => sum + j.total_revenue, 0),
    totalProfit: jobs.reduce((sum, j) => sum + (j.total_revenue - j.total_cost), 0),
    paperSheetsUsed: jobs.reduce((sum, j) => sum + (j.paper_sheets_used || 0), 0),
  };
}

/**
 * Get daily print analytics
 */
export async function getPrintAnalyticsDaily(
  limit: number = 30
): Promise<PrintAnalyticsDaily[]> {
  const { data, error } = await supabase
    .from('print_analytics_daily')
    .select('*')
    .order('report_date', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch daily analytics:', error);
    return [];
  }

  return data || [];
}

/**
 * Get print analytics by employee
 */
export async function getPrintAnalyticsByEmployee(): Promise<PrintAnalyticsByEmployee[]> {
  const { data, error } = await supabase
    .from('print_analytics_by_employee')
    .select('*')
    .order('total_print_jobs', { ascending: false });

  if (error) {
    console.error('Failed to fetch employee analytics:', error);
    return [];
  }

  return data || [];
}

/**
 * Get print analytics by customer
 */
export async function getPrintAnalyticsByCustomer(): Promise<PrintAnalyticsByCustomer[]> {
  const { data, error } = await supabase
    .from('print_analytics_by_customer')
    .select('*')
    .order('total_print_jobs', { ascending: false });

  if (error) {
    console.error('Failed to fetch customer analytics:', error);
    return [];
  }

  return data || [];
}

/**
 * Get top printer by page count today
 */
export async function getTopPrinterToday(): Promise<{
  deviceId: string;
  deviceName: string;
  pageCount: number;
} | null> {
  const analytics = await getPrintAnalyticsDaily(1);
  if (analytics.length === 0) return null;

  const { data: device } = await supabase
    .from('devices')
    .select('id, device_name')
    .eq('id', analytics[0].device_id)
    .single();

  if (!device) return null;

  return {
    deviceId: device.id,
    deviceName: device.device_name,
    pageCount: analytics[0].total_pages || 0,
  };
}

/**
 * Get top employee by page count
 */
export async function getTopEmployeeAllTime(): Promise<{
  employeeId: string;
  employeeName: string;
  pageCount: number;
} | null> {
  const analytics = await getPrintAnalyticsByEmployee();
  if (analytics.length === 0) return null;

  // Fetch employee name
  const { data: user } = await supabase
    .from('users')
    .select('id, name')
    .eq('id', analytics[0].employee_id)
    .single();

  if (!user) return null;

  return {
    employeeId: user.id,
    employeeName: user.name,
    pageCount: analytics[0].total_pages || 0,
  };
}

/**
 * Get top customer by page count
 */
export async function getTopCustomerAllTime(): Promise<{
  customerId: string;
  customerName: string;
  pageCount: number;
} | null> {
  const analytics = await getPrintAnalyticsByCustomer();
  if (analytics.length === 0) return null;

  // Fetch customer name
  const { data: customer } = await supabase
    .from('customers')
    .select('id, name')
    .eq('id', analytics[0].customer_id)
    .single();

  if (!customer) return null;

  return {
    customerId: customer.id,
    customerName: customer.name,
    pageCount: analytics[0].total_pages || 0,
  };
}

/**
 * Get total printing revenue for a date range
 */
export async function getRevenueForDateRange(
  startDate: Date,
  endDate: Date
): Promise<number> {
  const { data, error } = await supabase
    .from('print_jobs')
    .select('total_revenue')
    .eq('status', 'COMPLETED')
    .gte('completed_at', startDate.toISOString())
    .lte('completed_at', endDate.toISOString());

  if (error) {
    console.error('Failed to fetch revenue:', error);
    return 0;
  }

  return (data || []).reduce((sum, job) => sum + (job.total_revenue || 0), 0);
}

/**
 * Get total printing cost for a date range
 */
export async function getCostForDateRange(
  startDate: Date,
  endDate: Date
): Promise<number> {
  const { data, error } = await supabase
    .from('print_jobs')
    .select('total_cost')
    .eq('status', 'COMPLETED')
    .gte('completed_at', startDate.toISOString())
    .lte('completed_at', endDate.toISOString());

  if (error) {
    console.error('Failed to fetch cost:', error);
    return 0;
  }

  return (data || []).reduce((sum, job) => sum + (job.total_cost || 0), 0);
}
