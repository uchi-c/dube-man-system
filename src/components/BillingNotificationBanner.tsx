import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, X } from 'lucide-react';
import { fetchMyOrganizationBilling, fetchMyOrganizationPayments, getCurrentOrganizationId, isOrgLocked } from '../services/organizations';

type Banner =
  | { kind: 'locked'; daysOverdue: number | null }
  | { kind: 'due-soon'; daysLeft: number }
  | { kind: 'just-paid'; amount: number; currency: string };

const DISMISSED_KEY_PREFIX = 'uruu_dismissed_billing_banner:';

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.setHours(0, 0, 0, 0) - b.setHours(0, 0, 0, 0)) / (24 * 60 * 60 * 1000));
}

/**
 * A prominent, dismissible banner (distinct from CurrentPlanCard's small
 * status badge) for the three moments a tenant actually needs to notice:
 * locked out for non-payment, trial/billing due soon, or a payment just
 * went through. Each state gets its own dismiss key (org + state + the
 * specific due-date/payment-id it's about) so dismissing one doesn't
 * silently suppress a later, different alert -- e.g. dismissing "due in 2
 * days" doesn't hide "now locked" once it actually happens.
 */
export default function BillingNotificationBanner() {
  const [banner, setBanner] = useState<Banner | null>(null);
  const [dismissKey, setDismissKey] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const orgId = await getCurrentOrganizationId();
        const [billing, payments, locked] = await Promise.all([
          fetchMyOrganizationBilling(orgId),
          fetchMyOrganizationPayments(orgId, 1),
          isOrgLocked(orgId),
        ]);
        if (cancelled || !billing) return;

        const mostRecentPayment = payments[0] ?? null;
        const daysSincePaid = mostRecentPayment ? daysBetween(new Date(), new Date(mostRecentPayment.paid_at)) : null;
        const daysUntilDue = billing.next_payment_due ? daysBetween(new Date(billing.next_payment_due), new Date()) : null;

        let next: Banner | null = null;
        let key: string | null = null;

        if (locked) {
          next = { kind: 'locked', daysOverdue: daysUntilDue !== null ? -daysUntilDue : null };
          key = `locked:${billing.next_payment_due ?? 'unknown'}`;
        } else if (mostRecentPayment && daysSincePaid !== null && daysSincePaid <= 2) {
          next = { kind: 'just-paid', amount: mostRecentPayment.amount, currency: mostRecentPayment.currency };
          key = `paid:${mostRecentPayment.id}`;
        } else if (daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 3) {
          next = { kind: 'due-soon', daysLeft: daysUntilDue };
          key = `due-soon:${billing.next_payment_due}`;
        }

        if (!next || !key) return;
        const fullKey = `${DISMISSED_KEY_PREFIX}${orgId}:${key}`;
        if (typeof window !== 'undefined' && localStorage.getItem(fullKey) === '1') return;

        if (!cancelled) {
          setBanner(next);
          setDismissKey(fullKey);
        }
      } catch {
        // Non-critical -- the dashboard still works without this banner.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleDismiss = () => {
    if (dismissKey && typeof window !== 'undefined') localStorage.setItem(dismissKey, '1');
    setDismissed(true);
  };

  if (!banner || dismissed) return null;

  const styles = {
    locked: { bg: 'var(--danger-bg)', border: 'rgba(255,107,107,0.3)', color: 'var(--danger)', Icon: AlertTriangle },
    'due-soon': { bg: 'var(--warning-bg)', border: 'rgba(255,184,92,0.3)', color: 'var(--warning)', Icon: CalendarClock },
    'just-paid': { bg: 'var(--success-bg)', border: 'rgba(61,220,151,0.3)', color: 'var(--success)', Icon: CheckCircle2 },
  } as const;
  const { bg, border, color, Icon } = styles[banner.kind];

  const message =
    banner.kind === 'locked'
      ? `Access is currently paused — payment is overdue${banner.daysOverdue !== null && banner.daysOverdue > 0 ? ` by ${banner.daysOverdue} day${banner.daysOverdue === 1 ? '' : 's'}` : ''}. Pay to restore access.`
      : banner.kind === 'due-soon'
        ? `Your next payment is due ${banner.daysLeft === 0 ? 'today' : `in ${banner.daysLeft} day${banner.daysLeft === 1 ? '' : 's'}`} — pay to avoid losing access.`
        : `Payment of ${banner.currency} ${banner.amount.toFixed(2)} received — thank you!`;

  return (
    <div
      className="flex items-center justify-between gap-3 p-3 rounded-xl"
      style={{ background: bg, border: `1px solid ${border}` }}
      role="alert"
      id="billing-notification-banner"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon style={{ width: 15, height: 15, color, flexShrink: 0 }} />
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color }}>{message}</span>
      </div>
      <button onClick={handleDismiss} className="dm-icon-btn" style={{ flexShrink: 0, width: 26, height: 26 }} aria-label="Dismiss">
        <X style={{ width: 13, height: 13 }} />
      </button>
    </div>
  );
}
