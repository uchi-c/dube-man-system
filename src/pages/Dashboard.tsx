import React, { useEffect, useState, useMemo } from 'react';
import {
  Package, Printer, Monitor,
  Users, TrendingUp, AlertTriangle, RefreshCw,
  ArrowUpRight, ArrowDownRight, Receipt, Crown,
} from 'lucide-react';
import {
  fetchProducts, fetchSales, fetchPrintingOrders,
  fetchRunningCafeSessions, fetchCompletedCafeSessions, fetchCustomers,
  fetchPrintDashboardStats,
} from '../services/supabase';
import { Product, Sale, PrintingOrder, CafeSession, Customer } from '../types';
import DashboardCard from '../components/DashboardCard';
import {
  AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { motion } from 'motion/react';
import { formatCurrency } from '../utils/format';

const currency = formatCurrency;

type Range = 'today' | '7d' | '30d' | 'custom';
const RANGES: { id: Range; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: 'custom', label: 'Custom' },
];

// ---- custom chart tooltip (accent-only) ------------------------------------

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--panel-line-strong)', color: 'var(--text-hi)', borderRadius: 10, padding: '8px 12px', fontSize: 12, boxShadow: 'var(--shadow-card)' }}>
      <div style={{ color: 'var(--text-low)', marginBottom: 4, fontSize: 11 }}>{label}</div>
      <div className="dm-nums" style={{ fontWeight: 700, color: 'var(--blue-400)' }}>{currency(payload[0].value)}</div>
    </div>
  );
}

// ---- hero KPI ---------------------------------------------------------------

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

// ---- Main component ---------------------------------------------------------

