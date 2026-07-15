import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Pill, Plus, Search, AlertTriangle, Check, RefreshCw, PackagePlus,
  Stethoscope, ClipboardList, History, X, ShieldAlert, ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  fetchMedicines, insertMedicine, fetchMedicineBatches, fetchExpiringBatches,
  receiveMedicineBatch, fetchPrescriptions, createPrescription,
  fetchDispensingRecords, dispenseMedicine,
} from '../services/pharmacy';
import { fetchCustomers } from '../services/supabase';
import {
  Medicine, MedicineBatch, Prescription, DispensingRecord, Customer,
  MedicineDosageForm,
} from '../types';
import { formatCurrency } from '../utils/format';

interface PharmacyProps {
  userRole: string;
}

type PharmacyTab = 'catalog' | 'batches' | 'prescriptions' | 'log';

// Carries prescription linkage into the dispense flow when it's opened from
// a prescription item, so the server-side trigger can advance
// quantity_dispensed / prescription status (see database/migrations/
// 002_pharmacy_module.sql — it only does that when both ids are present).
interface DispensingTarget {
  medicine: Medicine;
  prescriptionId?: string;
  prescriptionItemId?: string;
  maxQuantity?: number;
}

const TABS: { id: PharmacyTab; label: string; icon: React.ElementType }[] = [
  { id: 'catalog',       label: 'Medicine Catalog', icon: Pill },
  { id: 'batches',       label: 'Stock & Expiry',   icon: PackagePlus },
  { id: 'prescriptions', label: 'Prescriptions',    icon: Stethoscope },
  { id: 'log',           label: 'Dispensing Log',   icon: History },
];

const DOSAGE_FORMS: MedicineDosageForm[] = [
  'TABLET', 'CAPSULE', 'SYRUP', 'INJECTION', 'OINTMENT',
  'DROPS', 'INHALER', 'CREAM', 'POWDER', 'OTHER',
];

function StockPill({ m }: { m: Medicine }) {
  if (m.stock_status === 'OUT_OF_STOCK') {
    return <span className="dm-badge dm-badge-danger"><AlertTriangle style={{ width: 12, height: 12 }} /> Out of stock</span>;
  }
  if (m.stock_status === 'LOW_STOCK') {
    return <span className="dm-badge dm-badge-warning"><AlertTriangle style={{ width: 12, height: 12 }} /> {m.total_quantity} · Low</span>;
  }
  return <span className="dm-badge dm-badge-success"><Check style={{ width: 12, height: 12 }} /> {m.total_quantity ?? 0} in stock</span>;
}

function ExpiryPill({ b }: { b: MedicineBatch }) {
  const level = b.alert_level ?? 'OK';
  if (level === 'EXPIRED') return <span className="dm-badge dm-badge-danger"><AlertTriangle style={{ width: 12, height: 12 }} /> Expired</span>;
  if (level === 'CRITICAL') return <span className="dm-badge dm-badge-danger"><AlertTriangle style={{ width: 12, height: 12 }} /> {b.days_until_expiry}d left</span>;
  if (level === 'WARNING') return <span className="dm-badge dm-badge-warning"><AlertTriangle style={{ width: 12, height: 12 }} /> {b.days_until_expiry}d left</span>;
  return <span className="dm-badge dm-badge-neutral">{new Date(b.expiry_date).toLocaleDateString()}</span>;
}

function PrescriptionStatusPill({ status }: { status: Prescription['status'] }) {
  if (status === 'DISPENSED') return <span className="dm-badge dm-badge-success"><Check style={{ width: 12, height: 12 }} /> Dispensed</span>;
  if (status === 'PARTIALLY_DISPENSED') return <span className="dm-badge dm-badge-warning">Partial</span>;
  if (status === 'CANCELLED') return <span className="dm-badge dm-badge-neutral">Cancelled</span>;
  return <span className="dm-badge dm-badge-info">Pending</span>;
}

