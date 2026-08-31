import React, { useEffect, useState, useMemo } from 'react';
import {
  Pill, FileText, Users, TrendingUp, AlertTriangle, RefreshCw,
  ArrowUpRight, ArrowDownRight, Crown, PackageX, CalendarClock,
} from 'lucide-react';
import { fetchCustomers } from '../services/supabase';
import { fetchMedicines, fetchExpiringBatches, fetchPrescriptions, fetchDispensingRecords } from '../services/pharmacy';
import { Medicine, MedicineBatch, Prescription, DispensingRecord, Customer } from '../types';
import DashboardCard from '../components/DashboardCard';
import CurrentPlanCard from '../components/CurrentPlanCard';
import BillingNotificationBanner from '../components/BillingNotificationBanner';
import BillingHistory from '../components/BillingHistory';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { motion } from 'motion/react';
import { formatCurrency } from '../utils/format';

const currency = formatCurrency;

type Range = 'today' | '7d' | '30d' | 'month' | 'year' | 'custom';
const RANGES: { id: Range; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'custom', label: 'Custom' },
];

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--panel-line-strong)', color: 'var(--text-hi)', borderRadius: 10, padding: '8px 12px', fontSize: 12, boxShadow: 'var(--shadow-card)' }}>
      <div style={{ color: 'var(--text-low)', marginBottom: 4, fontSize: 11 }}>{label}</div>
      <div className="dm-nums" style={{ fontWeight: 700, color: 'var(--blue-400)' }}>{currency(payload[0].value)}</div>
    </div>
  );
}

function HeroStat({ icon: Icon, label, value, tone = 'blue', sub }: {
  icon: React.ElementType; label: string; value: string; tone?: 'blue' | 'cyan' | 'success'; sub?: string;
}) {
  const fg = tone === 'cyan' ? 'var(--cyan-300)' : tone === 'success' ? 'var(--success)' : 'var(--blue-400)';
  const bg = tone === 'cyan' ? 'var(--cyan-bg)' : tone === 'success' ? 'var(--success-bg)' : 'var(--blue-bg)';
  return (
    <div className="dm-card p-6 flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 10, background: bg, color: fg }}>
          <Icon style={{ width: 18, height: 18 }} />
        </div>
        <span className="dm-label" style={{ padding: 0 }}>{label}</span>
      </div>
      <div className="dm-kpi-lg dm-truncate" title={value}>{value}</div>
      {sub && <p className="dm-nums" style={{ fontSize: '0.75rem', color: 'var(--text-low)' }}>{sub}</p>}
    </div>
  );
}

const alertBadgeClass = (level?: string) =>
  level === 'EXPIRED' ? 'dm-badge-danger' : level === 'CRITICAL' ? 'dm-badge-danger' : level === 'WARNING' ? 'dm-badge-warning' : 'dm-badge-neutral';

/**
 * Pharmacy's own Overview -- the generic Dashboard leads with café sessions
 * and print orders, which are meaningless for a pharmacy-only org. This
 * leads with what a pharmacy actually runs on: dispensing revenue,
 * prescriptions awaiting fulfillment, and stock/expiry risk on the
 * medicine shelf, using the same pharmacy data already tracked in the
 * Pharmacy module (medicine_stock_levels, expiring_medicine_batches).
 */
