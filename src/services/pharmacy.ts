/**
 * src/services/pharmacy.ts
 * Pharmacy module: medicine catalog, batch/lot expiry tracking,
 * prescriptions, and dispensing. Every insert is stamped with the caller's
 * organization_id (see services/organizations.ts) — RLS then enforces that
 * a tenant can only ever see its own pharmacy data.
 */

import { supabase, isSupabaseConfigured, insertLog } from './supabase';
import { getCurrentOrganizationId } from './organizations';
import {
  Medicine, MedicineBatch, Prescription, PrescriptionItem,
  DispensingRecord, MedicineDosageForm, PrescriptionStatus,
  StockStatus, ExpiryAlertLevel,
} from '../types';

const handleError = (err: any, message: string) => {
  console.warn(`Pharmacy service warning: ${message} — ${err?.message || err}`);
};

async function currentUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ---- mappers ----------------------------------------------------------------

const mapMedicine = (r: any): Medicine => ({
  id: r.id,
  name: r.name,
  generic_name: r.generic_name ?? undefined,
  dosage_form: r.dosage_form as MedicineDosageForm,
  strength: r.strength ?? undefined,
  unit: r.unit,
  category: r.category ?? undefined,
  requires_prescription: !!r.requires_prescription,
  controlled_substance: !!r.controlled_substance,
  reorder_level: r.reorder_level,
  buying_price: Number(r.buying_price),
  selling_price: Number(r.selling_price),
  barcode: r.barcode ?? undefined,
  is_active: r.is_active,
  created_at: r.created_at,
  updated_at: r.updated_at,
});

const mapBatch = (r: any): MedicineBatch => ({
  id: r.id,
  medicine_id: r.medicine_id,
  medicine_name: r.medicines?.name,
  batch_number: r.batch_number,
  quantity: r.quantity,
  expiry_date: r.expiry_date,
  manufacture_date: r.manufacture_date ?? undefined,
  supplier: r.supplier ?? undefined,
  cost_price: Number(r.cost_price ?? 0),
  received_at: r.received_at,
  created_at: r.created_at,
});

const mapPrescription = (r: any): Prescription => ({
  id: r.id,
  customer_id: r.customer_id,
  customer_name: r.customers?.name,
  patient_name: r.patient_name,
  prescribing_doctor: r.prescribing_doctor ?? undefined,
  diagnosis: r.diagnosis ?? undefined,
  issued_date: r.issued_date,
  status: r.status as PrescriptionStatus,
  notes: r.notes ?? undefined,
  created_by: r.created_by,
  created_at: r.created_at,
  updated_at: r.updated_at,
  items: (r.prescription_items ?? []).map(mapPrescriptionItem),
});

function mapPrescriptionItem(r: any): PrescriptionItem {
  return {
    id: r.id,
    prescription_id: r.prescription_id,
    medicine_id: r.medicine_id,
    medicine_name: r.medicines?.name,
    quantity_prescribed: r.quantity_prescribed,
    quantity_dispensed: r.quantity_dispensed,
    dosage_instructions: r.dosage_instructions ?? undefined,
    created_at: r.created_at,
  };
}

const mapDispensingRecord = (r: any): DispensingRecord => ({
  id: r.id,
  prescription_id: r.prescription_id,
  prescription_item_id: r.prescription_item_id,
  medicine_id: r.medicine_id,
  medicine_name: r.medicines?.name,
  batch_id: r.batch_id,
  batch_number: r.medicine_batches?.batch_number,
  customer_id: r.customer_id,
  customer_name: r.customers?.name,
  quantity: r.quantity,
  unit_price: Number(r.unit_price),
  total_price: Number(r.total_price),
  dispensed_by: r.dispensed_by,
  dispensed_by_name: r.users?.name,
  dispensed_at: r.dispensed_at,
  notes: r.notes ?? undefined,
});

// ==========================================
// MEDICINE CATALOG
// ==========================================

