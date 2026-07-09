import React, { useEffect, useState } from 'react';
import {
  ShoppingCart, Package, Printer, Monitor,
  Users, TrendingUp, AlertTriangle, RefreshCw,
  ArrowUpRight, ArrowDownRight, Zap,
} from 'lucide-react';
import {
  fetchProducts, fetchSales, fetchPrintingOrders,
  fetchRunningCafeSessions, fetchCustomers,
  fetchPrintDashboardStats,
} from '../services/supabase';
import { Product, Sale, PrintingOrder, CafeSession, Customer } from '../types';
import DashboardCard from '../components/DashboardCard';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { motion } from 'motion/react';
import { formatCurrency } from '../utils/format';

// ---- helpers ----------------------------------------------------------------

const currency = formatCurrency;

const today = () => new Date().toISOString().slice(0, 10);

// ---- skeleton card ----------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'white', border: '1px solid #e2e8f0', minHeight: 120 }}>
      <div className="uruu-skeleton h-4 w-2/3 mb-3" />
      <div className="uruu-skeleton h-8 w-1/2 mb-2" />
      <div className="uruu-skeleton h-3 w-3/4" />
    </div>
  );
}

// ---- custom chart tooltip ---------------------------------------------------

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#0f172a', color: 'white', borderRadius: 10,
      padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
    }}>
      <div style={{ color: '#94a3b8', marginBottom: 4, fontSize: 11 }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{currency(payload[0].value)}</div>
    </div>
  );
}

// ---- Quick action chip ------------------------------------------------------

function QuickAction({ icon: Icon, label, color, onClick }: {
  icon: React.ElementType; label: string; color: string; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl cursor-pointer transition-all"
      style={{
        background: color + '12',
        border: `1px solid ${color}28`,
        color: color,
        fontSize: '0.8125rem',
        fontWeight: 600,
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = color + '22'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = color + '12'; }}
    >
      <Icon style={{ width: 15, height: 15 }} />
      {label}
    </button>
  );
}

// ---- Main component ---------------------------------------------------------