export default function PharmacyDashboard() {
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [expiringBatches, setExpiringBatches] = useState<MedicineBatch[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [dispensingRecords, setDispensingRecords] = useState<DispensingRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [meds, expiring, rx, dispensing, custs] = await Promise.all([
        fetchMedicines(), fetchExpiringBatches(), fetchPrescriptions(),
        fetchDispensingRecords(2000), fetchCustomers(),
      ]);
      setMedicines(meds); setExpiringBatches(expiring); setPrescriptions(rx);
      setDispensingRecords(dispensing); setCustomers(custs);
    } catch (err) {
      console.error('Pharmacy dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const { start, end } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    if (range === 'today') start.setHours(0, 0, 0, 0);
    else if (range === '7d') start.setDate(start.getDate() - 6);
    else if (range === '30d') start.setDate(start.getDate() - 29);
    else if (range === 'month') start.setDate(1);
    else if (range === 'year') start.setMonth(0, 1);
    else {
      if (customFrom) return { start: new Date(customFrom + 'T00:00:00'), end: customTo ? new Date(customTo + 'T23:59:59') : new Date() };
      start.setDate(start.getDate() - 6);
    }
    if (range !== 'today' && range !== 'custom') start.setHours(0, 0, 0, 0);
    return { start, end };
  }, [range, customFrom, customTo]);

  const windowDispensing = useMemo(
    () => dispensingRecords.filter(r => { const d = new Date(r.dispensed_at); return d >= start && d <= end; }),
    [dispensingRecords, start, end],
  );
  const dispensingRevenue = windowDispensing.reduce((sum, r) => sum + r.total_price, 0);
  const itemsDispensed = windowDispensing.reduce((sum, r) => sum + r.quantity, 0);

  const topMedicine = useMemo(() => {
    const tally: Record<string, number> = {};
    windowDispensing.forEach(r => {
      const name = r.medicine_name || 'Medicine';
      tally[name] = (tally[name] || 0) + r.quantity;
    });
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    return top ? { name: top[0], qty: top[1] } : null;
  }, [windowDispensing]);

  const pendingPrescriptions = prescriptions.filter(p => p.status === 'PENDING' || p.status === 'PARTIALLY_DISPENSED');
  const outOfStock = medicines.filter(m => m.stock_status === 'OUT_OF_STOCK');
  const lowStock = medicines.filter(m => m.stock_status === 'LOW_STOCK');
  const stockAlerts = [...outOfStock, ...lowStock];
  const criticalExpiring = expiringBatches.filter(b => b.alert_level === 'EXPIRED' || b.alert_level === 'CRITICAL');

  const chartDays = range === '30d' ? 30 : range === 'month' ? new Date().getDate() : range === 'custom' ? 14 : 7;
  const trendData = useMemo(() => {
    if (range === 'year') {
      const now = new Date();
      const map: Record<string, { date: string; amount: number }> = {};
      for (let m = 0; m <= now.getMonth(); m++) {
        const key = `${now.getFullYear()}-${String(m + 1).padStart(2, '0')}`;
        map[key] = { date: new Date(now.getFullYear(), m, 1).toLocaleDateString('en', { month: 'short' }), amount: 0 };
      }
      dispensingRecords.forEach(r => {
        const d = new Date(r.dispensed_at);
        if (d.getFullYear() !== now.getFullYear()) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (map[key]) map[key].amount += r.total_price;
      });
      return Object.values(map);
    }

    const map: Record<string, { date: string; amount: number }> = {};
    for (let i = chartDays - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en', chartDays > 10 ? { day: 'numeric', month: 'short' } : { weekday: 'short' });
      map[key] = { date: label, amount: 0 };
    }
    dispensingRecords.forEach(r => { const k = r.dispensed_at.slice(0, 10); if (map[k]) map[k].amount += r.total_price; });
    return Object.values(map);
  }, [dispensingRecords, chartDays, range]);

  const isUp = trendData.length > 1 && trendData[trendData.length - 1].amount >= trendData[trendData.length - 2].amount;
  const trendComparisonLabel = range === 'year' ? 'vs prior month' : 'vs prior day';

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{[0, 1, 2].map(i => <div key={i} className="dm-skeleton" style={{ height: 140 }} />)}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{[0, 1, 2, 3].map(i => <div key={i} className="dm-skeleton" style={{ height: 120 }} />)}</div>
        <div className="dm-skeleton" style={{ height: 300 }} />
      </div>
    );
  }

  return (
    <div className="space-y-6 dm-animate-in">
      {/* Header + date range */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="dm-h1">Pharmacy Overview</h1>
          <p style={{ color: 'var(--text-mid)', fontSize: '0.875rem', marginTop: 4 }}>
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
          <div className="dm-seg dm-scroll-x" style={{ maxWidth: '100%' }}>
            {RANGES.map(r => (
              <button key={r.id} onClick={() => setRange(r.id)} className={`dm-seg-item ${range === r.id ? 'active' : ''}`} style={{ flexShrink: 0 }}>{r.label}</button>
            ))}
          </div>
          <button onClick={load} className="dm-icon-btn" aria-label="Refresh" style={{ flexShrink: 0 }}><RefreshCw style={{ width: 16, height: 16 }} /></button>
        </div>
      </div>

      <BillingNotificationBanner />
      <CurrentPlanCard />
      <BillingHistory />

      {range === 'custom' && (
        <div className="dm-card p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="dm-label" style={{ padding: 0 }}>From</label>
            <input type="date" className="dm-input" style={{ marginTop: 6, minWidth: 160 }} value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
          </div>
          <div>
            <label className="dm-label" style={{ padding: 0 }}>To</label>
            <input type="date" className="dm-input" style={{ marginTop: 6, minWidth: 160 }} value={customTo} onChange={e => setCustomTo(e.target.value)} />
          </div>
        </div>
      )}

      {/* Expiry alert */}
      {criticalExpiring.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 px-4 py-3 rounded-2xl"
          style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,107,107,0.3)' }}
        >
          <CalendarClock style={{ width: 16, height: 16, color: 'var(--danger)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-hi)' }}>
            <strong style={{ color: 'var(--danger)' }}>{criticalExpiring.length} batch{criticalExpiring.length > 1 ? 'es' : ''} expired or expiring soon.</strong>{' '}
            {criticalExpiring.slice(0, 4).map(b => (
              <span key={b.id} className="dm-nums" style={{ display: 'inline-block', background: 'rgba(255,107,107,0.12)', borderRadius: 6, padding: '1px 8px', fontSize: '0.72rem', fontWeight: 600, marginRight: 4, marginTop: 4 }}>
                {b.medicine_name} · batch {b.batch_number}
              </span>
            ))}
            {criticalExpiring.length > 4 && <span style={{ fontSize: '0.72rem', color: 'var(--danger)' }}>+{criticalExpiring.length - 4} more</span>}
          </div>
        </motion.div>
      )}

      {/* Stock alert */}
      {stockAlerts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 px-4 py-3 rounded-2xl"
          style={{ background: 'var(--warning-bg)', border: '1px solid rgba(255,176,32,0.3)' }}
        >
          <AlertTriangle style={{ width: 16, height: 16, color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-hi)' }}>
            <strong style={{ color: 'var(--warning)' }}>{stockAlerts.length} medicine{stockAlerts.length > 1 ? 's' : ''} low or out of stock.</strong>{' '}
            {stockAlerts.slice(0, 4).map(m => (
              <span key={m.id} className="dm-nums" style={{ display: 'inline-block', background: 'rgba(255,176,32,0.12)', borderRadius: 6, padding: '1px 8px', fontSize: '0.72rem', fontWeight: 600, marginRight: 4, marginTop: 4 }}>
                {m.name} · {m.total_quantity ?? 0} left
              </span>
            ))}
            {stockAlerts.length > 4 && <span style={{ fontSize: '0.72rem', color: 'var(--warning)' }}>+{stockAlerts.length - 4} more</span>}
          </div>
        </motion.div>
      )}

      {/* ---- Hero numbers ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <HeroStat icon={TrendingUp} label={`Dispensing revenue · ${RANGES.find(r => r.id === range)?.label}`} value={currency(dispensingRevenue)} tone="blue" sub={`${itemsDispensed} item${itemsDispensed === 1 ? '' : 's'} dispensed`} />
        <HeroStat icon={FileText} label="Pending prescriptions" value={String(pendingPrescriptions.length)} tone="cyan" sub={`${prescriptions.length} total on file`} />
        <HeroStat icon={Crown} label="Top medicine" value={topMedicine ? topMedicine.name : '—'} tone="success" sub={topMedicine ? `${topMedicine.qty} dispensed` : 'No dispensing in range'} />
      </div>

      {/* ---- Secondary KPI row ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <DashboardCard title="Expiring Soon" value={`${criticalExpiring.length}`} subValue={`${expiringBatches.length} batches flagged`} icon={CalendarClock} colorScheme={criticalExpiring.length > 0 ? 'amber' : 'slate'} trend="neutral" />
        <DashboardCard title="Out of Stock" value={`${outOfStock.length}`} subValue={`${lowStock.length} more running low`} icon={PackageX} colorScheme={outOfStock.length > 0 ? 'amber' : 'slate'} trend="neutral" />
        <DashboardCard title="Active Medicines" value={`${medicines.length}`} subValue="In catalog" icon={Pill} colorScheme="violet" trend="neutral" />
        <DashboardCard title="Registered Customers" value={`${customers.length}`} subValue="All time" icon={Users} colorScheme="blue" trend="up" />
      </div>

      {/* ---- Dispensing trend chart ---- */}
      <div className="dm-card p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="dm-h2">Dispensing trend</h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-low)', marginTop: 2 }}>{range === 'year' ? 'Monthly' : 'Daily'} dispensing revenue in ZMW</p>
          </div>
          <div className="dm-badge" style={{ padding: '0.3rem 0.6rem', background: isUp ? 'var(--success-bg)' : 'var(--danger-bg)', color: isUp ? 'var(--success)' : 'var(--danger)', border: `1px solid ${isUp ? 'rgba(61,220,151,0.3)' : 'rgba(255,107,107,0.3)'}` }}>
            {isUp ? <ArrowUpRight style={{ width: 13, height: 13 }} /> : <ArrowDownRight style={{ width: 13, height: 13 }} />}
            {isUp ? `Up ${trendComparisonLabel}` : `Down ${trendComparisonLabel}`}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={trendData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="pharmacyAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4C6FFF" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#4C6FFF" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8A93BE' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#8A93BE' }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.12)' }} />
            <Area type="monotone" dataKey="amount" stroke="#4C6FFF" strokeWidth={2.5} fill="url(#pharmacyAreaGrad)" dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: '#7DD3FC' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ---- Bottom row: expiring batches + recent dispensing ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="dm-card p-5">
          <h3 className="dm-h3" style={{ marginBottom: 14 }}>Expiring batches</h3>
          {expiringBatches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10" style={{ color: 'var(--text-low)' }}>
              <CalendarClock style={{ width: 28, height: 28, marginBottom: 8, opacity: 0.6 }} />
              <p style={{ fontSize: '0.8125rem' }}>Nothing expiring soon.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {expiringBatches.slice(0, 6).map(b => (
                <div key={b.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl" style={{ background: 'var(--panel-2)', border: '1px solid var(--panel-line)' }}>
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="dm-truncate" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-hi)' }}>{b.medicine_name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-low)' }}>Batch {b.batch_number} · {b.quantity} units</div>
                  </div>
                  <span className={`dm-badge ${alertBadgeClass(b.alert_level)}`}>
                    {b.days_until_expiry != null ? (b.days_until_expiry < 0 ? 'Expired' : `${b.days_until_expiry}d left`) : b.alert_level}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dm-card p-5">
          <h3 className="dm-h3" style={{ marginBottom: 14 }}>Recent dispensing</h3>
          {dispensingRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10" style={{ color: 'var(--text-low)' }}>
              <Pill style={{ width: 28, height: 28, marginBottom: 8, opacity: 0.6 }} />
              <p style={{ fontSize: '0.8125rem' }}>No dispensing recorded yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {dispensingRecords.slice(0, 5).map(r => (
                <div key={r.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl" style={{ background: 'var(--panel-2)', border: '1px solid var(--panel-line)' }}>
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="dm-truncate" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-hi)' }}>{r.medicine_name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-low)' }}>{r.customer_name || 'Walk-in'} · {r.quantity} unit{r.quantity === 1 ? '' : 's'}</div>
                  </div>
                  <div className="dm-nums" style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-hi)', flexShrink: 0 }}>{currency(r.total_price)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