export async function fetchMedicines(): Promise<Medicine[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const [{ data, error }, { data: stockRows }] = await Promise.all([
      supabase.from('medicines').select('*').eq('is_active', true).order('name', { ascending: true }),
      supabase.from('medicine_stock_levels').select('medicine_id, total_quantity, stock_status'),
    ]);
    if (error) throw error;

    const stockByMedicine = new Map<string, { total_quantity: number; stock_status: StockStatus }>();
    (stockRows ?? []).forEach((row: any) => {
      stockByMedicine.set(row.medicine_id, {
        total_quantity: Number(row.total_quantity),
        stock_status: row.stock_status as StockStatus,
      });
    });

    return (data ?? []).map((row: any) => {
      const medicine = mapMedicine(row);
      const stock = stockByMedicine.get(row.id);
      return {
        ...medicine,
        total_quantity: stock?.total_quantity ?? 0,
        stock_status: stock?.stock_status ?? 'OUT_OF_STOCK',
      };
    });
  } catch (err) {
    handleError(err, 'Failed fetching medicines');
    return [];
  }
}

export async function insertMedicine(
  medicine: Omit<Medicine, 'id' | 'created_at' | 'updated_at' | 'is_active' | 'total_quantity' | 'stock_status'>
): Promise<Medicine | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const organization_id = await getCurrentOrganizationId();
    const { data, error } = await supabase
      .from('medicines')
      .insert([{ ...medicine, organization_id }])
      .select()
      .single();
    if (error) throw error;
    await insertLog(await currentUserId(), `Added medicine to pharmacy catalog: ${medicine.name} (${medicine.strength ?? 'n/a'})`);
    return mapMedicine(data);
  } catch (err) {
    handleError(err, 'Failed adding medicine');
    return null;
  }
}

export async function updateMedicine(medicine: Medicine): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase
      .from('medicines')
      .update({
        name: medicine.name,
        generic_name: medicine.generic_name,
        dosage_form: medicine.dosage_form,
        strength: medicine.strength,
        unit: medicine.unit,
        category: medicine.category,
        requires_prescription: medicine.requires_prescription,
        controlled_substance: medicine.controlled_substance,
        reorder_level: medicine.reorder_level,
        buying_price: medicine.buying_price,
        selling_price: medicine.selling_price,
        barcode: medicine.barcode,
        is_active: medicine.is_active,
      })
      .eq('id', medicine.id);
    if (error) throw error;
    await insertLog(await currentUserId(), `Updated medicine: ${medicine.name}`);
    return true;
  } catch (err) {
    handleError(err, 'Failed updating medicine');
    return false;
  }
}

// ==========================================
// BATCHES (stock, by expiry)
// ==========================================

export async function fetchMedicineBatches(medicineId?: string): Promise<MedicineBatch[]> {
  if (!isSupabaseConfigured) return [];
  try {
    let q = supabase
      .from('medicine_batches')
      .select('*, medicines(name)')
      .gt('quantity', 0)
      .order('expiry_date', { ascending: true });
    if (medicineId) q = q.eq('medicine_id', medicineId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(mapBatch);
  } catch (err) {
    handleError(err, 'Failed fetching medicine batches');
    return [];
  }
}

export async function fetchExpiringBatches(): Promise<MedicineBatch[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from('expiring_medicine_batches')
      .select('*')
      .order('expiry_date', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.batch_id,
      medicine_id: r.medicine_id,
      medicine_name: r.medicine_name,
      batch_number: r.batch_number,
      quantity: r.quantity,
      expiry_date: r.expiry_date,
      cost_price: 0,
      received_at: r.expiry_date,
      created_at: r.expiry_date,
      days_until_expiry: Number(r.days_until_expiry),
      alert_level: r.alert_level as ExpiryAlertLevel,
    }));
  } catch (err) {
    handleError(err, 'Failed fetching expiring batches');
    return [];
  }
}

