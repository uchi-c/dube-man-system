/**
 * src/services/devices.ts
 * Device management service (CRUD, querying, health monitoring)
 */

import { supabase } from './supabase';
import {
  Device,
  DeviceWithAttributes,
  ComputerAttributes,
  PrinterAttributes,
  DeviceHealthStatus,
  PrinterAlert,
  DeviceType,
  DeviceStatus,
} from '../types';

/**
 * Get all devices for the current organization
 */
export async function getDevices(): Promise<Device[]> {
  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch devices:', error);
    return [];
  }

  return data || [];
}

/**
 * Get a single device by ID with attributes
 */
export async function getDevice(deviceId: string): Promise<DeviceWithAttributes | null> {
  const { data: device, error: deviceError } = await supabase
    .from('devices')
    .select('*')
    .eq('id', deviceId)
    .single();

  if (deviceError || !device) {
    console.error('Failed to fetch device:', deviceError);
    return null;
  }

  let computerAttributes: ComputerAttributes | null = null;
  let printerAttributes: PrinterAttributes | null = null;

  if (device.device_type === 'COMPUTER') {
    const { data: ca } = await supabase
      .from('computer_attributes')
      .select('*')
      .eq('device_id', deviceId)
      .single();
    computerAttributes = ca;
  } else if (device.device_type === 'PRINTER') {
    const { data: pa } = await supabase
      .from('printer_attributes')
      .select('*')
      .eq('device_id', deviceId)
      .single();
    printerAttributes = pa;
  }

  return {
    ...device,
    computer_attributes: computerAttributes || undefined,
    printer_attributes: printerAttributes || undefined,
  };
}

/**
 * Get devices by type (e.g., all PRINTER devices)
 */
export async function getDevicesByType(deviceType: DeviceType): Promise<Device[]> {
  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .eq('device_type', deviceType)
    .order('device_name', { ascending: true });

  if (error) {
    console.error(`Failed to fetch ${deviceType} devices:`, error);
    return [];
  }

  return data || [];
}

/**
 * Create a new device (PC, Printer, Scanner, etc.)
 */
