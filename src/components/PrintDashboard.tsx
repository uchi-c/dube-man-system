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
import type { PrintDashboardStats } from '../types';

// ---- KPI card ---------------------------------------------------------------

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color: string;    // tailwind bg class on icon container
  iconColor: string;
  delay?: number;
}

function KpiCard({ label, value, sub, icon: Icon, color, iconColor, delay = 0 }: KpiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.06 }}
      whileHover={{ y: -2 }}
      className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm flex items-center space-x-4"
    >
      <div className={`p-3.5 rounded-2xl ${color} flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </div>
        <div className="text-xl font-bold text-slate-800 mt-0.5 truncate">{value}</div>
        {sub && (
          <div className="text-[10px] text-slate-400 mt-0.5 font-mono">{sub}</div>
        )}
      </div>
    </motion.div>
  );
}

// ---- Printer status badge ---------------------------------------------------

function StatusBadge({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${color}`}>
      <span className="text-xs font-semibold">{label}</span>
      <span className="text-lg font-extrabold">{count}</span>
    </div>
  );
}

// ---- Custom tooltip for the chart -------------------------------------------

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 text-white text-xs px-3 py-2 rounded-xl shadow-lg space-y-1">
      <div className="font-bold text-slate-300 mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}:</span>
          <span className="font-bold">{p.value}</span>
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
      <div className="flex items-center justify-center py-20 text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm font-mono">Loading print dashboard…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16 text-rose-500 space-x-2">
        <AlertTriangle className="w-5 h-5" />
        <span className="text-sm">{error}</span>
        <button onClick={load} className="ml-3 text-xs underline text-slate-500 hover:text-slate-700">
          Retry
        </button>
      </div>
    );
  }

  if (!stats) return null;

  const fmtNum = (n: number) => n.toLocaleString();
  const fmtMoney = (n: number) =>
    'ZMW ' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6" id="print-dashboard">
      {/* Offline printer alert */}
      {stats.offline_printers > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start space-x-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-amber-800"
        >
          <WifiOff className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs">
            <span className="font-bold">
              {stats.offline_printers} printer{stats.offline_printers > 1 ? 's' : ''} offline
            </span>
            {' '}— check the Printers tab for details.
          </div>
        </motion.div>
      )}

      {/* KPI grid — 4 columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard delay={0} label="Pages Today"         value={fmtNum(stats.pages_today)}      sub={`BW: ${fmtNum(stats.bw_pages_today)} · Colour: ${fmtNum(stats.colour_pages_today)}`} icon={FileText}    color="bg-blue-50"    iconColor="text-blue-500" />
        <KpiCard delay={1} label="Revenue Today"       value={fmtMoney(stats.revenue_today)}  sub={`Cost: ${fmtMoney(stats.cost_today)}`}                                                 icon={DollarSign}  color="bg-emerald-50" iconColor="text-emerald-500" />
        <KpiCard delay={2} label="Paper Used Today"    value={`${fmtNum(stats.estimated_paper_used)} pgs`}  sub="Estimated from completed jobs"                                           icon={Layers}      color="bg-amber-50"   iconColor="text-amber-500" />
        <KpiCard delay={3} label="Printer Status"      value={`${stats.total_printers - stats.offline_printers} / ${stats.total_printers} Online`} sub={stats.offline_printers > 0 ? `${stats.offline_printers} offline` : 'All printers running'} icon={PrinterIcon} color="bg-rose-50" iconColor="text-rose-500" />
      </div>

      {/* Secondary stats — leaders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard delay={4} label="Most Used Printer"   value={stats.most_used_printer}       icon={PrinterIcon} color="bg-slate-100" iconColor="text-slate-500" />
        <KpiCard delay={5} label="Most Active Computer" value={stats.most_active_computer}   icon={Monitor}     color="bg-slate-100" iconColor="text-slate-500" />
        <KpiCard delay={6} label="Most Active Employee" value={stats.most_active_employee}   icon={User}        color="bg-slate-100" iconColor="text-slate-500" />
        <KpiCard delay={7} label="Top Customer"         value={stats.top_customer}           icon={Users}       color="bg-slate-100" iconColor="text-slate-500" />
      </div>

      {/* Daily trend chart */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              <span>7-Day Print Volume Trend</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Pages printed per day (BW vs Colour)</p>
          </div>
          <button
            onClick={load}
            className="p-2 rounded-xl hover:bg-slate-50 border border-slate-200 transition cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>

        {stats.daily_trend.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-300">
            <FileText className="w-8 h-8 mb-2" />
            <span className="text-xs">No print jobs in the past 7 days</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart
              data={stats.daily_trend}
              margin={{ top: 5, right: 20, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="gradBW" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradColour" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
                formatter={(v: string) => <span className="text-slate-500">{v}</span>}
              />
              <Area
                type="monotone" dataKey="bw" name="B&W Pages"
                stroke="#3b82f6" strokeWidth={2}
                fill="url(#gradBW)" dot={false}
              />
              <Area
                type="monotone" dataKey="colour" name="Colour Pages"
                stroke="#f59e0b" strokeWidth={2}
                fill="url(#gradColour)" dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
