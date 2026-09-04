import React, { useEffect, useState } from 'react';
import {
  Building2, RefreshCw, Plus, X, Check, Copy, AlertCircle,
  KeyRound, Wallet, History as HistoryIcon, Users as UsersIcon,
  BellRing, Phone, Pencil, CircleCheck, Lock, LockOpen, Trash2,
  Shield, UserCog,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import DataTable from '../components/DataTable';
import DashboardCard from '../components/DashboardCard';
import {
  listTenantsBilling, createTenant, updateTenantBilling, deleteTenant,
  recordTenantPayment, listTenantPayments,
  getPlatformPaymentInstructions, updatePlatformPaymentInstructions,
  updateTenantExtraModules, fetchTenantLastActive,
  startTenantImpersonation, setActiveOrganizationId,
} from '../services/organizations';
import { BusinessType, SubscriptionStatus, TenantBilling, TenantPayment, BillingCycle } from '../types';

// Suggested starting prices per business type — a flat monthly fee, edited
// freely per tenant either here or in the Add-tenant form. Not a plans
// catalog, just a sensible default so the platform admin isn't starting
// from a blank field every time.
// In Kwacha -- general's 150 is DUBE MAN GENERAL DEALERS' actual
// monthly_price (a real paying tenant), with café/printing and pharmacy
// scaled off it by the same ratio the public pricing page uses.
const SUGGESTED_PRICE: Record<BusinessType, number> = {
  general: 150,
  retail: 150,
  clothing: 150,
  mechanics: 200,
  cafe: 200,
  printing: 200,
  pharmacy: 350,
};

const BUSINESS_TYPE_OPTIONS: { value: BusinessType; label: string }[] = [
  { value: 'general',   label: 'General dealer' },
  { value: 'pharmacy',  label: 'Pharmacy' },
  { value: 'cafe',      label: 'Internet café' },
  { value: 'printing',  label: 'Printing' },
  { value: 'retail',    label: 'Retail' },
  { value: 'clothing',  label: 'Clothing store' },
  { value: 'mechanics', label: 'Mechanics / auto repair' },
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

const CYCLE_OPTIONS: { value: BillingCycle; label: string }[] = [
  { value: 'monthly',   label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly',    label: 'Yearly' },
];
const cycleLabel = (c: BillingCycle) => CYCLE_OPTIONS.find(o => o.value === c)?.label ?? c;

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

// Days since the most recent login across an org's members before it counts
// as gone quiet — the one churn signal billing status alone can't show.
const INACTIVE_DAYS = 14;

function formatLastActive(iso: string | null | undefined): { label: string; stale: boolean } {
  if (!iso) return { label: 'Never logged in', stale: true };
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  const label = days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days}d ago`;
  return { label, stale: days >= INACTIVE_DAYS };
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
  if (isOverdue(t)) return t.balance_due > 0 ? `${formatMoney(t.balance_due, t.currency)} · overdue` : 'overdue';
  if (t.balance_due > 0) return `owes ${formatMoney(t.balance_due, t.currency)}`;
  if (isDueSoon(t)) {
    const days = daysUntilDue(t)!;
    return days === 0 ? 'due today' : `due in ${days} day${days === 1 ? '' : 's'}`;
  }
  return null;
}

// Overdue outranks an unpaid balance, which outranks merely approaching —
// worst-first ordering for the "Needs attention" list.
function severityRank(t: TenantBilling): number {
  if (isOverdue(t)) return 0;
  if (t.balance_due > 0) return 1;
  if (isDueSoon(t)) return 2;
  return 3;
}

/** e.g. "ZMW 1,000.00" or, across mixed currencies, "ZMW 1,000.00 + USD 50.00". */
function totalOutstandingLabel(tenants: TenantBilling[]): string {
  const byCurrency = new Map<string, number>();
  for (const t of tenants) {
    if (t.balance_due > 0) byCurrency.set(t.currency, (byCurrency.get(t.currency) || 0) + t.balance_due);
  }
  if (byCurrency.size === 0) return 'All settled';
  return [...byCurrency.entries()].map(([currency, amount]) => formatMoney(amount, currency)).join(' + ');
}

export default function TenantsAdmin() {
  const [tenants, setTenants] = useState<TenantBilling[]>([]);
  const [lastActive, setLastActive] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [paymentInstructions, setPaymentInstructions] = useState('');
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
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
      try {
        setLastActive(await fetchTenantLastActive());
      } catch {
        // Non-critical — the "Last active" column just shows nothing.
      }
    } catch (err: any) {
      setLoadError(err?.message || "Couldn't load tenants.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); loadInstructions(); }, []);

  const openInstructionsModal = () => {
    setEditingInstructions(false);
    setShowInstructionsModal(true);
  };

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

  const pendingTenants = [...tenants.filter(hasPendingPayment)].sort((a, b) => severityRank(a) - severityRank(b));
  const activeCount = tenants.filter(t => t.subscription_status === 'active').length;

  // Paid up and not otherwise flagged, but nobody's actually logged in for
  // a while -- the churn signal billing status alone can't show.
  const quietTenants = tenants.filter(t =>
    (t.subscription_status === 'active' || t.subscription_status === 'trialing') &&
    formatLastActive(lastActive[t.organization_id]).stale
  );

  // ---- Add tenant ----
  const [isAdding, setIsAdding] = useState(false);
  const [addForm, setAddForm] = useState({
    orgName: '', businessType: 'general' as BusinessType, monthlyPrice: String(SUGGESTED_PRICE.general),
    currency: 'ZMW', paymentMethod: '', billingCycle: 'monthly' as BillingCycle, ownerEmail: '', ownerName: '',
  });
  const [addError, setAddError] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addResult, setAddResult] = useState<{ orgName: string; email: string; tempPassword: string } | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const openAddForm = () => {
    setAddForm({ orgName: '', businessType: 'general', monthlyPrice: String(SUGGESTED_PRICE.general), currency: 'ZMW', paymentMethod: '', billingCycle: 'monthly', ownerEmail: '', ownerName: '' });
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
        paymentMethod: addForm.paymentMethod.trim() || undefined,
        billingCycle: addForm.billingCycle,
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
  const [editForm, setEditForm] = useState({ monthlyPrice: '', currency: 'USD', subscriptionStatus: 'trialing' as SubscriptionStatus, nextPaymentDue: '', billingNotes: '', balanceDue: '0', paymentMethod: '', billingCycle: 'monthly' as BillingCycle });
  const [lockSaving, setLockSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [history, setHistory] = useState<TenantPayment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [extraModulesDraft, setExtraModulesDraft] = useState<string[]>([]);
  const [modulesSaving, setModulesSaving] = useState(false);
  const [modulesError, setModulesError] = useState('');

  const openManage = async (t: TenantBilling) => {
    setManaging(t);
    setEditForm({
      monthlyPrice: t.monthly_price !== null ? String(t.monthly_price) : '',
      currency: t.currency,
      subscriptionStatus: t.subscription_status as SubscriptionStatus,
      nextPaymentDue: t.next_payment_due || '',
      billingNotes: t.billing_notes || '',
      balanceDue: String(t.balance_due),
      paymentMethod: t.payment_method || '',
      billingCycle: t.billing_cycle,
    });
    setExtraModulesDraft(t.extra_modules || []);
    setModulesError('');
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
        paymentMethod: editForm.paymentMethod.trim() || undefined,
        billingCycle: editForm.billingCycle,
      });
      await load();
      setManaging(null);
    } catch (err: any) {
      setEditError(err?.message || "Couldn't save billing changes.");
    } finally {
      setEditSaving(false);
    }
  };

  const toggleExtraModule = (id: string) => {
    setExtraModulesDraft(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  };

  const handleSaveModules = async () => {
    if (!managing) return;
    setModulesError('');
    setModulesSaving(true);
    try {
      await updateTenantExtraModules(managing.organization_id, extraModulesDraft);
      const freshTenants = await listTenantsBilling();
      setTenants(freshTenants);
      const updated = freshTenants.find(t => t.organization_id === managing.organization_id);
      if (updated) setManaging(updated);
    } catch (err: any) {
      setModulesError(err?.message || "Couldn't save enabled modules.");
    } finally {
      setModulesSaving(false);
    }
  };

  // A trial past its due date is locked automatically server-side (see
  // current_org_ids()/is_org_locked() in migration 019) -- mirrored here so
  // the badge/button reflect the real state without a round trip.
  const isLocked = (t: TenantBilling) => t.subscription_status === 'suspended' || t.subscription_status === 'cancelled' || (t.subscription_status === 'trialing' && isOverdue(t));

  const handleToggleLock = async () => {
    if (!managing) return;
    setLockSaving(true);
    try {
      const nextStatus: SubscriptionStatus = isLocked(managing) ? 'active' : 'suspended';
      await updateTenantBilling(managing.organization_id, { subscriptionStatus: nextStatus });
      const freshTenants = await listTenantsBilling();
      setTenants(freshTenants);
      const updated = freshTenants.find(t => t.organization_id === managing.organization_id);
      if (updated) {
        setManaging(updated);
        setEditForm(f => ({ ...f, subscriptionStatus: updated.subscription_status as SubscriptionStatus }));
      }
    } catch (err: any) {
      setEditError(err?.message || "Couldn't change access.");
    } finally {
      setLockSaving(false);
    }
  };

  // Tracks which row's delete is in flight (rather than a single boolean)
  // so the row-level icon button and the Manage panel's Danger-zone button
  // -- two entry points to the same action -- can each show their own
  // pending state independently.
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteTenant = async (t: TenantBilling) => {
    if (!window.confirm(`Delete ${t.name}? Every member loses access immediately and it disappears from this list. Their past sales, inventory, and financial records are kept, not erased — contact support to restore access if this was a mistake.`)) return;
    setDeletingId(t.organization_id);
    try {
      await deleteTenant(t.organization_id);
      if (managing?.organization_id === t.organization_id) setManaging(null);
      await load();
    } catch (err: any) {
      const message = err?.message || "Couldn't delete that tenant.";
      if (managing?.organization_id === t.organization_id) setEditError(message);
      else window.alert(message);
    } finally {
      setDeletingId(null);
    }
  };

  // ---- View as tenant (impersonation) ----
  const [impersonating, setImpersonating] = useState(false);
  const [impersonateError, setImpersonateError] = useState('');

  const handleViewAsTenant = async (t: TenantBilling) => {
    if (!window.confirm(`View ${t.name} as though you were signed in there? This is logged, and ends automatically after 20 minutes.`)) return;
    setImpersonateError('');
    setImpersonating(true);
    try {
      await startTenantImpersonation(t.organization_id, 20);
      setActiveOrganizationId(t.organization_id);
      // Only the URL bar changes here (no navigation to race reload()
      // against — assigning .href instead raced the two, and reload()
      // usually won, leaving stale businessType/extraModules/hasOrg from
      // the old org and producing a spurious "Access restricted"). Landing
      // straight on /dashboard also skips an extra client-side redirect
      // hop. history.replaceState is BrowserRouter's equivalent of the old
      // HashRouter-era "assign the hash" trick -- it changes the address
      // bar without triggering a page load, then reload() does that once.
      window.history.replaceState(null, '', '/dashboard');
      window.location.reload();
    } catch (err: any) {
      setImpersonateError(err?.message || "Couldn't start viewing that tenant.");
      setImpersonating(false);
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
          <div className="flex items-center gap-1.5" style={{ fontSize: '0.72rem', color: 'var(--text-low)' }}>
            {BUSINESS_TYPE_OPTIONS.find(o => o.value === t.business_type)?.label ?? t.business_type}
            {t.signup_source === 'self_service' && <span className="dm-badge dm-badge-neutral" style={{ fontSize: '0.6rem', padding: '0.05rem 0.35rem' }}>Self-serve</span>}
          </div>
        </div>
      ),
    },
    {
      header: 'Price',
      accessor: (t: TenantBilling) => (
        <div>
          <span className="dm-nums">{formatMoney(t.monthly_price, t.currency)}/mo</span>
          {t.billing_cycle !== 'monthly' && <div style={{ fontSize: '0.68rem', color: 'var(--text-low)' }}>{cycleLabel(t.billing_cycle)}</div>}
        </div>
      ),
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
      header: 'Pays via',
      accessor: (t: TenantBilling) => <span style={{ color: t.payment_method ? 'var(--text-mid)' : 'var(--text-low)' }}>{t.payment_method || '—'}</span>,
    },
    {
      header: 'Status',
      accessor: (t: TenantBilling) => (
        <div className="flex items-center gap-1.5">
          {isLocked(t) && <Lock style={{ width: 12, height: 12, color: 'var(--danger)' }} />}
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
      header: 'Last active',
      accessor: (t: TenantBilling) => {
        const { label, stale } = formatLastActive(lastActive[t.organization_id]);
        return <span style={{ color: stale ? 'var(--warning)' : 'var(--text-mid)', fontWeight: stale ? 600 : 400 }}>{label}</span>;
      },
    },
    {
      header: 'Owner',
      accessor: (t: TenantBilling) => <span className="dm-truncate" style={{ maxWidth: 220, display: 'inline-block', color: 'var(--text-mid)' }}>{t.admin_emails || '—'}</span>,
    },
    {
      header: '',
      accessor: (t: TenantBilling) => (
        <div className="flex items-center gap-1.5">
          <button onClick={() => openManage(t)} className="dm-btn dm-btn-ghost" style={{ minHeight: 32, padding: '0.3rem 0.7rem', fontSize: '0.75rem' }}>
            Manage
          </button>
          <button
            onClick={() => handleDeleteTenant(t)}
            disabled={deletingId === t.organization_id}
            className="dm-icon-btn"
            title="Delete tenant"
            aria-label={`Delete ${t.name}`}
            style={{ color: 'var(--danger)' }}
          >
            <Trash2 style={{ width: 14, height: 14 }} />
          </button>
        </div>
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
          <button onClick={openInstructionsModal} className="dm-icon-btn" title="How tenants pay you">
            <Phone style={{ width: 16, height: 16 }} />
          </button>
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

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="dm-skeleton" style={{ height: 120 }} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <DashboardCard title="Tenants" value={String(tenants.length)} subValue="Total organizations" icon={Building2} colorScheme="blue" trend="neutral" />
          <DashboardCard
            title="Needs attention"
            value={String(pendingTenants.length)}
            subValue={pendingTenants.length > 0 ? 'Owed, overdue, or due soon' : 'Nothing pending'}
            icon={BellRing}
            colorScheme={pendingTenants.length > 0 ? 'amber' : 'slate'}
            trend="neutral"
          />
          <DashboardCard title="Active" value={String(activeCount)} subValue={`of ${tenants.length} total`} icon={CircleCheck} colorScheme="emerald" trend="neutral" />
          <DashboardCard title="Outstanding" value={totalOutstandingLabel(tenants)} subValue="Across all tenants" icon={Wallet} colorScheme={totalOutstandingLabel(tenants) === 'All settled' ? 'slate' : 'amber'} trend="neutral" />
        </div>
      )}

      {!loading && pendingTenants.length > 0 && (
        <div className="dm-card p-5 space-y-3">
          <h3 className="flex items-center gap-1.5" style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-hi)' }}>
            <BellRing style={{ width: 15, height: 15, color: 'var(--warning)' }} /> Needs attention
          </h3>
          <div className="space-y-2">
            {pendingTenants.map(t => (
              <div key={t.organization_id} className="flex items-center justify-between py-2.5 px-3 rounded-xl" style={{ background: 'var(--panel-2)', border: '1px solid var(--panel-line)' }}>
                <div className="min-w-0 flex-1 pr-3">
                  <div className="dm-truncate" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-hi)' }}>{t.name}</div>
                  <div style={{ fontSize: '0.72rem', color: isOverdue(t) ? 'var(--danger)' : 'var(--warning)', fontWeight: 600 }}>{pendingPaymentNote(t)}</div>
                </div>
                <button onClick={() => openManage(t)} className="dm-btn dm-btn-ghost" style={{ minHeight: 32, padding: '0.3rem 0.7rem', fontSize: '0.75rem', flexShrink: 0 }}>
                  Manage
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && quietTenants.length > 0 && (
        <div className="dm-card p-5 space-y-3">
          <h3 className="flex items-center gap-1.5" style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-hi)' }}>
            <HistoryIcon style={{ width: 15, height: 15, color: 'var(--warning)' }} /> Going quiet
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-low)', marginTop: -6 }}>
            Paid up and not otherwise flagged, but nobody's signed in for a while — worth a check-in call.
          </p>
          <div className="space-y-2">
            {quietTenants.map(t => (
              <div key={t.organization_id} className="flex items-center justify-between py-2.5 px-3 rounded-xl" style={{ background: 'var(--panel-2)', border: '1px solid var(--panel-line)' }}>
                <div className="min-w-0 flex-1 pr-3">
                  <div className="dm-truncate" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-hi)' }}>{t.name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--warning)', fontWeight: 600 }}>{formatLastActive(lastActive[t.organization_id]).label} · {t.admin_emails || 'no owner email on file'}</div>
                </div>
                <button onClick={() => openManage(t)} className="dm-btn dm-btn-ghost" style={{ minHeight: 32, padding: '0.3rem 0.7rem', fontSize: '0.75rem', flexShrink: 0 }}>
                  Manage
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
                    <label className="dm-label" style={{ padding: 0 }}>Payment method <span style={{ opacity: 0.6, textTransform: 'none' }}>(optional)</span></label>
                    <input type="text" className="dm-input" placeholder="e.g. MTN Mobile Money" value={addForm.paymentMethod} onChange={e => setAddForm(f => ({ ...f, paymentMethod: e.target.value }))} />
                  </div>

                  <div className="space-y-1.5">
                    <label className="dm-label" style={{ padding: 0 }}>Billing cycle</label>
                    <select className="dm-select" value={addForm.billingCycle} onChange={e => setAddForm(f => ({ ...f, billingCycle: e.target.value as BillingCycle }))}>
                      {CYCLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="dm-label" style={{ padding: 0 }}>Owner's email</label>
                    <input type="email" required className="dm-input" placeholder="owner@business.com" value={addForm.ownerEmail} onChange={e => setAddForm(f => ({ ...f, ownerEmail: e.target.value }))} />
                  </div>

                  <div className="space-y-1.5">
                    <label className="dm-label" style={{ padding: 0 }}>Owner's name <span style={{ opacity: 0.6, textTransform: 'none' }}>(optional)</span></label>
                    <input type="text" className="dm-input" value={addForm.ownerName} onChange={e => setAddForm(f => ({ ...f, ownerName: e.target.value }))} />
                  </div>

                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: 'var(--blue-bg)', border: '1px solid rgba(76,111,255,0.3)' }}>
                    <BellRing style={{ width: 14, height: 14, color: 'var(--blue-400)', flexShrink: 0 }} />
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-mid)' }}>Starts on a 7-day trial — due date is set automatically.</p>
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

              <div
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl mb-6"
                style={{
                  background: isLocked(managing) ? 'var(--danger-bg)' : 'var(--success-bg)',
                  border: `1px solid ${isLocked(managing) ? 'rgba(255,107,107,0.3)' : 'rgba(61,220,151,0.3)'}`,
                }}
              >
                <span className="flex items-center gap-1.5" style={{ fontSize: '0.8rem', fontWeight: 600, color: isLocked(managing) ? 'var(--danger)' : 'var(--success)' }}>
                  {isLocked(managing) ? <Lock style={{ width: 14, height: 14 }} /> : <LockOpen style={{ width: 14, height: 14 }} />}
                  {isLocked(managing) ? 'Access locked' : 'Access active'}
                </span>
                <button onClick={handleToggleLock} disabled={lockSaving} className={`dm-btn ${isLocked(managing) ? 'dm-btn-primary' : 'dm-btn-danger'}`} style={{ minHeight: 32, padding: '0.35rem 0.8rem', fontSize: '0.75rem' }}>
                  {lockSaving ? '…' : isLocked(managing) ? 'Unlock' : 'Lock'}
                </button>
              </div>

              <div className="space-y-6">
                {/* Enabled modules — opt-in extras beyond the business type default. WiFi and
                    Internet Café management are always on for every tenant now (see App.tsx's
                    BUSINESS_TYPE_MODULES), so PC Agent Hub is the only one left here — and
                    tenants can also flip it themselves from their own Team page. For 'general'
                    (all-in-one) and 'cafe' business types, PC Agent Hub is itself bundled into
                    the business-type default, so there's nothing to toggle -- a business-type
                    default can't be switched back off via extra_modules. */}
                <div className="dm-card-inset p-4 space-y-3">
                  <h4 className="flex items-center gap-1.5" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-hi)' }}>
                    <CircleCheck style={{ width: 14, height: 14 }} /> Enabled modules
                  </h4>
                  {managing.business_type === 'general' || managing.business_type === 'cafe' ? (
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-low)' }}>
                      PC Agent Hub is included automatically for {managing.business_type} businesses — nothing to enable here.
                    </p>
                  ) : (
                    <>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-low)' }}>
                        Doesn't show by default for {managing.business_type} — only turn it on if this tenant specifically asked for it (they can also do this themselves).
                      </p>
                      <div className="space-y-1.5">
                        {[
                          { id: 'pc-agent', label: 'PC Agent Hub', icon: Shield },
                        ].map(mod => (
                          <label key={mod.id} className="flex items-center gap-2" style={{ fontSize: '0.78rem', color: 'var(--text-hi)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={extraModulesDraft.includes(mod.id)} onChange={() => toggleExtraModule(mod.id)} />
                            <mod.icon style={{ width: 13, height: 13, color: 'var(--text-low)' }} />
                            {mod.label}
                          </label>
                        ))}
                      </div>
                      {modulesError && <p style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>{modulesError}</p>}
                      <button type="button" onClick={handleSaveModules} disabled={modulesSaving} className="dm-btn dm-btn-ghost" style={{ fontSize: '0.75rem' }}>
                        {modulesSaving ? 'Saving…' : 'Save modules'}
                      </button>
                    </>
                  )}
                </div>

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
                    <label className="dm-label" style={{ padding: 0 }}>Payment method</label>
                    <input type="text" className="dm-input" placeholder="e.g. MTN Mobile Money" value={editForm.paymentMethod} onChange={e => setEditForm(f => ({ ...f, paymentMethod: e.target.value }))} />
                  </div>

                  <div className="space-y-1.5">
                    <label className="dm-label" style={{ padding: 0 }}>Billing cycle</label>
                    <select className="dm-select" value={editForm.billingCycle} onChange={e => setEditForm(f => ({ ...f, billingCycle: e.target.value as BillingCycle }))}>
                      {CYCLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
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

                {/* View as tenant */}
                <div className="pt-2 space-y-2" style={{ borderTop: '1px solid var(--panel-line)' }}>
                  <h4 style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-hi)', marginTop: '0.75rem' }}>View as tenant</h4>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-low)' }}>
                    See exactly what {managing.name}'s dashboard, POS, and inventory look like — for support/debugging. Logged, and ends automatically after 20 minutes.
                  </p>
                  {impersonateError && (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,107,107,0.3)', fontSize: '0.78rem', color: 'var(--danger)' }} role="alert">
                      <AlertCircle style={{ width: 15, height: 15, flexShrink: 0 }} />
                      <span>{impersonateError}</span>
                    </div>
                  )}
                  <button type="button" onClick={() => handleViewAsTenant(managing)} disabled={impersonating} className="dm-btn dm-btn-ghost w-full">
                    <UserCog style={{ width: 14, height: 14 }} /> {impersonating ? 'Starting…' : 'View as tenant'}
                  </button>
                </div>

                {/* Danger zone */}
                <div className="pt-2 space-y-2" style={{ borderTop: '1px solid var(--panel-line)' }}>
                  <h4 style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--danger)', marginTop: '0.75rem' }}>Danger zone</h4>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-low)' }}>Removes this tenant from your list and cuts off access for everyone in it. Their records are kept, not erased.</p>
                  <button type="button" onClick={() => handleDeleteTenant(managing)} disabled={deletingId === managing.organization_id} className="dm-btn dm-btn-danger w-full">
                    <Trash2 style={{ width: 14, height: 14 }} /> {deletingId === managing.organization_id ? 'Deleting…' : 'Delete tenant'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ---- Payment instructions modal ---- */}
      <AnimatePresence>
        {showInstructionsModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setShowInstructionsModal(false)}
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(7,11,36,0.6)', backdropFilter: 'blur(4px)' }}
            />
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.2 }}
              className="fixed z-50 w-full max-w-sm p-6"
              style={{
                top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                background: 'var(--bg-1)', border: '1px solid var(--panel-line)', borderRadius: 'var(--r-card)', boxShadow: 'var(--shadow-modal)',
              }}
              role="dialog" aria-label="How tenants pay you"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="dm-h2 flex items-center gap-1.5"><Phone style={{ width: 15, height: 15 }} /> How tenants pay you</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-mid)', marginTop: 2 }}>Shown here for your own reference — not visible to tenants yet.</p>
                </div>
                <button onClick={() => setShowInstructionsModal(false)} className="dm-icon-btn" aria-label="Close">
                  <X style={{ width: 16, height: 16 }} />
                </button>
              </div>

              {editingInstructions ? (
                <form onSubmit={handleSaveInstructions} className="space-y-3">
                  <input type="text" className="dm-input" style={{ fontSize: '0.8rem' }} placeholder="e.g. MTN Mobile Money: 0979501830 or 0764502661" value={instructionsDraft} onChange={e => setInstructionsDraft(e.target.value)} autoFocus />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditingInstructions(false)} className="dm-btn dm-btn-ghost flex-1">Cancel</button>
                    <button type="submit" disabled={instructionsSaving} className="dm-btn dm-btn-primary flex-1">{instructionsSaving ? 'Saving…' : 'Save'}</button>
                  </div>
                </form>
              ) : (
                <div className="space-y-3">
                  <p style={{ fontSize: '0.8125rem', color: paymentInstructions ? 'var(--text-mid)' : 'var(--text-low)' }}>
                    {paymentInstructions || 'Not set yet — add how tenants should pay you.'}
                  </p>
                  <button onClick={openEditInstructions} className="dm-btn dm-btn-ghost w-full">
                    <Pencil style={{ width: 13, height: 13 }} /> {paymentInstructions ? 'Edit' : 'Add'}
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