export default function Dashboard() {
  const [loading, setLoading]           = useState(true);
  const [products, setProducts]         = useState<Product[]>([]);
  const [sales, setSales]               = useState<Sale[]>([]);
  const [printOrders, setPrintOrders]   = useState<PrintingOrder[]>([]);
  const [sessions, setSessions]         = useState<CafeSession[]>([]);
  const [customers, setCustomers]       = useState<Customer[]>([]);
  const [printRevenue, setPrintRevenue] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const [prods, sls, prnts, sess, custs, printStats] = await Promise.all([
        fetchProducts(),
        fetchSales(),
        fetchPrintingOrders(),
        fetchRunningCafeSessions(),
        fetchCustomers(),
        fetchPrintDashboardStats(),
      ]);
      setProducts(prods);
      setSales(sls);
      setPrintOrders(prnts);
      setSessions(sess);
      setCustomers(custs);
      setPrintRevenue(printStats.revenue_today);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ---- Derived metrics ----
  const todayStr = today();

  const todaySales = sales
    .filter(s => s.created_at.slice(0, 10) === todayStr)
    .reduce((sum, s) => sum + s.total_amount, 0);

  const lowStockItems = products.filter(p => {
    const threshold = p.min_stock_level !== undefined ? p.min_stock_level : 5;
    return threshold !== -1 && p.quantity <= threshold;
  });

  const activeSessions = sessions.length;

  const pendingPrint = printOrders.filter(p =>
    ['Pending','Designing','Printing'].includes(p.status)
  ).length;

  // 7-day sales trend
  const trendData = React.useMemo(() => {
    const dayLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const map: Record<string, { date: string; amount: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      map[key] = { date: dayLabels[d.getDay()], amount: 0 };
    }
    sales.forEach(s => {
      const k = s.created_at.slice(0, 10);
      if (map[k]) map[k].amount += s.total_amount;
    });
    return Object.values(map);
  }, [sales]);

  const isUp = trendData.length > 1
    && trendData[trendData.length - 1].amount >= trendData[trendData.length - 2].amount;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[0,1,2,3].map(i => <SkeletonCard key={i} />)}
        </div>
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ---- Page header ---- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 style={{
            fontFamily: 'Manrope',
            fontWeight: 800,
            fontSize: '1.5rem',
            letterSpacing: '-0.025em',
            color: '#0f172a',
            lineHeight: 1.2,
          }}>
            Overview
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: 4 }}>
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Quick actions */}
          <QuickAction icon={Zap} label="Quick Sale" color="#2563eb" />
          <button
            onClick={load}
            className="p-2 rounded-xl cursor-pointer"
            style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b' }}
            aria-label="Refresh dashboard"
          >
            <RefreshCw style={{ width: 15, height: 15 }} />
          </button>
        </div>
      </div>

      {/* ---- Low stock alert ---- */}
      {lowStockItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 px-4 py-3 rounded-2xl"
          style={{ background: '#fffbeb', border: '1px solid #fde68a' }}
        >
          <AlertTriangle style={{ width: 16, height: 16, color: '#d97706', flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: '0.8125rem', color: '#92400e' }}>
            <strong>{lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''} running low:</strong>
            {' '}
            {lowStockItems.slice(0, 4).map(p => (
              <span key={p.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: '#fef3c7', borderRadius: 6, padding: '1px 8px',
                fontSize: '0.75rem', fontWeight: 700, marginRight: 4,
              }}>
                {p.name} · {p.quantity} left
              </span>
            ))}
            {lowStockItems.length > 4 && (
              <span style={{ fontSize: '0.75rem', color: '#d97706' }}>
                +{lowStockItems.length - 4} more
              </span>
            )}
          </div>
        </motion.div>
      )}

      {/* ---- KPI row ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <DashboardCard
          title="Today's Revenue"
          value={currency(todaySales)}
          subValue="POS sales today"
          icon={ShoppingCart}
          colorScheme="blue"
          trend={isUp ? 'up' : 'neutral'}
        />
        <DashboardCard
          title="Print Revenue"
          value={currency(printRevenue)}
          subValue="Completed print jobs"
          icon={Printer}
          colorScheme="violet"
          trend="up"
        />
        <DashboardCard
          title="Active Café Sessions"
          value={`${activeSessions}`}
          subValue={activeSessions === 1 ? '1 terminal occupied' : `${activeSessions} terminals occupied`}
          icon={Monitor}
          colorScheme="emerald"
          trend="neutral"
        />
        <DashboardCard
          title="Pending Print Orders"
          value={`${pendingPrint}`}
          subValue={`${printOrders.length} total orders`}
          icon={Printer}
          colorScheme={pendingPrint > 0 ? 'amber' : 'slate'}
          trend="neutral"
        />
      </div>

      {/* ---- Secondary KPIs ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <DashboardCard
          title="Inventory Items"
          value={`${products.length}`}
          subValue={`${lowStockItems.length} low stock`}
          icon={Package}
          colorScheme={lowStockItems.length > 0 ? 'amber' : 'slate'}
          trend="neutral"
        />
        <DashboardCard
          title="Registered Customers"
          value={`${customers.length}`}
          subValue="All time"
          icon={Users}
          colorScheme="slate"
          trend="up"
        />
        <DashboardCard
          title="Total Sales Volume"
          value={`${sales.length}`}
          subValue="All recorded transactions"
          icon={TrendingUp}
          colorScheme="blue"
          trend="up"
        />
      </div>

      {/* ---- Revenue trend chart ---- */}
      <div
        className="rounded-3xl p-6"
        style={{ background: 'white', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 style={{ fontFamily: 'Manrope', fontWeight: 700, fontSize: '0.9375rem', color: '#0f172a' }}>
              7-Day Revenue Trend
            </h2>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>
              Daily POS sales in ZMW
            </p>
          </div>
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
            style={{
              background: isUp ? '#ecfdf5' : '#fef2f2',
              border: `1px solid ${isUp ? '#bbf7d0' : '#fecaca'}`,
              fontSize: '0.75rem',
              fontWeight: 700,
              color: isUp ? '#065f46' : '#991b1b',
            }}
          >
            {isUp
              ? <ArrowUpRight style={{ width: 13, height: 13 }} />
              : <ArrowDownRight style={{ width: 13, height: 13 }} />
            }
            <span>{isUp ? 'Up vs yesterday' : 'Down vs yesterday'}</span>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={trendData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"  stopColor="#2563eb" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false} tickLine={false}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="amount"
              stroke="#2563eb"
              strokeWidth={2.5}
              fill="url(#areaGrad)"
              dot={false}
              activeDot={{ r: 5, strokeWidth: 0, fill: '#2563eb' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ---- Bottom row: low stock + recent orders ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Low stock table */}
        <div
          className="rounded-3xl p-5"
          style={{ background: 'white', border: '1px solid #e2e8f0' }}
        >
          <h3 style={{ fontFamily: 'Manrope', fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', marginBottom: 16 }}>
            Inventory Alerts
          </h3>
          {lowStockItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10" style={{ color: '#94a3b8' }}>
              <Package style={{ width: 28, height: 28, marginBottom: 8, color: '#d1d5db' }} />
              <p style={{ fontSize: '0.8125rem', fontWeight: 500 }}>All stock levels healthy</p>
            </div>
          ) : (
            <div className="space-y-2">
              {lowStockItems.slice(0, 6).map(p => (
                <div
                  key={p.id}
                  className="flex items-center justify-between py-2.5 px-3 rounded-xl"
                  style={{ background: '#fafafa', border: '1px solid #f1f5f9' }}
                >
                  <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0f172a' }}>{p.name}</div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                      {p.category}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '0.6875rem', fontWeight: 700, padding: '3px 8px',
                      borderRadius: 999,
                      background: p.quantity === 0 ? '#fee2e2' : '#fef3c7',
                      color:      p.quantity === 0 ? '#991b1b' : '#92400e',
                    }}
                  >
                    {p.quantity === 0 ? 'SOLD OUT' : `${p.quantity} left`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent print orders */}
        <div
          className="rounded-3xl p-5"
          style={{ background: 'white', border: '1px solid #e2e8f0' }}
        >
          <h3 style={{ fontFamily: 'Manrope', fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', marginBottom: 16 }}>
            Recent Print & Brand Orders
          </h3>
          {printOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10" style={{ color: '#94a3b8' }}>
              <Printer style={{ width: 28, height: 28, marginBottom: 8, color: '#d1d5db' }} />
              <p style={{ fontSize: '0.8125rem', fontWeight: 500 }}>No orders yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {printOrders.slice(0, 5).map(order => {
                const statusColors: Record<string, { bg: string; text: string }> = {
                  Pending:   { bg: '#fffbeb', text: '#92400e' },
                  Designing: { bg: '#f5f3ff', text: '#5b21b6' },
                  Printing:  { bg: '#dbeafe', text: '#1e40af' },
                  Completed: { bg: '#ecfdf5', text: '#065f46' },
                  Collected: { bg: '#f8fafc', text: '#475569' },
                };
                const s = statusColors[order.status] ?? statusColors.Pending;
                return (
                  <div
                    key={order.id}
                    className="flex items-center justify-between py-2.5 px-3 rounded-xl"
                    style={{ background: '#fafafa', border: '1px solid #f1f5f9' }}
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0f172a' }} className="truncate">
                        {order.description}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                        {order.customer_name} · {order.quantity} units
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        style={{
                          fontSize: '0.6875rem', fontWeight: 700, padding: '2px 8px',
                          borderRadius: 999, background: s.bg, color: s.text,
                        }}
                      >
                        {order.status}
                      </span>
                      <div className="tabular-nums" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a' }}>
                        {currency(order.amount)}
                      </div>
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