export async function createDevice(
  organizationId: string,
  deviceName: string,
  deviceCode: string,
  deviceType: DeviceType,
  location?: string
): Promise<Device | null> {
  const { data, error } = await supabase
    .from('devices')
    .insert({
      organization_id: organizationId,
      device_name: deviceName,
      device_code: deviceCode,
      device_type: deviceType,
      location,
      status: 'OFFLINE',
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create device:', error);
    return null;
  }

  return data;
}

/**
 * Register a computer with rates for cafe sessions
 */
export async function registerComputer(
  organizationId: string,
  computerName: string,
  computerCode: string,
  hourlyRate: number = 60,
  ratePerMinute: number = 1.0
): Promise<Device | null> {
  // Create device
  const device = await createDevice(organizationId, computerName, computerCode, 'COMPUTER');
  if (!device) return null;

  // Create computer attributes
  const { error: attrError } = await supabase
    .from('computer_attributes')
    .insert({
      device_id: device.id,
      hourly_rate: hourlyRate,
      rate_per_minute: ratePerMinute,
    });

  if (attrError) {
    console.error('Failed to create computer attributes:', attrError);
    return null;
  }

  return device;
}

/**
 * Register a printer
 */
export async function registerPrinter(
  organizationId: string,
  printerName: string,
  printerCode: string,
  printerType: 'RECEIPT' | 'LASER' | 'INKJET' | 'LABEL' | 'MULTIFUNCTION',
  costPerPageBW: number = 0.005,
  costPerPageColor: number = 0.015
): Promise<Device | null> {
  // Create device
  const device = await createDevice(organizationId, printerName, printerCode, 'PRINTER');
  if (!device) return null;

  // Create printer attributes
  const { error: attrError } = await supabase
    .from('printer_attributes')
    .insert({
      device_id: device.id,
      printer_type: printerType,
      cost_per_page_bw: costPerPageBW,
      cost_per_page_color: costPerPageColor,
      revenue_per_page_bw: costPerPageBW * 2,
      revenue_per_page_color: costPerPageColor * 2,
      paper_capacity: 500,
      toner_level: 100,
      total_page_count: 0,
      total_print_jobs: 0,
      error_count: 0,
      toner_low_threshold: 20,
    });

  if (attrError) {
    console.error('Failed to create printer attributes:', attrError);
    return null;
  }

  return device;
}

/**
 * Update device status (AVAILABLE, OCCUPIED, MAINTENANCE, OFFLINE, ERROR)
 */
export async function updateDeviceStatus(
  deviceId: string,
  status: DeviceStatus
): Promise<boolean> {
  const { error } = await supabase
    .from('devices')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', deviceId);

  if (error) {
    console.error('Failed to update device status:', error);
    return false;
  }

  return true;
}

/**
 * Update device heartbeat (called by agent)
 */
export async function updateDeviceHeartbeat(
  deviceCode: string,
  metrics: {
    cpu?: number;
    ram?: number;
    disk?: number;
    hostname?: string;
    ip_address?: string;
    agent_version?: string;
  }
): Promise<boolean> {
  const now = new Date().toISOString();

  const { error: deviceError } = await supabase
    .from('devices')
    .update({
      last_seen: now,
      last_heartbeat_at: now,
      status: 'AVAILABLE',
      hostname: metrics.hostname,
      ip_address: metrics.ip_address,
      agent_version: metrics.agent_version,
      updated_at: now,
    })
    .eq('device_code', deviceCode);

  if (deviceError) {
    console.error('Failed to update device heartbeat:', deviceError);
    return false;
  }

  // Update computer metrics if applicable
  if (metrics.cpu !== undefined || metrics.ram !== undefined || metrics.disk !== undefined) {
    const { error: attrError } = await supabase
      .from('computer_attributes')
      .update({
        cpu_usage: metrics.cpu,
        ram_usage: metrics.ram,
        disk_usage: metrics.disk,
        updated_at: now,
      })
      .eq('device_id', (await getDeviceByCode(deviceCode))?.id);

    if (attrError) {
      console.error('Failed to update computer metrics:', attrError);
    }
  }

  return true;
}

/**
 * Update printer metrics (page count, toner level, etc.)
 */
export async function updatePrinterMetrics(
  deviceCode: string,
  metrics: {
    total_page_count?: number;
    toner_level?: number;
    error_count?: number;
  }
): Promise<boolean> {
  const device = await getDeviceByCode(deviceCode);
  if (!device) return false;

  const { error } = await supabase
    .from('printer_attributes')
    .update({
      ...metrics,
      updated_at: new Date().toISOString(),
    })
    .eq('device_id', device.id);

  if (error) {
    console.error('Failed to update printer metrics:', error);
    return false;
  }

  return true;
}

/**
 * Get device by device code (used by agent)
 */
export async function getDeviceByCode(deviceCode: string): Promise<Device | null> {
  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .eq('device_code', deviceCode)
    .single();

  if (error || !data) {
    console.error('Failed to fetch device by code:', error);
    return null;
  }

  return data;
}

/**
 * Get device health status (for monitoring dashboard)
 */
export async function getDeviceHealthStatus(): Promise<DeviceHealthStatus[]> {
  const { data, error } = await supabase
    .from('device_health_status')
    .select('*')
    .order('health_status', { ascending: false });

  if (error) {
    console.error('Failed to fetch device health status:', error);
    return [];
  }

  return data || [];
}

/**
 * Get printer alerts
 */
export async function getPrinterAlerts(): Promise<PrinterAlert[]> {
  const { data, error } = await supabase
    .from('printer_alerts')
    .select('*')
    .order('severity', { ascending: true });

  if (error) {
    console.error('Failed to fetch printer alerts:', error);
    return [];
  }

  return data || [];
}

/**
 * Delete device (with cascade delete of attributes and sessions)
 */
export async function deleteDevice(deviceId: string): Promise<boolean> {
  const { error } = await supabase
    .from('devices')
    .delete()
    .eq('id', deviceId);

  if (error) {
    console.error('Failed to delete device:', error);
    return false;
  }

  return true;
}

/**
 * Refresh materialized views for analytics (admin operation)
 */
export async function refreshPrintAnalytics(): Promise<boolean> {
  const { error } = await supabase.rpc('refresh_print_analytics');

  if (error) {
    console.error('Failed to refresh print analytics:', error);
    return false;
  }

  return true;
}
