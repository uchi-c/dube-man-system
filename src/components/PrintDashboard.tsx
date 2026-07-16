import React, { useEffect, useState } from 'react';
import {
  FileText, TrendingUp, DollarSign, Layers,
  PrinterIcon, Monitor, User, Users,
  WifiOff, RefreshCw, AlertTriangle
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { motion } from 'motion/react';
import { fetchPrintDashboardStats } from '../services/supabase';
import { formatCurrency, formatNumber } from '../utils/format';
import type { PrintDashboardStats } from '../types';

// ---- KPI card ---------------------------------------------------------------

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  tone?: 'blue' | 'cyan' | 'success' | 'warning' | 'neutral';
  delay?: number;
}

function KpiCard({ label, value, sub, icon: Icon, tone = 'blue', delay = 0 }: KpiCardProps) {
  const fg = tone === 'cyan' ? 'var(--cyan-300)' : tone === 'success' ? 'var(--success)' : tone === 'warning' ? 'var(--warning)' : tone === 'neutral' ? 'var(--text-mid)' : 'var(--blue-400)';
  const bg = tone === 'cyan' ? 'var(--cyan-bg)' : tone === 'success' ? 'var(--success-bg)' : tone === 'warning' ? 'var(--warning-bg)' : tone === 'neutral' ? 'var(--panel-2)' : 'var(--blue-bg)';
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.06 }}
      whileHover={{ y: -2 }}
      className="dm-card p-5 flex items-center space-x-4"
    >
      <div className="flex items-center justify-center flex-shrink-0" style={{ width: 44, height: 44, borderRadius: 14, background: bg, color: fg }}>
        <Icon style={{ width: 19, height: 19 }} />
      </div>
      <div className="min-w-0">
        <div className="dm-label" style={{ padding: 0 }}>
          {label}
        </div>
        <div className="dm-nums dm-truncate" style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-hi)', marginTop: 2 }}>{value}</div>
        {sub && (
          <div style={{ fontSize: '0.625rem', color: 'var(--text-low)', marginTop: 2, fontFamily: 'monospace' }}>{sub}</div>
        )}
      </div>
    </motion.div>
  );
}

// ---- Custom tooltip for the chart -------------------------------------------

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--panel-line-strong)', color: 'var(--text-hi)', borderRadius: 10, padding: '8px 12px', fontSize: 12, boxShadow: 'var(--shadow-card)' }}>
      <div style={{ fontWeight: 700, color: 'var(--text-mid)', marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center space-x-2">
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
          <span style={{ color: 'var(--text-low)' }}>{p.name}:</span>
          <span style={{ fontWeight: 700 }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ---- Main component ---------------------------------------------------------

export default function PrintDashboard() {
  const [stats, setStats]     = useState<PrintDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPrintDashboardStats();
      setStats(data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" style={{ color: 'var(--text-low)' }}>
        <RefreshCw className="dm-spin" style={{ width: 18, height: 18, marginRight: 8 }} />
        <span style={{ fontSize: '0.8125rem', fontFamily: 'monospace' }}>Loading print dashboard…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16 space-x-2" style={{ color: 'var(--danger)' }}>
        <AlertTriangle style={{ width: 18, height: 18 }} />
        <span style={{ fontSize: '0.875rem' }}>{error}</span>
        <button onClick={load} style={{ marginLeft: 12, fontSize: '0.75rem', textDecoration: 'underline', color: 'var(--text-low)', background: 'none', border: 'none', cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    );
  }

  if (!stats) return null;

  const fmtNum = formatNumber;
  const fmtMoney = formatCurrency;

  return (
    <div className="space-y-6" id="print-dashboard">
      {/* Offline printer alert */}
      {stats.offline_printers > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="dm-badge dm-badge-warning"
          style={{ width: '100%', padding: '0.75rem 1rem', alignItems: 'flex-start', whiteSpace: 'normal' }}
        >
          <WifiOff style={{ width: 15, height: 15, marginTop: 1, flexShrink: 0 }} />
          <div style={{ fontSize: '0.75rem' }}>
            <span style={{ fontWeight: 700 }}>
              {stats.offline_printers} printer{stats.offline_printers > 1 ? 's' : ''} offline
            </span>
            {' '}— check the Printers tab for details.
          </div>
        </motion.div>
      )}

      {/* KPI grid — 4 columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard delay={0} label="Pages Today"         value={fmtNum(stats.pages_today)}      sub={`BW: ${fmtNum(stats.bw_pages_today)} · Colour: ${fmtNum(stats.colour_pages_today)}`} icon={FileText}    tone="blue" />
        <KpiCard delay={1} label="Revenue Today"       value={fmtMoney(stats.revenue_today)}  sub={`Cost: ${fmtMoney(stats.cost_today)}`}                                                 icon={DollarSign}  tone="success" />
        <KpiCard delay={2} label="Paper Used Today"    value={`${fmtNum(stats.estimated_paper_used)} pgs`}  sub="Estimated from completed jobs"                                           icon={Layers}      tone="warning" />
        <KpiCard delay={3} label="Printer Status"      value={`${stats.total_printers - stats.offline_printers} / ${stats.total_printers} Online`} sub={stats.offline_printers > 0 ? `${stats.offline_printers} offline` : 'All printers running'} icon={PrinterIcon} tone={stats.offline_printers > 0 ? 'warning' : 'success'} />
      </div>

      {/* Secondary stats — leaders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard delay={4} label="Most Used Printer"   value={stats.most_used_printer}       icon={PrinterIcon} tone="neutral" />
        <KpiCard delay={5} label="Most Active Computer" value={stats.most_active_computer}   icon={Monitor}     tone="neutral" />
        <KpiCard delay={6} label="Most Active Employee" value={stats.most_active_employee}   icon={User}        tone="neutral" />
        <KpiCard delay={7} label="Top Customer"         value={stats.top_customer}           icon={Users}       tone="neutral" />
      </div>

      {/* Daily trend chart */}
      <div className="dm-card p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="dm-h3 flex items-center space-x-2">
              <TrendingUp style={{ width: 15, height: 15, color: 'var(--blue-400)' }} />
              <span>7-Day Print Volume Trend</span>
            </h2>
            <p style={{ color: 'var(--text-low)', fontSize: '0.75rem', marginTop: 3 }}>Pages printed per day (BW vs Colour)</p>
          </div>
          <button
            onClick={load}
            className="dm-icon-btn"
            title="Refresh"
          >
            <RefreshCw style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {stats.daily_trend.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12" style={{ color: 'var(--text-low)' }}>
            <FileText style={{ width: 32, height: 32, marginBottom: 8 }} />
            <span style={{ fontSize: '0.75rem' }}>No print jobs in the past 7 days</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart
              data={stats.daily_trend}
              margin={{ top: 5, right: 20, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="gradBW" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#4C6FFF" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#4C6FFF" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradColour" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#7DD3FC" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#7DD3FC" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8A93BE' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#8A93BE' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
                formatter={(v: string) => <span style={{ color: 'var(--text-low)' }}>{v}</span>}
              />
              <Area
                type="monotone" dataKey="bw" name="B&W Pages"
                stroke="#4C6FFF" strokeWidth={2}
                fill="url(#gradBW)" dot={false}
              />
              <Area
                type="monotone" dataKey="colour" name="Colour Pages"
                stroke="#7DD3FC" strokeWidth={2}
                fill="url(#gradColour)" dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
