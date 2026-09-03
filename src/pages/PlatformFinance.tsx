import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, Wallet, CalendarClock, Landmark, RefreshCw, AlertCircle, History, Building2, Users } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import DashboardCard from '../components/DashboardCard';
import DataTable from '../components/DataTable';
import {
  fetchPlatformFinancialSummary, fetchAllTenantPayments,
  fetchPlatformRevenueTrend, fetchPlatformSignupCohorts,
} from '../services/organizations';
import { PlatformFinancialSummary, PlatformPayment, PlatformRevenuePoint, PlatformSignupCohort } from '../types';

function formatMoney(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

function ChartTooltip({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--panel-line-strong)', color: 'var(--text-hi)', borderRadius: 10, padding: '8px 12px', fontSize: 12, boxShadow: 'var(--shadow-card)' }}>
      <div style={{ color: 'var(--text-low)', marginBottom: 4, fontSize: 11 }}>{label}</div>
      <div className="dm-nums" style={{ fontWeight: 700, color: 'var(--blue-400)' }}>{formatMoney(payload[0].value, currency)}</div>
    </div>
  );
}

const TREND_MONTHS = 6;

export default function PlatformFinance() {
  const [summary, setSummary] = useState<PlatformFinancialSummary[]>([]);
  const [payments, setPayments] = useState<PlatformPayment[]>([]);
  const [revenueTrend, setRevenueTrend] = useState<PlatformRevenuePoint[]>([]);
  const [cohorts, setCohorts] = useState<PlatformSignupCohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [s, p, trend, coh] = await Promise.all([
        fetchPlatformFinancialSummary(),
        fetchAllTenantPayments(50),
        fetchPlatformRevenueTrend(TREND_MONTHS),
        fetchPlatformSignupCohorts(TREND_MONTHS),
      ]);
      setSummary(s);
      setPayments(p);
      setRevenueTrend(trend);
      setCohorts(coh);
    } catch (err: any) {
      setLoadError(err?.message || "Couldn't load financial data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // One trend series per currency — same "map over currencies" shape the
  // stat cards above already use, since a platform with mixed-currency
  // tenants can't sensibly sum revenue across currencies into one line.
  const trendByCurrency = useMemo(() => {
    const byCurrency = new Map<string, { month: string; amount: number }[]>();
    for (const point of revenueTrend) {
      if (!byCurrency.has(point.currency)) byCurrency.set(point.currency, []);
      byCurrency.get(point.currency)!.push({ month: monthLabel(point.month), amount: point.collected });
    }
    return [...byCurrency.entries()];
  }, [revenueTrend]);

  const cohortColumns = [
    {
      header: 'Cohort',
      accessor: (c: PlatformSignupCohort) => <strong style={{ color: 'var(--text-hi)', fontWeight: 600 }}>{monthLabel(c.cohort_month)}</strong>,
    },
    {
      header: 'Signed up',
      accessor: (c: PlatformSignupCohort) => <span className="dm-nums" style={{ color: 'var(--text-mid)' }}>{c.tenant_count}</span>,
    },
    {
      header: 'Still active',
      accessor: (c: PlatformSignupCohort) => (
        <span className="dm-nums" style={{ color: c.active_count === c.tenant_count ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
          {c.active_count} / {c.tenant_count}
        </span>
      ),
    },
    {
      header: 'Current MRR',
      accessor: (c: PlatformSignupCohort) => <strong className="dm-nums" style={{ color: 'var(--blue-400)' }}>{formatMoney(c.current_mrr, c.currency)}</strong>,
    },
  ];

  const columns = [
    {
      header: 'Tenant',
      accessor: (p: PlatformPayment) => (
        <span className="flex items-center gap-1.5" style={{ color: 'var(--text-hi)', fontWeight: 600 }}>
          <Building2 style={{ width: 13, height: 13, color: 'var(--text-low)' }} /> {p.org_name}
        </span>
      ),
    },
    {
      header: 'Amount',
      accessor: (p: PlatformPayment) => <span className="dm-nums" style={{ color: 'var(--success)', fontWeight: 700 }}>{formatMoney(p.amount, p.currency)}</span>,
    },
    {
      header: 'Note',
      accessor: (p: PlatformPayment) => <span style={{ color: p.note ? 'var(--text-mid)' : 'var(--text-low)' }}>{p.note || '—'}</span>,
    },
    {
      header: 'Recorded by',
      accessor: (p: PlatformPayment) => <span style={{ color: 'var(--text-mid)' }}>{p.recorded_by_name || '—'}</span>,
    },
    {
      header: 'When',
      accessor: (p: PlatformPayment) => <span className="dm-nums" style={{ color: 'var(--text-low)', fontSize: '0.78rem' }}>{new Date(p.paid_at).toLocaleString()}</span>,
    },
  ];

  return (
    <div className="space-y-6 dm-animate-in" id="finance-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="dm-h1">Finance</h1>
          <p style={{ color: 'var(--text-mid)', fontSize: '0.875rem', marginTop: 4 }}>
            Your own revenue from every tenant on Uruu OS — recurring revenue, what's still owed, and payments actually collected.
          </p>
        </div>
        <button onClick={load} className="dm-icon-btn" title="Reload">
          <RefreshCw className={loading ? 'dm-spin' : ''} style={{ width: 16, height: 16 }} />
        </button>
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
      ) : summary.length === 0 ? (
        <div className="dm-card-inset text-center" style={{ padding: '3rem 1.5rem' }}>
          <Landmark style={{ width: 40, height: 40, color: 'var(--text-low)', margin: '0 auto' }} />
          <h3 style={{ color: 'var(--text-mid)', fontSize: '0.9rem', fontWeight: 700, marginTop: 16 }}>No billing data yet</h3>
          <p style={{ color: 'var(--text-low)', fontSize: '0.8rem', maxWidth: 380, margin: '4px auto 0' }}>
            Add a tenant on the Tenants page to start tracking revenue here.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {summary.map(s => (
            <div key={s.currency} className="space-y-2.5">
              {summary.length > 1 && (
                <h3 className="dm-nums" style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-low)', letterSpacing: '0.03em' }}>
                  {s.currency} · {s.tenant_count} tenant{s.tenant_count === 1 ? '' : 's'}
                </h3>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <DashboardCard
                  title="Monthly recurring"
                  value={formatMoney(s.mrr, s.currency)}
                  subValue="From active tenants"
                  icon={TrendingUp}
                  colorScheme="emerald"
                  trend="neutral"
                />
                <DashboardCard
                  title="Outstanding"
                  value={formatMoney(s.outstanding_balance, s.currency)}
                  subValue="Owed across all tenants"
                  icon={Wallet}
                  colorScheme={s.outstanding_balance > 0 ? 'amber' : 'slate'}
                  trend="neutral"
                />
                <DashboardCard
                  title="Collected this month"
                  value={formatMoney(s.collected_this_month, s.currency)}
                  subValue="Payments recorded since the 1st"
                  icon={CalendarClock}
                  colorScheme="blue"
                  trend="neutral"
                />
                <DashboardCard
                  title="Collected all-time"
                  value={formatMoney(s.collected_all_time, s.currency)}
                  subValue="Every payment ever recorded"
                  icon={Landmark}
                  colorScheme="violet"
                  trend="neutral"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && trendByCurrency.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {trendByCurrency.map(([currency, points]) => (
            <div key={currency} className="dm-card p-6">
              <div className="mb-4">
                <h2 className="dm-h2">Revenue trend</h2>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-low)', marginTop: 2 }}>{currency} collected per month, last {TREND_MONTHS} months</p>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={points} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`revTrendGrad-${currency}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4C6FFF" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#4C6FFF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#8A93BE' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#8A93BE' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ stroke: 'rgba(255,255,255,0.12)' }} />
                  <Area type="monotone" dataKey="amount" stroke="#4C6FFF" strokeWidth={2.5} fill={`url(#revTrendGrad-${currency})`} dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: '#7DD3FC' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      )}

      <div className="dm-card p-5">
        <h3 className="dm-h3 flex items-center gap-1.5" style={{ marginBottom: 14 }}>
          <Users style={{ width: 15, height: 15 }} /> Signup cohorts
        </h3>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-mid)', marginTop: -8, marginBottom: 14 }}>
          Tenants grouped by the month they signed up — how many are still active, and what they're worth today.
        </p>
        <DataTable
          data={cohorts}
          columns={cohortColumns}
          searchPlaceholder="Search by month…"
          filterFunction={(c, query) => monthLabel(c.cohort_month).toLowerCase().includes(query.toLowerCase())}
          emptyMessage="No signups in the last few months yet."
          loading={loading}
        />
      </div>

      <div className="dm-card p-5">
        <h3 className="dm-h3 flex items-center gap-1.5" style={{ marginBottom: 14 }}>
          <History style={{ width: 15, height: 15 }} /> Recent payments
        </h3>
        <DataTable
          data={payments}
          columns={columns}
          searchPlaceholder="Search by tenant name…"
          filterFunction={(p, query) => p.org_name.toLowerCase().includes(query.toLowerCase())}
          emptyMessage="No payments recorded yet across any tenant."
          loading={loading}
        />
      </div>
    </div>
  );
}
