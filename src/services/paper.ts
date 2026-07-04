/**
 * src/services/paper.ts
 * Paper inventory management and tracking service
 */

import { supabase } from './supabase';
import {
  PaperInventory,
  PaperInventoryAlert,
  PaperInventoryTransaction,
  PaperType,
} from '../types';

/**
 * Get all paper inventory for organization
 */
export async function getPaperInventory(): Promise<PaperInventory[]> {
  const { data, error } = await supabase
    .from('paper_inventory')
    .select('*')
    .order('paper_type', { ascending: true });

  if (error) {
    console.error('Failed to fetch paper inventory:', error);
    return [];
  }

  return data || [];
}

/**
 * Get paper inventory by type
 */
export async function getPaperByType(paperType: PaperType): Promise<PaperInventory | null> {
  const { data, error } = await supabase
    .from('paper_inventory')
    .select('*')
    .eq('paper_type', paperType)
    .single();

  if (error) {
    console.error(`Failed to fetch ${paperType} inventory:`, error);
    return null;
  }

  return data;
}

/**
 * Create paper inventory entry
 */
export async function createPaperInventory(
  organizationId: string,
  paperType: PaperType,
  paperName: string,
  quantitySheets: number,
  costPerSheet: number,
  minStockThreshold: number = 500,
  supplierName?: string
): Promise<PaperInventory | null> {
  const { data, error } = await supabase
    .from('paper_inventory')
    .insert({
      organization_id: organizationId,
      paper_type: paperType,
      paper_name: paperName,
      quantity_sheets: quantitySheets,
      cost_per_sheet: costPerSheet,
      min_stock_threshold: minStockThreshold,
      supplier_name: supplierName,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create paper inventory:', error);
    return null;
  }

  return data;
}

/**
 * Update paper inventory quantity (purchase/restock)
 */
export async function restockPaper(
  paperType: PaperType,
  quantityToAdd: number,
  supplierName?: string,
  reason?: string
): Promise<boolean> {
  const inventory = await getPaperByType(paperType);
  if (!inventory) {
    console.error(`Paper type ${paperType} not found`);
    return false;
  }

  const newQuantity = inventory.quantity_sheets + quantityToAdd;

  // Update inventory
  const { error: updateError } = await supabase
    .from('paper_inventory')
    .update({
      quantity_sheets: newQuantity,
      supplier_name: supplierName || inventory.supplier_name,
      last_reorder_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', inventory.id);

  if (updateError) {
    console.error('Failed to update paper inventory:', updateError);
    return false;
  }

  // Record transaction
  const { error: transError } = await supabase
    .from('paper_inventory_transactions')
    .insert({
      organization_id: inventory.organization_id,
      inventory_id: inventory.id,
      transaction_type: 'PURCHASE',
      quantity_change: quantityToAdd,
      quantity_before: inventory.quantity_sheets,
      quantity_after: newQuantity,
      reason: reason || `Restock from ${supplierName || 'unknown supplier'}`,
    });

  if (transError) {
    console.error('Failed to record transaction:', transError);
    return false;
  }

  return true;
}

/**
 * Get paper inventory alerts (low stock, out of stock, etc.)
 */
export async function getPaperAlerts(): Promise<PaperInventoryAlert[]> {
  const { data, error } = await supabase
    .from('paper_inventory_alerts')
    .select('*')
    .order('alert_level', { ascending: false });

  if (error) {
    console.error('Failed to fetch paper alerts:', error);
    return [];
  }

  return data || [];
}

/**
 * Get paper transactions (audit trail)
 */
export async function getPaperTransactions(
  inventoryId: string,
  limit: number = 100
): Promise<PaperInventoryTransaction[]> {
  const { data, error } = await supabase
    .from('paper_inventory_transactions')
    .select('*')
    .eq('inventory_id', inventoryId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch paper transactions:', error);
    return [];
  }

  return data || [];
}

/**
 * Get total paper cost (valuation)
 */
export async function getTotalPaperCost(): Promise<number> {
  const inventory = await getPaperInventory();
  return inventory.reduce((sum, item) => sum + (item.total_cost || 0), 0);
}

/**
 * Get paper usage for a date range (via print jobs)
 */
export async function getPaperUsageForDateRange(
  paperType: PaperType,
  startDate: Date,
  endDate: Date
): Promise<{
  totalSheets: number;
  totalCost: number;
}> {
  const { data, error } = await supabase
    .from('print_jobs')
    .select('paper_sheets_used, total_cost')
    .eq('paper_type', paperType)
    .eq('status', 'COMPLETED')
    .gte('completed_at', startDate.toISOString())
    .lte('completed_at', endDate.toISOString());

  if (error) {
    console.error('Failed to fetch paper usage:', error);
    return { totalSheets: 0, totalCost: 0 };
  }

  const totalSheets = (data || []).reduce(
    (sum, job) => sum + (job.paper_sheets_used || 0),
    0
  );
  const totalCost = (data || []).reduce(
    (sum, job) => sum + (job.total_cost || 0),
    0
  );

  return { totalSheets, totalCost };
}

/**
 * Check if paper is low (below threshold)
 */
export async function isPaperLow(paperType: PaperType): Promise<boolean> {
  const inventory = await getPaperByType(paperType);
  if (!inventory) return false;

  return inventory.quantity_sheets < inventory.min_stock_threshold;
}

/**
 * Get estimated days until reorder needed
 */
export async function getEstimatedDaysUntilReorder(
  paperType: PaperType
): Promise<number | null> {
  const inventory = await getPaperByType(paperType);
  if (!inventory) return null;

  // Get daily usage from transactions (last 30 days average)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: transactions, error } = await supabase
    .from('paper_inventory_transactions')
    .select('quantity_change')
    .eq('inventory_id', inventory.id)
    .eq('transaction_type', 'USAGE')
    .gte('created_at', thirtyDaysAgo.toISOString());

  if (error || !transactions || transactions.length === 0) return null;

  const totalUsage = Math.abs(
    transactions.reduce((sum, t) => sum + t.quantity_change, 0)
  );
  const avgDailyUsage = totalUsage / 30;

  if (avgDailyUsage === 0) return null;

  const sheetsAboveThreshold = Math.max(
    0,
    inventory.quantity_sheets - inventory.min_stock_threshold
  );

  return Math.ceil(sheetsAboveThreshold / avgDailyUsage);
}

/**
 * Adjust paper inventory manually (for reconciliation)
 */
export async function adjustPaperInventory(
  paperType: PaperType,
  quantityAdjustment: number,
  reason: string
): Promise<boolean> {
  const inventory = await getPaperByType(paperType);
  if (!inventory) {
    console.error(`Paper type ${paperType} not found`);
    return false;
  }

  const newQuantity = inventory.quantity_sheets + quantityAdjustment;

  // Update inventory
  const { error: updateError } = await supabase
    .from('paper_inventory')
    .update({
      quantity_sheets: newQuantity,
      updated_at: new Date().toISOString(),
    })
    .eq('id', inventory.id);

  if (updateError) {
    console.error('Failed to adjust paper inventory:', updateError);
    return false;
  }

  // Record transaction
  const { error: transError } = await supabase
    .from('paper_inventory_transactions')
    .insert({
      organization_id: inventory.organization_id,
      inventory_id: inventory.id,
      transaction_type: 'ADJUSTMENT',
      quantity_change: quantityAdjustment,
      quantity_before: inventory.quantity_sheets,
      quantity_after: newQuantity,
      reason,
    });

  if (transError) {
    console.error('Failed to record adjustment:', transError);
    return false;
  }

  return true;
}

/**
 * Update paper cost (if supplier prices change)
 */
export async function updatePaperCost(
  paperType: PaperType,
  newCostPerSheet: number
): Promise<boolean> {
  const inventory = await getPaperByType(paperType);
  if (!inventory) {
    console.error(`Paper type ${paperType} not found`);
    return false;
  }

  const { error } = await supabase
    .from('paper_inventory')
    .update({
      cost_per_sheet: newCostPerSheet,
      updated_at: new Date().toISOString(),
    })
    .eq('id', inventory.id);

  if (error) {
    console.error('Failed to update paper cost:', error);
    return false;
  }

  return true;
}
