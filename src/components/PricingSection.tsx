import { useState } from 'react';
import { Check, Pill, ShoppingBag, Printer } from 'lucide-react';

type Cycle = 'monthly' | 'quarterly' | 'yearly';

const CYCLE_OPTIONS: { value: Cycle; label: string; months: number; discount: number }[] = [
  { value: 'monthly',   label: 'Monthly',   months: 1,  discount: 0 },
  { value: 'quarterly', label: 'Quarterly', months: 3,  discount: 0.10 },
  { value: 'yearly',    label: 'Yearly',    months: 12, discount: 0.20 },
];

interface Plan {
  id: string;
  name: string;
  icon: React.ElementType;
  monthlyPrice: number;
  blurb: string;
  features: string[];
  highlighted?: boolean;
}

// Same starting prices the platform admin sees as suggestions when adding a
// tenant (see SUGGESTED_PRICE in TenantsAdmin.tsx) -- one source of truth
// for "what this actually costs", just grouped into the three price points
// that already exist there (general/retail share one, café/printing share
// another) instead of five near-duplicate cards.
const PLANS: Plan[] = [
  {
    id: 'retail',
    name: 'Retail & General',
    icon: ShoppingBag,
    monthlyPrice: 15,
    blurb: 'For shops and general dealers.',
    features: ['Point of sale & sales tracking', 'Inventory with low-stock alerts', 'Customer records', 'Team accounts'],
  },
  {
    id: 'cafe',
    name: 'Café & Printing',
    icon: Printer,
    monthlyPrice: 20,
    blurb: 'For internet cafés and print & branding shops.',
    features: ['Everything in Retail & General', 'Café & WiFi session management', 'Printing & branding order tracking', 'Print Manager'],
    highlighted: true,
  },
  {
    id: 'pharmacy',
    name: 'Pharmacy',
    icon: Pill,
    monthlyPrice: 35,
    blurb: 'For pharmacies and dispensaries.',
    features: ['Everything in Retail & General', 'Pharmacy dispensing & prescriptions', 'Batch & expiry tracking', 'Controlled-substance flags'],
  },
];

function formatUSD(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export default function PricingSection({ onGetStarted }: { onGetStarted: () => void }) {
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const active = CYCLE_OPTIONS.find(c => c.value === cycle)!;

  return (
    <div className="w-full">
      <div className="text-center" style={{ marginBottom: 20 }}>
        <h2 style={{ color: 'var(--text-hi)', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: '1.15rem' }}>
          Simple, transparent pricing
        </h2>
        <p style={{ color: 'var(--text-mid)', fontSize: '0.82rem', marginTop: 4 }}>
          Every plan starts with a 7-day free trial — no credit card required.
        </p>
      </div>

      <div className="flex justify-center" style={{ marginBottom: 24 }}>
        <div className="dm-seg">
          {CYCLE_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => setCycle(o.value)}
              className={`dm-seg-item ${cycle === o.value ? 'active' : ''}`}
            >
              {o.label}
              {o.discount > 0 && (
                <span
                  className="dm-nums"
                  style={{
                    fontSize: '0.62rem', fontWeight: 700, padding: '0.1rem 0.35rem', borderRadius: 999,
                    background: cycle === o.value ? 'rgba(255,255,255,0.22)' : 'var(--success-bg)',
                    color: cycle === o.value ? '#fff' : 'var(--success)',
                  }}
                >
                  -{o.discount * 100}%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ maxWidth: 900, margin: '0 auto' }}>
        {PLANS.map(plan => {
          const perMonth = plan.monthlyPrice * (1 - active.discount);
          const billedTotal = perMonth * active.months;
          const Icon = plan.icon;
          return (
            <div
              key={plan.id}
              className={plan.highlighted ? 'dm-card-glass' : 'dm-card'}
              style={{
                padding: '1.5rem',
                border: plan.highlighted ? '1px solid rgba(76,111,255,0.4)' : undefined,
                position: 'relative',
              }}
            >
              {plan.highlighted && (
                <span
                  className="dm-badge dm-badge-info"
                  style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)' }}
                >
                  Most popular
                </span>
              )}
              <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
                <div className="flex items-center justify-center" style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--blue-bg)', color: 'var(--blue-400)' }}>
                  <Icon style={{ width: 16, height: 16 }} />
                </div>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-hi)' }}>{plan.name}</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-low)', marginBottom: 14 }}>{plan.blurb}</p>

              <div className="flex items-end gap-1.5" style={{ marginBottom: 2 }}>
                <span className="dm-nums" style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-hi)' }}>{formatUSD(Math.round(perMonth * 100) / 100)}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-low)', paddingBottom: 4 }}>/mo</span>
              </div>
              <p className="dm-nums" style={{ fontSize: '0.7rem', color: 'var(--text-low)', marginBottom: 16 }}>
                {cycle === 'monthly' ? 'Billed monthly' : `Billed ${formatUSD(Math.round(billedTotal * 100) / 100)} ${cycle}`}
              </p>

              <div className="space-y-2" style={{ marginBottom: 18 }}>
                {plan.features.map(f => (
                  <div key={f} className="flex items-start gap-2">
                    <Check style={{ width: 13, height: 13, color: 'var(--success)', flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-mid)' }}>{f}</span>
                  </div>
                ))}
              </div>

              <button onClick={onGetStarted} className={`dm-btn ${plan.highlighted ? 'dm-btn-primary' : 'dm-btn-ghost'} w-full`}>
                Start free trial
              </button>
            </div>
          );
        })}
      </div>

      <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-low)', marginTop: 20 }}>
        Prices in USD. Need a custom plan or a different currency? WhatsApp 0979 501 830.
      </p>
    </div>
  );
}
