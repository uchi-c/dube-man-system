import { useEffect, useState } from 'react';
import { History, Receipt } from 'lucide-react';
import { fetchMyOrganizationPayments, getCurrentOrganizationId } from '../services/organizations';
import { OrgPayment } from '../types';

function formatMoney(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`;
}

/**
 * "What have I actually paid" -- the tenant-side counterpart to
 * TenantsAdmin.tsx's payment-history list inside Manage. Uses
 * get_my_organization_payments() (migration 023), which any org member can
 * call for their own org, unlike the platform-admin-only
 * list_tenant_payments(). Renders nothing while loading or on failure so it
 * never blocks the rest of the dashboard -- same convention as
 * CurrentPlanCard.
 */
export default function BillingHistory() {
  const [payments, setPayments] = useState<OrgPayment[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const orgId = await getCurrentOrganizationId();
        const data = await fetchMyOrganizationPayments(orgId);
        if (!cancelled) setPayments(data);
      } catch {
        // Non-critical -- the dashboard still works without this card.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (payments === null) return null;

  return (
    <div className="dm-card p-4" id="billing-history-card">
      <h3 className="flex items-center gap-1.5" style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-hi)', marginBottom: 12 }}>
        <History style={{ width: 14, height: 14 }} /> Billing history
      </h3>
      {payments.length === 0 ? (
        <div className="flex items-center gap-2" style={{ color: 'var(--text-low)', fontSize: '0.78rem' }}>
          <Receipt style={{ width: 14, height: 14 }} /> No payments recorded yet.
        </div>
      ) : (
        <div className="space-y-1.5">
          {payments.map(p => (
            <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-xl" style={{ background: 'var(--panel-2)', border: '1px solid var(--panel-line)' }}>
              <div className="min-w-0">
                <div className="dm-nums" style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-hi)' }}>{formatMoney(p.amount, p.currency)}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-low)' }}>{new Date(p.paid_at).toLocaleDateString()}{p.note ? ` · ${p.note}` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