export async function receiveMedicineBatch(batch: {
  medicine_id: string;
  batch_number: string;
  quantity: number;
  expiry_date: string;
  manufacture_date?: string;
  supplier?: string;
  cost_price?: number;
}): Promise<MedicineBatch | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const organization_id = await getCurrentOrganizationId();
    const { data, error } = await supabase
      .from('medicine_batches')
      .insert([{ ...batch, organization_id }])
      .select('*, medicines(name)')
      .single();
    if (error) throw error;
    await insertLog(await currentUserId(), `Received stock: ${batch.quantity} units, batch ${batch.batch_number}`);
    return mapBatch(data);
  } catch (err) {
    handleError(err, 'Failed receiving medicine batch');
    return null;
  }
}

// ==========================================
// PRESCRIPTIONS
// ==========================================

export async function fetchPrescriptions(): Promise<Prescription[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from('prescriptions')
      .select('*, customers(name), prescription_items(*, medicines(name))')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapPrescription);
  } catch (err) {
    handleError(err, 'Failed fetching prescriptions');
    return [];
  }
}

export async function createPrescription(
  prescription: {
    customer_id?: string | null;
    patient_name: string;
    prescribing_doctor?: string;
    diagnosis?: string;
    notes?: string;
  },
  items: { medicine_id: string; quantity_prescribed: number; dosage_instructions?: string }[]
): Promise<Prescription | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const organization_id = await getCurrentOrganizationId();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: rx, error: rxError } = await supabase
      .from('prescriptions')
      .insert([{ ...prescription, organization_id, created_by: user?.id }])
      .select()
      .single();
    if (rxError) throw rxError;

    const { error: itemsError } = await supabase
      .from('prescription_items')
      .insert(items.map(i => ({ ...i, prescription_id: rx.id, organization_id })));
    if (itemsError) throw itemsError;

    await insertLog(user?.id ?? null, `Logged prescription for ${prescription.patient_name} (${items.length} item${items.length === 1 ? '' : 's'})`);

    const { data: full } = await supabase
      .from('prescriptions')
      .select('*, customers(name), prescription_items(*, medicines(name))')
      .eq('id', rx.id)
      .single();
    return full ? mapPrescription(full) : mapPrescription(rx);
  } catch (err) {
    handleError(err, 'Failed creating prescription');
    return null;
  }
}

export async function updatePrescriptionStatus(prescriptionId: string, status: PrescriptionStatus): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase.from('prescriptions').update({ status }).eq('id', prescriptionId);
    if (error) throw error;
    await insertLog(await currentUserId(), `Prescription ${prescriptionId} status set to ${status}`);
    return true;
  } catch (err) {
    handleError(err, 'Failed updating prescription status');
    return false;
  }
}

// ==========================================
// DISPENSING
// ==========================================

export async function fetchDispensingRecords(limit = 100): Promise<DispensingRecord[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from('dispensing_records')
      .select('*, medicines(name), medicine_batches(batch_number), customers(name), users(name)')
      .order('dispensed_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapDispensingRecord);
  } catch (err) {
    handleError(err, 'Failed fetching dispensing records');
    return [];
  }
}

/**
 * Dispense stock from a specific batch. Server-side trigger
 * (`process_dispensing_deduction`) validates the batch isn't expired,
 * deducts its quantity, and — if `prescription_item_id` is set — advances
 * the parent prescription's fulfillment status automatically.
 */
export async function dispenseMedicine(record: {
  medicine_id: string;
  batch_id: string;
  quantity: number;
  unit_price: number;
  prescription_id?: string | null;
  prescription_item_id?: string | null;
  customer_id?: string | null;
  notes?: string;
}): Promise<DispensingRecord | string> {
  if (!isSupabaseConfigured) return 'Pharmacy dispensing requires a connected Supabase project.';
  try {
    const organization_id = await getCurrentOrganizationId();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('dispensing_records')
      .insert([{ ...record, organization_id, dispensed_by: user?.id }])
      .select('*, medicines(name), medicine_batches(batch_number), customers(name), users(name)')
      .single();

    if (error) throw error;

    await insertLog(user?.id ?? null, `Dispensed ${record.quantity} unit(s) of medicine ${record.medicine_id}`);
    return mapDispensingRecord(data);
  } catch (err: any) {
    handleError(err, 'Failed dispensing medicine');
    return err?.message || 'Unable to dispense — check batch stock and expiry.';
  }
}