export default function Pharmacy({ userRole }: PharmacyProps) {
  const [activeTab, setActiveTab] = useState<PharmacyTab>('catalog');
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [batches, setBatches] = useState<MedicineBatch[]>([]);
  const [expiring, setExpiring] = useState<MedicineBatch[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [dispensingLog, setDispensingLog] = useState<DispensingRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const canManage = userRole === 'ADMIN' || userRole === 'STAFF';

  // ---- modals ----
  const [isAddingMedicine, setIsAddingMedicine] = useState(false);
  const [isReceivingStock, setIsReceivingStock] = useState(false);
  const [isDispensing, setIsDispensing] = useState<DispensingTarget | null>(null);
  const [isNewPrescription, setIsNewPrescription] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [m, b, exp, rx, log, cust] = await Promise.all([
        fetchMedicines(), fetchMedicineBatches(), fetchExpiringBatches(),
        fetchPrescriptions(), fetchDispensingRecords(), fetchCustomers(),
      ]);
      setMedicines(m); setBatches(b); setExpiring(exp);
      setPrescriptions(rx); setDispensingLog(log); setCustomers(cust);
    } catch (err) {
      console.error('Failed loading pharmacy data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const filteredMedicines = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return medicines.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.generic_name ?? '').toLowerCase().includes(q) ||
      (m.category ?? '').toLowerCase().includes(q)
    );
  }, [medicines, searchQuery]);

  const criticalExpiring = expiring.filter(b => b.alert_level === 'EXPIRED' || b.alert_level === 'CRITICAL');

  return (
    <div className="space-y-6 dm-animate-in" id="pharmacy-tab">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="dm-h1">Pharmacy</h1>
          <p style={{ color: 'var(--text-mid)', fontSize: '0.875rem', marginTop: 4 }}>
            Medicine catalog, batch/lot expiry tracking, prescriptions and dispensing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadAll} className="dm-icon-btn" title="Refresh">
            <RefreshCw style={{ width: 16, height: 16 }} className={loading ? 'dm-spin' : ''} />
          </button>
          {canManage && activeTab === 'catalog' && (
            <button onClick={() => setIsAddingMedicine(true)} className="dm-btn dm-btn-primary">
              <Plus style={{ width: 16, height: 16 }} /> Add medicine
            </button>
          )}
          {canManage && activeTab === 'batches' && (
            <button onClick={() => setIsReceivingStock(true)} className="dm-btn dm-btn-primary">
              <PackagePlus style={{ width: 16, height: 16 }} /> Receive stock
            </button>
          )}
          {canManage && activeTab === 'prescriptions' && (
            <button onClick={() => setIsNewPrescription(true)} className="dm-btn dm-btn-primary">
              <Plus style={{ width: 16, height: 16 }} /> New prescription
            </button>
          )}
        </div>
      </div>

      {/* Expiry alert banner */}
      {criticalExpiring.length > 0 && (
        <div className="dm-card p-4 flex items-start gap-3" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,107,107,0.30)' }}>
          <ShieldAlert style={{ width: 18, height: 18, color: 'var(--danger)', flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 600, color: 'var(--danger)', fontSize: '0.85rem' }}>
              {criticalExpiring.length} batch{criticalExpiring.length > 1 ? 'es' : ''} expired or expiring within 30 days
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-mid)', marginTop: 2 }}>
              {criticalExpiring.slice(0, 3).map(b => `${b.medicine_name} (${b.batch_number})`).join(', ')}
              {criticalExpiring.length > 3 ? ` +${criticalExpiring.length - 3} more` : ''} — check Stock &amp; Expiry.
            </div>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="dm-scroll-x flex gap-2">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`dm-badge ${active ? 'dm-badge-info' : 'dm-badge-neutral'}`}
              style={{ padding: '0.5rem 0.9rem', fontSize: '0.78rem', cursor: 'pointer', flexShrink: 0 }}
            >
              <Icon style={{ width: 13, height: 13 }} /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* ---- CATALOG ---- */}
      {activeTab === 'catalog' && (
        <>
          <div className="dm-card p-4">
            <div className="relative w-full md:max-w-md">
              <Search style={{ width: 16, height: 16, color: 'var(--text-low)', position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
              <input type="text" className="dm-input" style={{ paddingLeft: '2.5rem' }} placeholder="Search by name, generic name or category…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
          </div>

          <div className="dm-card" style={{ overflow: 'hidden' }}>
            {loading ? (
              <div className="p-4 space-y-2">{[0, 1, 2, 3].map(i => <div key={i} className="dm-skeleton" style={{ height: 52 }} />)}</div>
            ) : filteredMedicines.length > 0 ? (
              <div className="dm-scroll-x">
                <table className="w-full text-left" style={{ borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--panel-line)' }}>
                      <th className="dm-label" style={{ padding: '12px 16px' }}>Medicine</th>
                      <th className="dm-label" style={{ padding: '12px 16px' }}>Form</th>
                      <th className="dm-label" style={{ padding: '12px 16px' }}>Flags</th>
                      <th className="dm-label dm-num-cell" style={{ padding: '12px 16px' }}>Price</th>
                      <th className="dm-label" style={{ padding: '12px 16px' }}>Stock</th>
                      {canManage && <th className="dm-label dm-num-cell" style={{ padding: '12px 16px' }}>Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMedicines.map(m => (
                      <tr key={m.id} style={{ borderBottom: '1px solid var(--panel-line)' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-hi)' }}>{m.name}{m.strength ? ` · ${m.strength}` : ''}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-low)', marginTop: 2 }}>{m.generic_name || m.category || '—'}</div>
                        </td>
                        <td style={{ padding: '12px 16px' }}><span className="dm-badge dm-badge-neutral">{m.dosage_form}</span></td>
                        <td style={{ padding: '12px 16px' }}>
                          <div className="flex gap-1.5 flex-wrap">
                            {m.requires_prescription && <span className="dm-badge dm-badge-info">Rx</span>}
                            {m.controlled_substance && <span className="dm-badge dm-badge-danger">Controlled</span>}
                          </div>
                        </td>
                        <td className="dm-num-cell dm-nums" style={{ padding: '12px 16px', color: 'var(--text-hi)', fontWeight: 600 }}>{formatCurrency(m.selling_price, { symbol: false })}</td>
                        <td style={{ padding: '12px 16px' }}><StockPill m={m} /></td>
                        {canManage && (
                          <td className="dm-num-cell" style={{ padding: '12px 16px' }}>
                            <button
                              onClick={() => setIsDispensing({ medicine: m })}
                              disabled={(m.total_quantity ?? 0) <= 0}
                              className="dm-btn dm-btn-ghost" style={{ minHeight: 34, padding: '0 0.75rem' }}
                            >
                              Dispense
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={Pill} title="No medicines yet" subtitle="Add your first medicine to the catalog to start tracking stock." />
            )}
          </div>
        </>
      )}

      {/* ---- BATCHES / EXPIRY ---- */}
      {activeTab === 'batches' && (
        <div className="dm-card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div className="p-4 space-y-2">{[0, 1, 2].map(i => <div key={i} className="dm-skeleton" style={{ height: 52 }} />)}</div>
          ) : batches.length > 0 ? (
            <div className="dm-scroll-x">
              <table className="w-full text-left" style={{ borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--panel-line)' }}>
                    <th className="dm-label" style={{ padding: '12px 16px' }}>Medicine</th>
                    <th className="dm-label" style={{ padding: '12px 16px' }}>Batch</th>
                    <th className="dm-label dm-num-cell" style={{ padding: '12px 16px' }}>Qty</th>
                    <th className="dm-label" style={{ padding: '12px 16px' }}>Supplier</th>
                    <th className="dm-label" style={{ padding: '12px 16px' }}>Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map(b => (
                    <tr key={b.id} style={{ borderBottom: '1px solid var(--panel-line)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-hi)' }}>{b.medicine_name}</td>
                      <td className="dm-nums" style={{ padding: '12px 16px', color: 'var(--text-mid)' }}>{b.batch_number}</td>
                      <td className="dm-num-cell dm-nums" style={{ padding: '12px 16px' }}>{b.quantity}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-mid)' }}>{b.supplier || '—'}</td>
                      <td style={{ padding: '12px 16px' }}>
                        {expiring.find(e => e.id === b.id) ? <ExpiryPill b={expiring.find(e => e.id === b.id)!} /> : <span className="dm-badge dm-badge-neutral">{new Date(b.expiry_date).toLocaleDateString()}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={PackagePlus} title="No stock received yet" subtitle="Receive a batch to start tracking quantity and expiry by lot." />
          )}
        </div>
      )}

      {/* ---- PRESCRIPTIONS ---- */}
      {activeTab === 'prescriptions' && (
        <div className="dm-card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div className="p-4 space-y-2">{[0, 1, 2].map(i => <div key={i} className="dm-skeleton" style={{ height: 60 }} />)}</div>
          ) : prescriptions.length > 0 ? (
            <div className="divide-y" style={{ borderColor: 'var(--panel-line)' }}>
              {prescriptions.map(rx => (
                <div key={rx.id} className="p-4 flex flex-col gap-2" style={{ borderBottom: '1px solid var(--panel-line)' }}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-hi)', fontSize: '0.9rem' }}>{rx.patient_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-low)', marginTop: 2 }}>
                        {rx.prescribing_doctor ? `${rx.prescribing_doctor} · ` : ''}{new Date(rx.issued_date).toLocaleDateString()}
                        {rx.diagnosis ? ` · ${rx.diagnosis}` : ''}
                      </div>
                    </div>
                    <PrescriptionStatusPill status={rx.status} />
                  </div>
                  <div className="flex flex-col gap-1.5 mt-1">
                    {(rx.items ?? []).map(item => (
                      <div key={item.id} className="flex items-center justify-between gap-3" style={{ fontSize: '0.8rem' }}>
                        <span style={{ color: 'var(--text-mid)' }}>
                          {item.medicine_name} — {item.quantity_dispensed}/{item.quantity_prescribed} dispensed
                          {item.dosage_instructions ? <span style={{ color: 'var(--text-low)' }}> · {item.dosage_instructions}</span> : null}
                        </span>
                        {canManage && item.quantity_dispensed < item.quantity_prescribed && (
                          <button
                            onClick={() => {
                              const med = medicines.find(m => m.id === item.medicine_id);
                              if (med) setIsDispensing({
                                medicine: med,
                                prescriptionId: rx.id,
                                prescriptionItemId: item.id,
                                maxQuantity: item.quantity_prescribed - item.quantity_dispensed,
                              });
                            }}
                            className="dm-btn dm-btn-ghost" style={{ minHeight: 28, padding: '0 0.6rem', fontSize: '0.72rem' }}
                          >
                            Dispense <ChevronRight style={{ width: 12, height: 12 }} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Stethoscope} title="No prescriptions logged" subtitle="Log a prescription to track fulfillment against the dispensing ledger." />
          )}
        </div>
      )}

      {/* ---- DISPENSING LOG ---- */}
      {activeTab === 'log' && (
        <div className="dm-card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div className="p-4 space-y-2">{[0, 1, 2].map(i => <div key={i} className="dm-skeleton" style={{ height: 52 }} />)}</div>
          ) : dispensingLog.length > 0 ? (
            <div className="dm-scroll-x">
              <table className="w-full text-left" style={{ borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--panel-line)' }}>
                    <th className="dm-label" style={{ padding: '12px 16px' }}>Medicine</th>
                    <th className="dm-label dm-num-cell" style={{ padding: '12px 16px' }}>Qty</th>
                    <th className="dm-label dm-num-cell" style={{ padding: '12px 16px' }}>Total</th>
                    <th className="dm-label" style={{ padding: '12px 16px' }}>Customer</th>
                    <th className="dm-label" style={{ padding: '12px 16px' }}>Dispensed by</th>
                    <th className="dm-label" style={{ padding: '12px 16px' }}>When</th>
                  </tr>
                </thead>
                <tbody>
                  {dispensingLog.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--panel-line)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-hi)' }}>{r.medicine_name}</td>
                      <td className="dm-num-cell dm-nums" style={{ padding: '12px 16px' }}>{r.quantity}</td>
                      <td className="dm-num-cell dm-nums" style={{ padding: '12px 16px', color: 'var(--text-hi)', fontWeight: 600 }}>{formatCurrency(r.total_price, { symbol: false })}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-mid)' }}>{r.customer_name || 'Walk-in'}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-mid)' }}>{r.dispensed_by_name || '—'}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-low)', fontSize: '0.78rem' }}>{new Date(r.dispensed_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={History} title="No dispensing activity yet" subtitle="Every unit handed to a customer — prescribed or over-the-counter — appears here." />
          )}
        </div>
      )}

      {/* ---- Modals ---- */}
      <AnimatePresence>
        {isAddingMedicine && (
          <AddMedicineModal
            onClose={() => setIsAddingMedicine(false)}
            onSaved={() => { setIsAddingMedicine(false); loadAll(); }}
          />
        )}
        {isReceivingStock && (
          <ReceiveStockModal
            medicines={medicines}
            onClose={() => setIsReceivingStock(false)}
            onSaved={() => { setIsReceivingStock(false); loadAll(); }}
          />
        )}
        {isDispensing && (
          <DispenseModal
            medicine={isDispensing.medicine}
            prescriptionId={isDispensing.prescriptionId}
            prescriptionItemId={isDispensing.prescriptionItemId}
            defaultQuantity={isDispensing.maxQuantity}
            customers={customers}
            onClose={() => setIsDispensing(null)}
            onSaved={() => { setIsDispensing(null); loadAll(); }}
          />
        )}
        {isNewPrescription && (
          <NewPrescriptionModal
            medicines={medicines}
            customers={customers}
            onClose={() => setIsNewPrescription(false)}
            onSaved={() => { setIsNewPrescription(false); loadAll(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- Empty state -------------------------------------------------------------

function EmptyState({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-12" style={{ color: 'var(--text-low)' }}>
      <Icon style={{ width: 40, height: 40, opacity: 0.6, marginBottom: 10 }} />
      <h3 style={{ color: 'var(--text-mid)', fontWeight: 600, fontSize: '0.9rem' }}>{title}</h3>
      <p style={{ fontSize: '0.8rem', maxWidth: 340, marginTop: 4 }}>{subtitle}</p>
    </div>
  );
}

// ---- Shared dark modal shell --------------------------------------------------

function ModalShell({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  // Portal straight to <body>: the page root this modal would otherwise
  // render inside carries a Framer Motion transform (for the page-transition
  // animation), and any transformed ancestor becomes the containing block
  // for `position: fixed` descendants — so without a portal this modal gets
  // sized/centered against the page's own content height instead of the
  // viewport, clipping its top on short pages (e.g. an empty catalog).
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(7,11,36,0.6)', backdropFilter: 'blur(4px)' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        onClick={e => e.stopPropagation()}
        className="w-full p-6"
        style={{ maxWidth: wide ? 560 : 420, maxHeight: '88vh', overflowY: 'auto', background: 'var(--panel)', border: '1px solid var(--panel-line-strong)', borderRadius: 'var(--r-card)', boxShadow: 'var(--shadow-modal)' }}
        role="dialog" aria-modal="true"
      >
        {children}
      </motion.div>
    </motion.div>,
    document.body
  );
}

// ---- Add medicine modal -------------------------------------------------------

function AddMedicineModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [genericName, setGenericName] = useState('');
  const [dosageForm, setDosageForm] = useState<MedicineDosageForm>('TABLET');
  const [strength, setStrength] = useState('');
  const [unit, setUnit] = useState('Tablet');
  const [category, setCategory] = useState('');
  const [requiresRx, setRequiresRx] = useState(false);
  const [controlled, setControlled] = useState(false);
  const [reorderLevel, setReorderLevel] = useState(10);
  const [buyingPrice, setBuyingPrice] = useState(0);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const result = await insertMedicine({
        name, generic_name: genericName || undefined, dosage_form: dosageForm,
        strength: strength || undefined, unit, category: category || undefined,
        requires_prescription: requiresRx, controlled_substance: controlled,
        reorder_level: reorderLevel, buying_price: buyingPrice, selling_price: sellingPrice,
      });
      if (result) onSaved();
      else setError("Couldn't save medicine. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose} wide>
      <h3 className="dm-h2">New medicine</h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-mid)', marginTop: 4, marginBottom: 16 }}>Add a drug to the pharmacy catalog.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="dm-label" style={{ padding: 0 }}>Name</label>
            <input required className="dm-input" style={{ marginTop: 6 }} placeholder="e.g. Paracetamol" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="dm-label" style={{ padding: 0 }}>Generic name</label>
            <input className="dm-input" style={{ marginTop: 6 }} value={genericName} onChange={e => setGenericName(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="dm-label" style={{ padding: 0 }}>Dosage form</label>
            <select className="dm-select" style={{ marginTop: 6 }} value={dosageForm} onChange={e => setDosageForm(e.target.value as MedicineDosageForm)}>
              {DOSAGE_FORMS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="dm-label" style={{ padding: 0 }}>Strength</label>
            <input className="dm-input" style={{ marginTop: 6 }} placeholder="500mg" value={strength} onChange={e => setStrength(e.target.value)} />
          </div>
          <div>
            <label className="dm-label" style={{ padding: 0 }}>Unit</label>
            <input className="dm-input" style={{ marginTop: 6 }} placeholder="Tablet" value={unit} onChange={e => setUnit(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="dm-label" style={{ padding: 0 }}>Therapeutic category</label>
          <input className="dm-input" style={{ marginTop: 6 }} placeholder="e.g. Antibiotic" value={category} onChange={e => setCategory(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="dm-label" style={{ padding: 0 }}>Buy price</label>
            <input type="number" min={0} step="0.01" className="dm-input" style={{ marginTop: 6 }} value={buyingPrice} onChange={e => setBuyingPrice(parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <label className="dm-label" style={{ padding: 0 }}>Sell price</label>
            <input type="number" min={0} step="0.01" className="dm-input" style={{ marginTop: 6 }} value={sellingPrice} onChange={e => setSellingPrice(parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <label className="dm-label" style={{ padding: 0 }}>Reorder at</label>
            <input type="number" min={0} className="dm-input" style={{ marginTop: 6 }} value={reorderLevel} onChange={e => setReorderLevel(parseInt(e.target.value) || 0)} />
          </div>
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2" style={{ fontSize: '0.82rem', color: 'var(--text-mid)' }}>
            <input type="checkbox" checked={requiresRx} onChange={e => setRequiresRx(e.target.checked)} style={{ accentColor: '#4C6FFF', width: 16, height: 16 }} /> Requires prescription
          </label>
          <label className="flex items-center gap-2" style={{ fontSize: '0.82rem', color: 'var(--text-mid)' }}>
            <input type="checkbox" checked={controlled} onChange={e => setControlled(e.target.checked)} style={{ accentColor: '#4C6FFF', width: 16, height: 16 }} /> Controlled substance
          </label>
        </div>
        {error && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,107,107,0.3)', fontSize: '0.78rem', color: 'var(--danger)' }} role="alert">
            <AlertTriangle style={{ width: 15, height: 15, flexShrink: 0 }} /><span>{error}</span>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="dm-btn dm-btn-ghost flex-1">Cancel</button>
          <button type="submit" disabled={saving} className="dm-btn dm-btn-primary flex-1">{saving ? <RefreshCw style={{ width: 15, height: 15 }} className="dm-spin" /> : 'Add medicine'}</button>
        </div>
      </form>
    </ModalShell>
  );
}

// ---- Receive stock modal -------------------------------------------------------

function ReceiveStockModal({ medicines, onClose, onSaved }: { medicines: Medicine[]; onClose: () => void; onSaved: () => void }) {
  const [medicineId, setMedicineId] = useState(medicines[0]?.id ?? '');
  const [batchNumber, setBatchNumber] = useState('');
  const [quantity, setQuantity] = useState(50);
  const [expiryDate, setExpiryDate] = useState('');
  const [supplier, setSupplier] = useState('');
  const [costPrice, setCostPrice] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!medicineId || !batchNumber.trim() || !expiryDate) return;
    setSaving(true);
    setError('');
    try {
      const result = await receiveMedicineBatch({
        medicine_id: medicineId, batch_number: batchNumber, quantity,
        expiry_date: expiryDate, supplier: supplier || undefined, cost_price: costPrice,
      });
      if (result) onSaved();
      else setError("Couldn't receive stock. Check the batch number is unique for this medicine.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <h3 className="dm-h2">Receive stock</h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-mid)', marginTop: 4, marginBottom: 16 }}>Log a new batch with its expiry date.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="dm-label" style={{ padding: 0 }}>Medicine</label>
          <select required className="dm-select" style={{ marginTop: 6 }} value={medicineId} onChange={e => setMedicineId(e.target.value)}>
            {medicines.map(m => <option key={m.id} value={m.id}>{m.name}{m.strength ? ` · ${m.strength}` : ''}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="dm-label" style={{ padding: 0 }}>Batch number</label>
            <input required className="dm-input" style={{ marginTop: 6 }} value={batchNumber} onChange={e => setBatchNumber(e.target.value)} />
          </div>
          <div>
            <label className="dm-label" style={{ padding: 0 }}>Quantity</label>
            <input type="number" required min={1} className="dm-input" style={{ marginTop: 6 }} value={quantity} onChange={e => setQuantity(parseInt(e.target.value) || 0)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="dm-label" style={{ padding: 0 }}>Expiry date</label>
            <input type="date" required className="dm-input" style={{ marginTop: 6 }} value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
          </div>
          <div>
            <label className="dm-label" style={{ padding: 0 }}>Cost / unit</label>
            <input type="number" min={0} step="0.01" className="dm-input" style={{ marginTop: 6 }} value={costPrice} onChange={e => setCostPrice(parseFloat(e.target.value) || 0)} />
          </div>
        </div>
        <div>
          <label className="dm-label" style={{ padding: 0 }}>Supplier</label>
          <input className="dm-input" style={{ marginTop: 6 }} value={supplier} onChange={e => setSupplier(e.target.value)} />
        </div>
        {error && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,107,107,0.3)', fontSize: '0.78rem', color: 'var(--danger)' }} role="alert">
            <AlertTriangle style={{ width: 15, height: 15, flexShrink: 0 }} /><span>{error}</span>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="dm-btn dm-btn-ghost flex-1">Cancel</button>
          <button type="submit" disabled={saving || medicines.length === 0} className="dm-btn dm-btn-primary flex-1">{saving ? <RefreshCw style={{ width: 15, height: 15 }} className="dm-spin" /> : 'Receive'}</button>
        </div>
      </form>
    </ModalShell>
  );
}

// ---- Dispense modal -------------------------------------------------------------

function DispenseModal({ medicine, prescriptionId, prescriptionItemId, defaultQuantity, customers, onClose, onSaved }: {
  medicine: Medicine; prescriptionId?: string; prescriptionItemId?: string; defaultQuantity?: number;
  customers: Customer[]; onClose: () => void; onSaved: () => void;
}) {
  const [batches, setBatches] = useState<MedicineBatch[]>([]);
  const [batchId, setBatchId] = useState('');
  const [quantity, setQuantity] = useState(defaultQuantity && defaultQuantity > 0 ? defaultQuantity : 1);
  const [unitPrice, setUnitPrice] = useState(medicine.selling_price);
  const [customerId, setCustomerId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchMedicineBatches(medicine.id).then(list => {
      setBatches(list);
      if (list.length > 0) setBatchId(list[0].id);
    });
  }, [medicine.id]);

  const selectedBatch = batches.find(b => b.id === batchId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchId || quantity <= 0) return;
    setSaving(true);
    setError('');
    try {
      const result = await dispenseMedicine({
        medicine_id: medicine.id, batch_id: batchId, quantity, unit_price: unitPrice,
        customer_id: customerId || null,
        prescription_id: prescriptionId || null,
        prescription_item_id: prescriptionItemId || null,
      });
      if (typeof result === 'string') setError(result);
      else onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <span className="dm-badge dm-badge-info"><Pill style={{ width: 12, height: 12 }} /> Dispense</span>
      {prescriptionItemId && (
        <span className="dm-badge dm-badge-success" style={{ marginLeft: 6 }}>Linked to prescription</span>
      )}
      <h3 className="dm-h2" style={{ marginTop: 10 }}>{medicine.name}{medicine.strength ? ` · ${medicine.strength}` : ''}</h3>
      {medicine.requires_prescription && !prescriptionItemId && (
        <p style={{ fontSize: '0.78rem', color: 'var(--warning)', marginTop: 4 }}>Prescription-only medicine — confirm the customer has a valid prescription.</p>
      )}
      <form onSubmit={handleSubmit} className="space-y-4 mt-3">
        <div>
          <label className="dm-label" style={{ padding: 0 }}>Batch (earliest expiry first)</label>
          <select required className="dm-select" style={{ marginTop: 6 }} value={batchId} onChange={e => setBatchId(e.target.value)}>
            {batches.map(b => (
              <option key={b.id} value={b.id}>{b.batch_number} — {b.quantity} units — exp {new Date(b.expiry_date).toLocaleDateString()}</option>
            ))}
          </select>
          {batches.length === 0 && <p style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: 4 }}>No stock available for this medicine.</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="dm-label flex justify-between" style={{ padding: 0 }}>
              <span>Quantity</span>
              {selectedBatch && (
                <span className="dm-nums" style={{ textTransform: 'none', letterSpacing: 0 }}>
                  {selectedBatch.quantity} available{defaultQuantity ? ` · ${defaultQuantity} prescribed` : ''}
                </span>
              )}
            </label>
            <input
              type="number" required min={1}
              max={defaultQuantity ? Math.min(selectedBatch?.quantity ?? defaultQuantity, defaultQuantity) : selectedBatch?.quantity}
              className="dm-input" style={{ marginTop: 6 }} value={quantity}
              onChange={e => setQuantity(parseInt(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="dm-label" style={{ padding: 0 }}>Unit price</label>
            <input type="number" min={0} step="0.01" className="dm-input" style={{ marginTop: 6 }} value={unitPrice} onChange={e => setUnitPrice(parseFloat(e.target.value) || 0)} />
          </div>
        </div>
        <div>
          <label className="dm-label" style={{ padding: 0 }}>Customer (optional)</label>
          <select className="dm-select" style={{ marginTop: 6 }} value={customerId} onChange={e => setCustomerId(e.target.value)}>
            <option value="">Walk-in customer</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex justify-between items-center px-1" style={{ fontSize: '0.85rem' }}>
          <span style={{ color: 'var(--text-mid)' }}>Total</span>
          <span className="dm-nums" style={{ fontWeight: 700, color: 'var(--text-hi)' }}>{formatCurrency(quantity * unitPrice)}</span>
        </div>
        {error && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,107,107,0.3)', fontSize: '0.78rem', color: 'var(--danger)' }} role="alert">
            <AlertTriangle style={{ width: 15, height: 15, flexShrink: 0 }} /><span>{error}</span>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="dm-btn dm-btn-ghost flex-1">Cancel</button>
          <button type="submit" disabled={saving || batches.length === 0} className="dm-btn dm-btn-primary flex-1">{saving ? <RefreshCw style={{ width: 15, height: 15 }} className="dm-spin" /> : 'Confirm dispense'}</button>
        </div>
      </form>
    </ModalShell>
  );
}

// ---- New prescription modal ------------------------------------------------------

interface DraftItem { medicine_id: string; quantity_prescribed: number; dosage_instructions: string }

function NewPrescriptionModal({ medicines, customers, onClose, onSaved }: {
  medicines: Medicine[]; customers: Customer[]; onClose: () => void; onSaved: () => void;
}) {
  const [patientName, setPatientName] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [doctor, setDoctor] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [items, setItems] = useState<DraftItem[]>([{ medicine_id: medicines[0]?.id ?? '', quantity_prescribed: 1, dosage_instructions: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateItem = (idx: number, patch: Partial<DraftItem>) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const addItem = () => setItems(prev => [...prev, { medicine_id: medicines[0]?.id ?? '', quantity_prescribed: 1, dosage_instructions: '' }]);
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientName.trim() || items.length === 0) return;
    setSaving(true);
    setError('');
    try {
      const result = await createPrescription(
        { customer_id: customerId || null, patient_name: patientName, prescribing_doctor: doctor || undefined, diagnosis: diagnosis || undefined },
        items.filter(i => i.medicine_id && i.quantity_prescribed > 0).map(i => ({ medicine_id: i.medicine_id, quantity_prescribed: i.quantity_prescribed, dosage_instructions: i.dosage_instructions || undefined }))
      );
      if (result) onSaved();
      else setError("Couldn't save prescription. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose} wide>
      <h3 className="dm-h2">New prescription</h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-mid)', marginTop: 4, marginBottom: 16 }}>Log what was prescribed, then dispense against it as items are filled.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="dm-label" style={{ padding: 0 }}>Patient name</label>
            <input required className="dm-input" style={{ marginTop: 6 }} value={patientName} onChange={e => setPatientName(e.target.value)} />
          </div>
          <div>
            <label className="dm-label" style={{ padding: 0 }}>Link to customer (optional)</label>
            <select className="dm-select" style={{ marginTop: 6 }} value={customerId} onChange={e => setCustomerId(e.target.value)}>
              <option value="">None</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="dm-label" style={{ padding: 0 }}>Prescribing doctor</label>
            <input className="dm-input" style={{ marginTop: 6 }} value={doctor} onChange={e => setDoctor(e.target.value)} />
          </div>
          <div>
            <label className="dm-label" style={{ padding: 0 }}>Diagnosis</label>
            <input className="dm-input" style={{ marginTop: 6 }} value={diagnosis} onChange={e => setDiagnosis(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="dm-label" style={{ padding: 0 }}>Items</label>
          <div className="space-y-2 mt-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <select className="dm-select" style={{ flex: 2 }} value={item.medicine_id} onChange={e => updateItem(idx, { medicine_id: e.target.value })}>
                  {medicines.map(m => <option key={m.id} value={m.id}>{m.name}{m.strength ? ` · ${m.strength}` : ''}</option>)}
                </select>
                <input type="number" min={1} className="dm-input" style={{ flex: 1 }} placeholder="Qty" value={item.quantity_prescribed} onChange={e => updateItem(idx, { quantity_prescribed: parseInt(e.target.value) || 0 })} />
                <input className="dm-input" style={{ flex: 2 }} placeholder="Dosage instructions" value={item.dosage_instructions} onChange={e => updateItem(idx, { dosage_instructions: e.target.value })} />
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(idx)} className="dm-icon-btn" style={{ width: 38, height: 38, flexShrink: 0 }} aria-label="Remove item">
                    <X style={{ width: 14, height: 14 }} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={addItem} className="dm-btn dm-btn-ghost mt-2" style={{ minHeight: 36 }}>
            <Plus style={{ width: 14, height: 14 }} /> Add another medicine
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,107,107,0.3)', fontSize: '0.78rem', color: 'var(--danger)' }} role="alert">
            <AlertTriangle style={{ width: 15, height: 15, flexShrink: 0 }} /><span>{error}</span>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="dm-btn dm-btn-ghost flex-1">Cancel</button>
          <button type="submit" disabled={saving || medicines.length === 0} className="dm-btn dm-btn-primary flex-1">
            {saving ? <RefreshCw style={{ width: 15, height: 15 }} className="dm-spin" /> : <ClipboardList style={{ width: 15, height: 15 }} />} Save prescription
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