export default function Dashboard() {
  const [loading, setLoading]           = useState(true);
  const [range, setRange]               = useState<Range>('7d');
  const [customFrom, setCustomFrom]     = useState('');
  const [customTo, setCustomTo]         = useState('');
  const [products, setProducts]         = useState<Product[]>([]);
  const [sales, setSales]               = useState<Sale[]>([]);
  const [printOrders, setPrintOrders]   = useState<PrintingOrder[]>([]);
  const [sessions, setSessions]         = useState<CafeSession[]>([]);
  const [completedSessions, setCompletedSessions] = useState<CafeSession[]>([]);
  const [customers, setCustomers]       = useState<Customer[]>([]);
  const [printRevenue, setPrintRevenue] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const [prods, sls, prnts, sess, doneSess, custs, printStats] = await Promise.all([
        fetchProducts(), fetchSales(), fetchPrintingOrders(),
        fetchRunningCafeSessions(), fetchCompletedCafeSessions(), fetchCustomers(), fetchPrintDashboardStats(),
      ]);
      setProducts(prods); setSales(sls); setPrintOrders(prnts);
      setSessions(sess); setCompletedSessions(doneSess); setCustomers(custs); setPrintRevenue(printStats.revenue_today);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ---- Range window ----
  const { start, end } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    if (range === 'today') start.setHours(0, 0, 0, 0);
    else if (range === '7d') start.setDate(start.getDate() - 6);
    else if (range === '30d') start.setDate(start.getDate() - 29);
    else {
      if (customFrom) return { start: new Date(customFrom + 'T00:00:00'), end: customTo ? new Date(customTo + 'T23:59:59') : new Date() };
      start.setDate(start.getDate() - 6);
    }
    if (range !== 'today' && range !== 'custom') start.setHours(0, 0, 0, 0);
    return { start, end };
  }, [range, customFrom, customTo]);

  const windowSales = useMemo(
    () => sales.filter(s => { const d = new Date(s.created_at); return d >= start && d <= end; }),
    [sales, start, end],
  );

  const rangeRevenue = windowSales.reduce((sum, s) => sum + s.total_amount, 0);
  const rangeTxns = windowSales.length;

  // ---- Revenue by channel (same range window as the trend chart) ----
  const windowPrintOrders = useMemo(
    () => printOrders.filter(o => { const d = new Date(o.created_at); return d >= start && d <= end; }),
    [printOrders, start, end],
  );
  const windowCafeRevenue = useMemo(
    () => completedSessions
      .filter(s => { const d = new Date(s.end_time || s.start_time); return d >= start && d <= end; })
      .reduce((sum, s) => sum + (s.amount || 0), 0),
    [completedSessions, start, end],
  );
  const printOrdersRevenue = windowPrintOrders.reduce((sum, o) => sum + o.amount, 0);
  const channelData = useMemo(() => [
    { name: 'POS Sales', value: rangeRevenue, color: '#4C6FFF' },
    { name: 'Branding & Printing', value: printOrdersRevenue, color: '#7DD3FC' },
    { name: 'Café Sessions', value: windowCafeRevenue, color: '#3DDC97' },
  ], [rangeRevenue, printOrdersRevenue, windowCafeRevenue]);
  const hasChannelData = channelData.some(c => c.value > 0);

  const topProduct = useMemo(() => {
    const tally: Record<string, number> = {};
    windowSales.forEach(s => s.items?.forEach(it => {
      const name = it.product_name || 'Item';
      tally[name] = (tally[name] || 0) + it.quantity;
    }));
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    return top ? { name: top[0], qty: top[1] } : null;
  }, [windowSales]);

  const lowStockItems = products.filter(p => {
    const threshold = p.min_stock_level !== undefined ? p.min_stock_level : 5;
    return threshold !== -1 && p.quantity <= threshold;
  });
  const activeSessions = sessions.length;
  const pendingPrint = printOrders.filter(p => ['Pending', 'Designing', 'Printing'].includes(p.status)).length;

  // ---- Trend chart buckets ----
  const chartDays = range === '30d' ? 30 : range === 'custom' ? 14 : 7;
  const trendData = useMemo(() => {
    const map: Record<string, { date: string; amount: number }> = {};
    for (let i = chartDays - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en', chartDays > 10 ? { day: 'numeric', month: 'short' } : { weekday: 'short' });
      map[key] = { date: label, amount: 0 };
    }
    sales.forEach(s => { const k = s.created_at.slice(0, 10); if (map[k]) map[k].amount += s.total_amount; });
    return Object.values(map);
  }, [sales, chartDays]);

  const isUp = trendData.length > 1 && trendData[trendData.length - 1].amount >= trendData[trendData.length - 2].amount;

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
          <h1 className="dm-h1">Reports</h1>
          <p style={{ color: 'var(--text-mid)', fontSize: '0.875rem', marginTop: 4 }}>
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="dm-seg">
            {RANGES.map(r => (
              <button key={r.id} onClick={() => setRange(r.id)} className={`dm-seg-item ${range === r.id ? 'active' : ''}`}>{r.label}</button>
            ))}
          </div>
          <button onClick={load} className="dm-icon-btn" aria-label="Refresh"><RefreshCw style={{ width: 16, height: 16 }} /></button>
        </div>
      </div>

      {/* Custom range inputs */}
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

      {/* Low stock alert */}
      {lowStockItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 px-4 py-3 rounded-2xl"
          style={{ background: 'var(--warning-bg)', border: '1px solid rgba(255,176,32,0.3)' }}
        >
          <AlertTriangle style={{ width: 16, height: 16, color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-hi)' }}>
            <strong style={{ color: 'var(--warning)' }}>{lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''} running low.</strong>{' '}
            {lowStockItems.slice(0, 4).map(p => (
              <span key={p.id} className="dm-nums" style={{ display: 'inline-block', background: 'rgba(255,176,32,0.12)', borderRadius: 6, padding: '1px 8px', fontSize: '0.72rem', fontWeight: 600, marginRight: 4, marginTop: 4 }}>
                {p.name} · {p.quantity} left
              </span>
            ))}
            {lowStockItems.length > 4 && <span style={{ fontSize: '0.72rem', color: 'var(--warning)' }}>+{lowStockItems.length - 4} more</span>}
          </div>
        </motion.div>
      )}

      {/* ---- Hero numbers ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <HeroStat icon={TrendingUp} label={`Revenue · ${RANGES.find(r => r.id === range)?.label}`} value={currency(rangeRevenue)} tone="blue" sub="POS sales in range" />
        <HeroStat icon={Receipt} label="Transactions" value={String(rangeTxns)} tone="cyan" sub={rangeTxns === 1 ? '1 checkout' : `${rangeTxns} checkouts`} />
        <HeroStat icon={Crown} label="Top product" value={topProduct ? topProduct.name : '—'} tone="success" sub={topProduct ? `${topProduct.qty} sold` : 'No sales in range'} />
      </div>

      {/* ---- Secondary KPI row ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <DashboardCard title="Print Revenue" value={currency(printRevenue)} subValue="Completed print jobs today" icon={Printer} colorScheme="violet" trend="up" />
        <DashboardCard title="Active Café Sessions" value={`${activeSessions}`} subValue={activeSessions === 1 ? '1 terminal occupied' : `${activeSessions} terminals occupied`} icon={Monitor} colorScheme="emerald" trend="neutral" />
        <DashboardCard title="Pending Print Orders" value={`${pendingPrint}`} subValue={`${printOrders.length} total orders`} icon={Printer} colorScheme={pendingPrint > 0 ? 'amber' : 'slate'} trend="neutral" />
        <DashboardCard title="Registered Customers" value={`${customers.length}`} subValue="All time" icon={Users} colorScheme="blue" trend="up" />
      </div>

      {/* ---- Revenue trend chart ---- */}
      <div className="dm-card p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="dm-h2">Revenue trend</h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-low)', marginTop: 2 }}>Daily POS sales in ZMW</p>
          </div>
          <div className="dm-badge" style={{ padding: '0.3rem 0.6rem', background: isUp ? 'var(--success-bg)' : 'var(--danger-bg)', color: isUp ? 'var(--success)' : 'var(--danger)', border: `1px solid ${isUp ? 'rgba(61,220,151,0.3)' : 'rgba(255,107,107,0.3)'}` }}>
            {isUp ? <ArrowUpRight style={{ width: 13, height: 13 }} /> : <ArrowDownRight style={{ width: 13, height: 13 }} />}
            {isUp ? 'Up vs prior day' : 'Down vs prior day'}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={trendData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4C6FFF" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#4C6FFF" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8A93BE' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#8A93BE' }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.12)' }} />
            <Area type="monotone" dataKey="amount" stroke="#4C6FFF" strokeWidth={2.5} fill="url(#areaGrad)" dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: '#7DD3FC' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ---- Revenue by channel ---- */}
      <div className="dm-card p-6">
        <div className="mb-5">
          <h2 className="dm-h2">Revenue by channel</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-low)', marginTop: 2 }}>
            POS, branding &amp; printing orders, and café sessions in the selected range
          </p>
        </div>

        {hasChannelData ? (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={channelData} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#8A93BE' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12, fill: '#C7CCE6' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={22}>
                {channelData.map((c, i) => <Cell key={i} fill={c.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center py-10" style={{ color: 'var(--text-low)' }}>
            <TrendingUp style={{ width: 28, height: 28, marginBottom: 8, opacity: 0.6 }} />
            <p style={{ fontSize: '0.8125rem' }}>No revenue recorded in this range yet.</p>
          </div>
        )}
      </div>

      {/* ---- Bottom row: inventory alerts + recent print orders ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="dm-card p-5">
          <h3 className="dm-h3" style={{ marginBottom: 14 }}>Inventory alerts</h3>
          {lowStockItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10" style={{ color: 'var(--text-low)' }}>
              <Package style={{ width: 28, height: 28, marginBottom: 8, opacity: 0.6 }} />
              <p style={{ fontSize: '0.8125rem' }}>All stock levels healthy.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {lowStockItems.slice(0, 6).map(p => (
                <div key={p.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl" style={{ background: 'var(--panel-2)', border: '1px solid var(--panel-line)' }}>
                  <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-hi)' }}>{p.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-low)' }}>{p.category}</div>
                  </div>
                  <span className={`dm-badge ${p.quantity === 0 ? 'dm-badge-danger' : 'dm-badge-warning'}`}>{p.quantity === 0 ? 'Out of stock' : `${p.quantity} left`}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dm-card p-5">
          <h3 className="dm-h3" style={{ marginBottom: 14 }}>Recent print &amp; brand orders</h3>
          {printOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10" style={{ color: 'var(--text-low)' }}>
              <Printer style={{ width: 28, height: 28, marginBottom: 8, opacity: 0.6 }} />
              <p style={{ fontSize: '0.8125rem' }}>No orders yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {printOrders.slice(0, 5).map(order => {
                const cls = order.status === 'Completed' ? 'dm-badge-success'
                  : order.status === 'Printing' || order.status === 'Designing' ? 'dm-badge-info'
                  : order.status === 'Collected' ? 'dm-badge-neutral' : 'dm-badge-warning';
                return (
                  <div key={order.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl" style={{ background: 'var(--panel-2)', border: '1px solid var(--panel-line)' }}>
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="dm-truncate" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-hi)' }}>{order.description}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-low)' }}>{order.customer_name} · {order.quantity} units</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`dm-badge ${cls}`}>{order.status}</span>
                      <div className="dm-nums" style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-hi)' }}>{currency(order.amount)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
