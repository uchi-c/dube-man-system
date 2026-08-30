import React, { useEffect, useState } from 'react';
import {
  Building2, RefreshCw, Plus, X, Check, Copy, AlertCircle,
  KeyRound, Wallet, History as HistoryIcon, Users as UsersIcon,
  BellRing, Phone, Pencil,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import DataTable from '../components/DataTable';
import {
  listTenantsBilling, createTenant, updateTenantBilling,
  recordTenantPayment, listTenantPayments,
  getPlatformPaymentInstructions, updatePlatformPaymentInstructions,
} from '../services/organizations';
import { BusinessType, SubscriptionStatus, TenantBilling, TenantPayment } from '../types';

// Suggested starting prices per business type — a flat monthly fee, edited
// freely per tenant either here or in the Add-tenant form. Not a plans
// catalog, just a sensible default so the platform admin isn't starting
// from a blank field every time.
const SUGGESTED_PRICE: Record<BusinessType, number> = {
  general: 15,
  retail: 15,
  cafe: 20,
  printing: 20,
  pharmacy: 35,
};

const BUSINESS_TYPE_OPTIONS: { value: BusinessType; label: string }[] = [
  { value: 'general',  label: 'General dealer' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'cafe',     label: 'Internet café' },
  { value: 'printing', label: 'Printing' },
  { value: 'retail',   label: 'Retail' },
];

const STATUS_OPTIONS: { value: SubscriptionStatus; label: string }[] = [
  { value: 'trialing',  label: 'Trialing' },
  { value: 'active',    label: 'Active' },
  { value: 'past_due',  label: 'Past due' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_BADGE: Record<SubscriptionStatus, string> = {
  trialing: 'dm-badge-neutral',
  active: 'dm-badge-success',
  past_due: 'dm-badge-warning',
  suspended: 'dm-badge-danger',
  cancelled: 'dm-badge-neutral',
};

const statusLabel = (s: SubscriptionStatus) => STATUS_OPTIONS.find(o => o.value === s)?.label ?? s;

function formatMoney(amount: number | null, currency: string): string {
  if (amount === null || amount === undefined) return '—';
  return `${currency} ${amount.toFixed(2)}`;
}

// Days out that count as "approaching due" rather than merely upcoming.
const DUE_SOON_DAYS = 5;

function daysUntilDue(t: TenantBilling): number | null {
  if (!t.next_payment_due) return null;
  const ms = new Date(t.next_payment_due).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function isOverdue(t: TenantBilling): boolean {
  if (t.subscription_status === 'cancelled') return false;
  const days = daysUntilDue(t);
  return days !== null && days < 0;
}

function isDueSoon(t: TenantBilling): boolean {
  if (t.subscription_status === 'cancelled') return false;
  const days = daysUntilDue(t);
  return days !== null && days >= 0 && days <= DUE_SOON_DAYS;
}

function hasPendingPayment(t: TenantBilling): boolean {
  return t.balance_due > 0 || isOverdue(t) || isDueSoon(t);
}

function pendingPaymentNote(t: TenantBilling): string | null {
  if (t.balance_due > 0) return formatMoney(t.balance_due, t.currency);
  if (isOverdue(t)) return 'overdue';
  if (isDueSoon(t)) {
    const days = daysUntilDue(t)!;
    return days === 0 ? 'due today' : `due in ${days} day${days === 1 ? '' : 's'}`;
  }
  return null;
}

export default function TenantsAdmin() {
  const [tenants, setTenants] = useState<TenantBilling[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [paymentInstructions, setPaymentInstructions] = useState('');
  const [editingInstructions, setEditingInstructions] = useState(false);
  const [instructionsDraft, setInstructionsDraft] = useState('');
  const [instructionsSaving, setInstructionsSaving] = useState(false);

  const loadInstructions = async () => {
    try {
      setPaymentInstructions(await getPlatformPaymentInstructions());
    } catch {
      // Non-critical — the page still works without this loading.
    }
  };

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      setTenants(await listTenantsBilling());
    } catch (err: any) {
      setLoadError(err?.message || "Couldn't load tenants.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); loadInstructions(); }, []);

  const openEditInstructions = () => {
    setInstructionsDraft(paymentInstructions);
    setEditingInstructions(true);
  };

  const handleSaveInstructions = async (e: React.FormEvent) => {
    e.preventDefault();
    setInstructionsSaving(true);
    try {
      await updatePlatformPaymentInstructions(instructionsDraft.trim());
      setPaymentInstructions(instructionsDraft.trim());
      setEditingInstructions(false);
    } catch {
      // Leave the editor open so they can retry.
    } finally {
      setInstructionsSaving(false);
    }
  };

  const pendingTenants = tenants.filter(hasPendingPayment);

  // ---- Add tenant ----
  const [isAdding, setIsAdding] = useState(false);
  const [addForm, setAddForm] = useState({
    orgName: '', businessType: 'general' as BusinessType, monthlyPrice: String(SUGGESTED_PRICE.general),
    currency: 'USD', ownerEmail: '', ownerName: '',
  });
  const [addError, setAddError] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addResult, setAddResult] = useState<{ orgName: string; email: string; tempPassword: string } | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const openAddForm = () => {
    setAddForm({ orgName: '', businessType: 'general', monthlyPrice: String(SUGGESTED_PRICE.general), currency: 'USD', ownerEmail: '', ownerName: '' });
    setAddError(''); setAddResult(null); setCopiedPassword(false);
    setIsAdding(true);
  };

  const handleBusinessTypeChange = (bt: BusinessType) => {
    setAddForm(f => ({
      ...f,
      businessType: bt,
      // Only follow the suggestion if the price wasn't hand-edited away from
      // the previous suggestion — otherwise switching type would clobber a
      // price the admin already typed in.
      monthlyPrice: f.monthlyPrice === String(SUGGESTED_PRICE[f.businessType]) ? String(SUGGESTED_PRICE[bt]) : f.monthlyPrice,
    }));
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    if (!addForm.orgName.trim()) { setAddError('Tenant name is required.'); return; }
    if (!addForm.ownerEmail.trim()) { setAddError("Owner's email is required."); return; }
    setAddSubmitting(true);
    try {
      const price = addForm.monthlyPrice.trim() === '' ? null : Number(addForm.monthlyPrice);
      if (price !== null && (!Number.isFinite(price) || price < 0)) {
        setAddError('Monthly price must be a non-negative number.');
        setAddSubmitting(false);
        return;
      }
      const result = await createTenant({
        orgName: addForm.orgName.trim(),
        businessType: addForm.businessType,
        monthlyPrice: price,
        currency: addForm.currency.trim() || 'USD',
        ownerEmail: addForm.ownerEmail.trim(),
        ownerName: addForm.ownerName.trim() || undefined,
      });
      setAddResult(result);
      await load();
    } catch (err: any) {
      setAddError(err?.message || "Couldn't create that tenant.");
    } finally {
      setAddSubmitting(false);
    }
  };

  const handleCopyPassword = async () => {
    if (!addResult) return;
    try {
      await navigator.clipboard.writeText(addResult.tempPassword);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 1800);
    } catch {
      // Clipboard API unavailable — the password is still on-screen to copy manually.
    }
  };

  // ---- Manage tenant (billing edit + record payment + history) ----
  const [managing, setManaging] = useState<TenantBilling | null>(null);
  const [editForm, setEditForm] = useState({ monthlyPrice: '', currency: 'USD', subscriptionStatus: 'trialing' as SubscriptionStatus, nextPaymentDue: '', billingNotes: '', balanceDue: '0' });
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [history, setHistory] = useState<TenantPayment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const openManage = async (t: TenantBilling) => {
    setManaging(t);
    setEditForm({
      monthlyPrice: t.monthly_price !== null ? String(t.monthly_price) : '',
      currency: t.currency,
      subscriptionStatus: t.subscription_status as SubscriptionStatus,
      nextPaymentDue: t.next_payment_due || '',
      billingNotes: t.billing_notes || '',
      balanceDue: String(t.balance_due),
    });
    setEditError(''); setPaymentError('');
    setPaymentAmount(t.balance_due > 0 ? String(t.balance_due) : t.monthly_price !== null ? String(t.monthly_price) : '');
    setPaymentNote('');
    setHistoryLoading(true);
    try {
      setHistory(await listTenantPayments(t.organization_id));
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSaveBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managing) return;
    setEditError('');
    const price = editForm.monthlyPrice.trim() === '' ? undefined : Number(editForm.monthlyPrice);
    if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
      setEditError('Monthly price must be a non-negative number.');
      return;
    }
    const balance = editForm.balanceDue.trim() === '' ? undefined : Number(editForm.balanceDue);
    if (balance !== undefined && (!Number.isFinite(balance) || balance < 0)) {
      setEditError('Balance owed must be a non-negative number.');
      return;
    }
    setEditSaving(true);
    try {
      await updateTenantBilling(managing.organization_id, {
        monthlyPrice: price,
        currency: editForm.currency.trim() || undefined,
        subscriptionStatus: editForm.subscriptionStatus,
        nextPaymentDue: editForm.nextPaymentDue.trim() === '' ? null : editForm.nextPaymentDue,
        billingNotes: editForm.billingNotes,
        balanceDue: balance,
      });
      await load();
      setManaging(null);
    } catch (err: any) {
      setEditError(err?.message || "Couldn't save billing changes.");
    } finally {
      setEditSaving(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managing) return;
    setPaymentError('');
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError('Enter an amount greater than zero.');
      return;
    }
    setPaymentSubmitting(true);
    try {
      await recordTenantPayment(managing.organization_id, amount, paymentNote.trim() || undefined);
      const [freshTenants, freshHistory] = await Promise.all([
        listTenantsBilling(),
        listTenantPayments(managing.organization_id),
      ]);
      setTenants(freshTenants);
      setHistory(freshHistory);
      const updated = freshTenants.find(t => t.organization_id === managing.organization_id);
      if (updated) {
        setManaging(updated);
        setEditForm(f => ({ ...f, subscriptionStatus: updated.subscription_status as SubscriptionStatus, nextPaymentDue: updated.next_payment_due || '', balanceDue: String(updated.balance_due) }));
      }
      setPaymentAmount(updated && updated.balance_due > 0 ? String(updated.balance_due) : '');
      setPaymentNote('');
    } catch (err: any) {
      setPaymentError(err?.message || "Couldn't record that payment.");
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const columns = [
    {
      header: 'Tenant',
      accessor: (t: TenantBilling) => (
        <div>
          <strong style={{ color: 'var(--text-hi)', fontWeight: 600 }}>{t.name}</strong>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-low)' }}>
            {BUSINESS_TYPE_OPTIONS.find(o => o.value === t.business_type)?.label ?? t.business_type}
          </div>
        </div>
      ),
    },
    {
      header: 'Price',
      accessor: (t: TenantBilling) => <span className="dm-nums">{formatMoney(t.monthly_price, t.currency)}/mo</span>,
    },
    {
      header: 'Balance owed',
      accessor: (t: TenantBilling) => (
        <span className="dm-nums" style={{ color: t.balance_due > 0 ? 'var(--danger)' : 'var(--text-low)', fontWeight: t.balance_due > 0 ? 700 : 400 }}>
          {t.balance_due > 0 ? formatMoney(t.balance_due, t.currency) : '—'}
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: (t: TenantBilling) => (
        <div className="flex items-center gap-1.5">
          <span className={`dm-badge ${STATUS_BADGE[t.subscription_status as SubscriptionStatus]}`}>{statusLabel(t.subscription_status as SubscriptionStatus)}</span>
          {isOverdue(t)
            ? <span className="dm-badge dm-badge-danger">Overdue</span>
            : isDueSoon(t)
              ? <span className="dm-badge dm-badge-warning">Due {daysUntilDue(t) === 0 ? 'today' : `in ${daysUntilDue(t)}d`}</span>
              : null}
        </div>
      ),
    },
    {
      header: 'Next due',
      accessor: (t: TenantBilling) => (
        <span className="dm-nums" style={{ color: isOverdue(t) ? 'var(--danger)' : isDueSoon(t) ? 'var(--warning)' : 'var(--text-mid)' }}>
          {t.next_payment_due ? new Date(t.next_payment_due).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      header: 'Members',
      accessor: (t: TenantBilling) => (
        <span className="flex items-center gap-1.5" style={{ color: 'var(--text-mid)' }}>
          <UsersIcon style={{ width: 13, height: 13, color: 'var(--text-low)' }} /> {t.member_count}
        </span>
      ),
    },
    {
      header: 'Owner',
      accessor: (t: TenantBilling) => <span className="dm-truncate" style={{ maxWidth: 220, display: 'inline-block', color: 'var(--text-mid)' }}>{t.admin_emails || '—'}</span>,
    },
    {
      header: '',
      accessor: (t: TenantBilling) => (
        <button onClick={() => openManage(t)} className="dm-btn dm-btn-ghost" style={{ minHeight: 32, padding: '0.3rem 0.7rem', fontSize: '0.75rem' }}>
          Manage
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6 dm-animate-in" id="tenants-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="dm-h1">Tenants</h1>
          <p style={{ color: 'var(--text-mid)', fontSize: '0.875rem', marginTop: 4 }}>
            Every organization on Uruu OS, and its monthly price and payment status. Billing is manual — there's no payment processor wired in yet.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="dm-icon-btn" title="Reload">
            <RefreshCw className={loading ? 'dm-spin' : ''} style={{ width: 16, height: 16 }} />
          </button>
          <button onClick={openAddForm} className="dm-btn dm-btn-primary">
            <Plus style={{ width: 16, height: 16 }} /> Add tenant
          </button>
        </div>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,107,107,0.3)', fontSize: '0.78rem', color: 'var(--danger)' }} role="alert">
          <AlertCircle style={{ width: 15, height: 15, flexShrink: 0 }} />
          <span>{loadError}</span>
        </div>
      )}

      {!loading && pendingTenants.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-2xl" style={{ background: 'var(--warning-bg)', border: '1px solid rgba(255,176,32,0.3)' }}>
          <BellRing style={{ width: 16, height: 16, color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-hi)' }}>
            <strong>{pendingTenants.length} tenant{pendingTenants.length > 1 ? 's' : ''}</strong> {pendingTenants.length > 1 ? 'need' : 'needs'} attention: {pendingTenants.map(t => `${t.name} (${pendingPaymentNote(t)})`).join(', ')}.
          </div>
        </div>
      )}

      <div className="dm-card-inset p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-hi)' }}>
            <Phone style={{ width: 14, height: 14 }} /> How tenants pay you
          </h3>
          {!editingInstructions && (
            <button onClick={openEditInstructions} className="dm-icon-btn" style={{ width: 28, height: 28 }} aria-label="Edit payment instructions" title="Edit">
              <Pencil style={{ width: 13, height: 13 }} />
            </button>
          )}
        </div>
        {editingInstructions ? (
          <form onSubmit={handleSaveInstructions} className="flex items-center gap-2">
            <input type="text" className="dm-input" style={{ fontSize: '0.8rem' }} placeholder="e.g. MTN Mobile Money: 0979501830 or 0764502661" value={instructionsDraft} onChange={e => setInstructionsDraft(e.target.value)} autoFocus />
            <button type="submit" disabled={instructionsSaving} className="dm-btn dm-btn-primary" style={{ flexShrink: 0 }}>{instructionsSaving ? '…' : 'Save'}</button>
            <button type="button" onClick={() => setEditingInstructions(false)} className="dm-icon-btn" aria-label="Cancel"><X style={{ width: 14, height: 14 }} /></button>
          </form>
        ) : (
          <p style={{ fontSize: '0.8125rem', color: paymentInstructions ? 'var(--text-mid)' : 'var(--text-low)' }}>
            {paymentInstructions || 'Not set — click the pencil to add how tenants should pay you.'}
          </p>
        )}
      </div>

      <DataTable
        data={tenants}
        columns={columns}
        searchPlaceholder="Search by tenant name…"
        filterFunction={(t, query) => t.name.toLowerCase().includes(query.toLowerCase())}
        emptyMessage="No tenants yet — click Add tenant to create the first one."
        loading={loading}
      />

      {/* ---- Add tenant slide-over ---- */}
      <AnimatePresence>
        {isAdding && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsAdding(false)}
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(7,11,36,0.6)', backdropFilter: 'blur(4px)' }}
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
              className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-sm p-6 overflow-y-auto"
              style={{ background: 'var(--bg-1)', borderLeft: '1px solid var(--panel-line)', boxShadow: 'var(--shadow-modal)' }}
              role="dialog" aria-label="Add tenant"
            >
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h3 className="dm-h2">Add tenant</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-mid)', marginTop: 2 }}>Creates the organization and its owner's account immediately.</p>
                </div>
                <button onClick={() => setIsAdding(false)} className="dm-icon-btn" aria-label="Close">
                  <X style={{ width: 16, height: 16 }} />
                </button>
              </div>

              {addResult ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--success-bg)', border: '1px solid rgba(61,220,151,0.3)', fontSize: '0.78rem', color: 'var(--success)' }}>
                    <Check style={{ width: 15, height: 15, flexShrink: 0 }} strokeWidth={3} />
                    <span>{addResult.orgName} created. Give the owner this email + password — they'll set their own password on first login.</span>
                  </div>
                  <div className="space-y-1.5">
                    <label className="dm-label" style={{ padding: 0 }}>Owner email</label>
                    <input type="text" readOnly className="dm-input" style={{ fontSize: '0.78rem' }} value={addResult.email} onFocus={e => e.target.select()} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="dm-label flex items-center gap-1.5" style={{ padding: 0 }}>
                      <KeyRound style={{ width: 12, height: 12 }} /> Temporary password
                    </label>
                    <div className="flex items-center gap-2">
                      <input type="text" readOnly className="dm-input dm-nums" style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.03em' }} value={addResult.tempPassword} onFocus={e => e.target.select()} />
                      <button onClick={handleCopyPassword} className="dm-icon-btn" aria-label="Copy password" title="Copy password">
                        {copiedPassword ? <Check style={{ width: 15, height: 15, color: 'var(--success)' }} /> : <Copy style={{ width: 15, height: 15 }} />}
                      </button>
                    </div>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-low)' }}>Shown once — it isn't stored anywhere.</p>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="button" onClick={openAddForm} className="dm-btn dm-btn-ghost flex-1">Add another</button>
                    <button type="button" onClick={() => setIsAdding(false)} className="dm-btn dm-btn-primary flex-1">Done</button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleAdd} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="dm-label" style={{ padding: 0 }}>Tenant name</label>
                    <input type="text" required autoFocus className="dm-input" placeholder="e.g. Acme Pharmacy" value={addForm.orgName} onChange={e => setAddForm(f => ({ ...f, orgName: e.target.value }))} />
                  </div>

                  <div className="space-y-1.5">
                    <label className="dm-label" style={{ padding: 0 }}>Business type</label>
                    <select className="dm-select" value={addForm.businessType} onChange={e => handleBusinessTypeChange(e.target.value as BusinessType)}>
                      {BUSINESS_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <div className="space-y-1.5 flex-1">
                      <label className="dm-label" style={{ padding: 0 }}>Monthly price</label>
                      <input type="number" min="0" step="0.01" className="dm-input dm-nums" value={addForm.monthlyPrice} onChange={e => setAddForm(f => ({ ...f, monthlyPrice: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5" style={{ width: 90 }}>
                      <label className="dm-label" style={{ padding: 0 }}>Currency</label>
                      <input type="text" className="dm-input dm-nums" value={addForm.currency} onChange={e => setAddForm(f => ({ ...f, currency: e.target.value.toUpperCase() }))} />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="dm-label" style={{ padding: 0 }}>Owner's email</label>
                    <input type="email" required className="dm-input" placeholder="owner@business.com" value={addForm.ownerEmail} onChange={e => setAddForm(f => ({ ...f, ownerEmail: e.target.value }))} />
                  </div>

                  <div className="space-y-1.5">
                    <label className="dm-label" style={{ padding: 0 }}>Owner's name <span style={{ opacity: 0.6, textTransform: 'none' }}>(optional)</span></label>
                    <input type="text" className="dm-input" value={addForm.ownerName} onChange={e => setAddForm(f => ({ ...f, ownerName: e.target.value }))} />
                  </div>

                  {addError && (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,107,107,0.3)', fontSize: '0.78rem', color: 'var(--danger)' }} role="alert">
                      <AlertCircle style={{ width: 15, height: 15, flexShrink: 0 }} />
                      <span>{addError}</span>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button type="button" onClick={() => setIsAdding(false)} className="dm-btn dm-btn-ghost flex-1">Cancel</button>
                    <button type="submit" disabled={addSubmitting} className="dm-btn dm-btn-primary flex-1">{addSubmitting ? 'Creating…' : 'Create tenant'}</button>
                  </div>
                </form>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ---- Manage tenant slide-over ---- */}
      <AnimatePresence>
        {managing && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setManaging(null)}
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(7,11,36,0.6)', backdropFilter: 'blur(4px)' }}
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
              className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-sm p-6 overflow-y-auto"
              style={{ background: 'var(--bg-1)', borderLeft: '1px solid var(--panel-line)', boxShadow: 'var(--shadow-modal)' }}
              role="dialog" aria-label="Manage tenant"
            >
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Building2 style={{ width: 16, height: 16, color: 'var(--text-low)' }} />
                  <h3 className="dm-h2">{managing.name}</h3>
                </div>
                <button onClick={() => setManaging(null)} className="dm-icon-btn" aria-label="Close">
                  <X style={{ width: 16, height: 16 }} />
                </button>
              </div>

              <div className="space-y-6">
                {/* Record a payment */}
                <div className="dm-card-inset p-4 space-y-3">
                  <h4 className="flex items-center gap-1.5" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-hi)' }}>
                    <Wallet style={{ width: 14, height: 14 }} /> Record a payment
                  </h4>
                  {managing.balance_due > 0 && (
                    <p style={{ fontSize: '0.78rem', color: 'var(--danger)', fontWeight: 600 }}>
                      Currently owes {formatMoney(managing.balance_due, managing.currency)}
                    </p>
                  )}
                  <form onSubmit={handleRecordPayment} className="space-y-2.5">
                    <div className="flex gap-2">
                      <input type="number" min="0" step="0.01" className="dm-input dm-nums" style={{ fontSize: '0.85rem' }} placeholder="Amount" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} />
                      <button type="submit" disabled={paymentSubmitting} className="dm-btn dm-btn-primary" style={{ flexShrink: 0 }}>
                        {paymentSubmitting ? '…' : 'Record'}
                      </button>
                    </div>
                    <input type="text" className="dm-input" style={{ fontSize: '0.8rem' }} placeholder="Note (optional) — e.g. paid via EcoCash" value={paymentNote} onChange={e => setPaymentNote(e.target.value)} />
                    {paymentError && <p style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>{paymentError}</p>}
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-low)' }}>Marks the tenant Active and rolls the next-due date forward one month.</p>
                  </form>
                </div>

                {/* Payment history */}
                <div className="space-y-2">
                  <h4 className="flex items-center gap-1.5" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-hi)' }}>
                    <HistoryIcon style={{ width: 14, height: 14 }} /> Payment history
                  </h4>
                  {historyLoading ? (
                    <div className="dm-skeleton" style={{ height: 60 }} />
                  ) : history.length === 0 ? (
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-low)' }}>No payments recorded yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {history.map(p => (
                        <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-xl" style={{ background: 'var(--panel-2)', border: '1px solid var(--panel-line)' }}>
                          <div className="min-w-0">
                            <div className="dm-nums" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-hi)' }}>{formatMoney(p.amount, p.currency)}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-low)' }}>{new Date(p.paid_at).toLocaleDateString()}{p.note ? ` · ${p.note}` : ''}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Edit billing */}
                <form onSubmit={handleSaveBilling} className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--panel-line)' }}>
                  <h4 style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-hi)', marginTop: '0.75rem' }}>Billing details</h4>

                  <div className="flex gap-2">
                    <div className="space-y-1.5 flex-1">
                      <label className="dm-label" style={{ padding: 0 }}>Monthly price</label>
                      <input type="number" min="0" step="0.01" className="dm-input dm-nums" value={editForm.monthlyPrice} onChange={e => setEditForm(f => ({ ...f, monthlyPrice: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5" style={{ width: 90 }}>
                      <label className="dm-label" style={{ padding: 0 }}>Currency</label>
                      <input type="text" className="dm-input dm-nums" value={editForm.currency} onChange={e => setEditForm(f => ({ ...f, currency: e.target.value.toUpperCase() }))} />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="dm-label" style={{ padding: 0 }}>Balance owed <span style={{ opacity: 0.6, textTransform: 'none' }}>(arrears — separate from the monthly price)</span></label>
                    <input type="number" min="0" step="0.01" className="dm-input dm-nums" value={editForm.balanceDue} onChange={e => setEditForm(f => ({ ...f, balanceDue: e.target.value }))} />
                  </div>

                  <div className="space-y-1.5">
                    <label className="dm-label" style={{ padding: 0 }}>Status</label>
                    <select className="dm-select" value={editForm.subscriptionStatus} onChange={e => setEditForm(f => ({ ...f, subscriptionStatus: e.target.value as SubscriptionStatus }))}>
                      {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="dm-label" style={{ padding: 0 }}>Next payment due</label>
                    <input type="date" className="dm-input dm-nums" value={editForm.nextPaymentDue} onChange={e => setEditForm(f => ({ ...f, nextPaymentDue: e.target.value }))} />
                  </div>

                  <div className="space-y-1.5">
                    <label className="dm-label" style={{ padding: 0 }}>Notes <span style={{ opacity: 0.6, textTransform: 'none' }}>(internal — not shown to the tenant)</span></label>
                    <textarea className="dm-input" style={{ minHeight: 64, resize: 'vertical' }} value={editForm.billingNotes} onChange={e => setEditForm(f => ({ ...f, billingNotes: e.target.value }))} />
                  </div>

                  {editError && (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,107,107,0.3)', fontSize: '0.78rem', color: 'var(--danger)' }} role="alert">
                      <AlertCircle style={{ width: 15, height: 15, flexShrink: 0 }} />
                      <span>{editError}</span>
                    </div>
                  )}

                  <button type="submit" disabled={editSaving} className="dm-btn dm-btn-primary w-full">{editSaving ? 'Saving…' : 'Save billing details'}</button>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
