import { useEffect, useState } from 'react';
import { CreditCard, Calendar, AlertTriangle } from 'lucide-react';
import { fetchMyOrganizationBilling, getCurrentOrganizationId } from '../services/organizations';
import { OrgBilling, BusinessType, BillingCycle } from '../types';

const PLAN_NAME: Record<BusinessType, string> = {
  general: 'Retail & General',
  retail: 'Retail & General',
  cafe: 'Café & Printing',
  printing: 'Café & Printing',
  pharmacy: 'Pharmacy',
};

const CYCLE_LABEL: Record<BillingCycle, string> = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };

function formatMoney(amount: number | null, currency: string): string {
  if (amount === null || amount === undefined) return '—';
  return `${currency} ${amount.toFixed(2)}`;
}

/**
 * "Which plan and billing cycle am I on" — the tenant-side counterpart to
 * TenantsAdmin.tsx's Price/billing-cycle columns. Uses
 * get_my_organization_billing() (migration 020), which any org member can
 * call for their own org — unlike list_tenants_billing(), no platform-admin
 * access needed. Renders nothing while loading or on failure so it never
 * blocks the rest of the dashboard.
 */
export default function CurrentPlanCard() {
  const [billing, setBilling] = useState<OrgBilling | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const orgId = await getCurrentOrganizationId();
        const data = await fetchMyOrganizationBilling(orgId);
        if (!cancelled) setBilling(data);
      } catch {
        // Non-critical — the dashboard still works without this card.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!billing) return null;

  const daysLeft = billing.next_payment_due
    ? Math.round((new Date(billing.next_payment_due).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / (24 * 60 * 60 * 1000))
    : null;
  const isTrialing = billing.subscription_status === 'trialing';
  const overdue = daysLeft !== null && daysLeft < 0 && billing.subscription_status !== 'cancelled';

  return (
    <div className="dm-card p-4 flex items-center justify-between gap-4 flex-wrap" id="current-plan-card">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center flex-shrink-0" style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--blue-bg)', color: 'var(--blue-400)' }}>
          <CreditCard style={{ width: 18, height: 18 }} />
        </div>
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-hi)' }}>
            {PLAN_NAME[billing.business_type] ?? billing.business_type} · {formatMoney(billing.monthly_price, billing.currency)}/mo
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-low)' }}>
            {CYCLE_LABEL[billing.billing_cycle] ?? billing.billing_cycle} billing
            {billing.balance_due > 0 && ` · owes ${formatMoney(billing.balance_due, billing.currency)}`}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {overdue ? (
          <span className="dm-badge dm-badge-danger"><AlertTriangle style={{ width: 12, height: 12 }} /> Payment overdue</span>
        ) : isTrialing && daysLeft !== null ? (
          <span className="dm-badge dm-badge-info"><Calendar style={{ width: 12, height: 12 }} /> Trial ends in {Math.max(daysLeft, 0)}d</span>
        ) : billing.next_payment_due ? (
          <span className="dm-badge dm-badge-neutral"><Calendar style={{ width: 12, height: 12 }} /> Next due {new Date(billing.next_payment_due).toLocaleDateString()}</span>
        ) : null}
      </div>
    </div>
  );
}
