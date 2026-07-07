import React, { useEffect, useState } from 'react';
import {
  BarChart2, PrinterIcon, User, Users, Monitor,
  RefreshCw, Download, FileText
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import {
  fetchPrintReportByPrinter, fetchPrintReportByEmployee,
  fetchPrintReportByCustomer, fetchPrintReportByComputer
} from '../services/supabase';
import type { PrintReportRow } from '../types';

// ---- Types ------------------------------------------------------------------

type ReportGroup = 'printer' | 'employee' | 'customer' | 'computer';

const GROUPS: { id: ReportGroup; label: string; icon: React.ElementType }[] = [
  { id: 'printer',  label: 'By Printer',   icon: PrinterIcon },
  { id: 'employee', label: 'By Employee',  icon: User },
  { id: 'customer', label: 'By Customer',  icon: Users },
  { id: 'computer', label: 'By Computer',  icon: Monitor },
];

const COLORS = [
  '#3b82f6','#f59e0b','#10b981','#8b5cf6',
  '#ef4444','#06b6d4','#ec4899','#84cc16',
];

// ---- helpers ----------------------------------------------------------------

function fmtMoney(n: number) {
  return 'ZMW ' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---- Summary row ------------------------------------------------------------

function SummaryRow({ row, rank }: { row: PrintReportRow; rank: number }) {
  const profitColor = row.profit >= 0 ? 'text-emerald-600' : 'text-rose-500';
  return (
    <tr className="hover:bg-slate-50/50 transition text-xs">
      <td className="px-4 py-3">
        <div className="flex items-center space-x-3">
          <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-600 text-[10px] font-extrabold flex items-center justify-center flex-shrink-0">
            #{rank}
          </div>
          <span className="font-semibold text-slate-700 truncate">{row.label || '—'}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-center text-slate-600">{row.jobs.toLocaleString()}</td>
      <td className="px-4 py-3 text-center font-semibold text-slate-700">{row.pages.toLocaleString()}</td>
      <td className="px-4 py-3 text-center text-slate-500">{row.bw_pages.toLocaleString()}</td>
      <td className="px-4 py-3 text-center text-amber-600">{row.colour_pages.toLocaleString()}</td>
      <td className="px-4 py-3 text-right font-semibold text-slate-700">{fmtMoney(row.revenue)}</td>
      <td className="px-4 py-3 text-right text-slate-500">{fmtMoney(row.cost)}</td>
      <td className={`px-4 py-3 text-right font-bold ${profitColor}`}>{fmtMoney(row.profit)}</td>
    </tr>
  );
}

// ---- Custom tooltip ---------------------------------------------------------

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 text-white text-xs px-3 py-2 rounded-xl shadow-lg space-y-1">
      <div className="font-bold text-slate-300 mb-1 truncate max-w-[180px]">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}:</span>
          <span className="font-bold">{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ---- Main component ---------------------------------------------------------

export default function PrintReports() {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [group, setGroup]   = useState<ReportGroup>('printer');
  const [rows, setRows]     = useState<PrintReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom]     = useState(firstOfMonth.toISOString().slice(0, 10));
  const [to, setTo]         = useState(today.toISOString().slice(0, 10));

  const load = async () => {
    setLoading(true);
    const fromISO = `${from}T00:00:00Z`;
    const toISO   = `${to}T23:59:59Z`;
    let data: PrintReportRow[] = [];
    if (group === 'printer')  data = await fetchPrintReportByPrinter(fromISO, toISO);
    if (group === 'employee') data = await fetchPrintReportByEmployee(fromISO, toISO);
    if (group === 'customer') data = await fetchPrintReportByCustomer(fromISO, toISO);
    if (group === 'computer') data = await fetchPrintReportByComputer(fromISO, toISO);
    setRows(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [group, from, to]);

  // Totals
  const totals = rows.reduce(
    (acc, r) => ({
      jobs: acc.jobs + r.jobs,
      pages: acc.pages + r.pages,
      revenue: acc.revenue + r.revenue,
      profit: acc.profit + r.profit,
    }),
    { jobs: 0, pages: 0, revenue: 0, profit: 0 }
  );

  // Top 8 for chart
  const chartData = rows.slice(0, 8).map(r => ({
    name: r.label.length > 16 ? r.label.slice(0, 14) + '…' : r.label,
    'B&W': r.bw_pages,
    'Colour': r.colour_pages,
    Revenue: Math.round(r.revenue * 100) / 100,
  }));

  const inputCls = "px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

  return (
    <div className="space-y-5" id="print-reports">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-700 flex items-center space-x-2">
            <BarChart2 className="w-4 h-4 text-blue-500" />
            <span>Print Reports</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Revenue, pages, and job breakdown
          </p>
        </div>
        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          <input type="date" className={inputCls} value={from} onChange={e => setFrom(e.target.value)} />
          <span className="text-slate-300 text-xs">→</span>
          <input type="date" className={inputCls} value={to} onChange={e => setTo(e.target.value)} />
          <button
            onClick={load}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Group tabs */}
      <div className="flex flex-wrap gap-2">
        {GROUPS.map(g => {
          const Icon = g.icon;
          return (
            <button
              key={g.id}
              onClick={() => setGroup(g.id)}
              className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                group === g.id
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${group === g.id ? 'text-white' : 'text-slate-400'}`} />
              <span>{g.label}</span>
            </button>
          );
        })}
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Jobs',    value: totals.jobs.toLocaleString() },
          { label: 'Total Pages',   value: totals.pages.toLocaleString() },
          { label: 'Total Revenue', value: fmtMoney(totals.revenue) },
          { label: 'Net Profit',    value: fmtMoney(totals.profit) },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{kpi.label}</div>
            <div className="text-lg font-extrabold text-slate-800 mt-1">{kpi.value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm font-mono">Building report…</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-16 flex flex-col items-center text-slate-300">
          <FileText className="w-8 h-8 mb-2" />
          <span className="text-xs">No data in selected period</span>
        </div>
      ) : (
        <>
          {/* Bar chart */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6">
            <h3 className="text-xs font-bold text-slate-600 mb-4 uppercase tracking-wider">
              Pages by {GROUPS.find(g => g.id === group)?.label.replace('By ', '') ?? ''}
              <span className="text-slate-400 font-normal ml-2">(top 8)</span>
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="B&W"    stackId="a" fill="#3b82f6" radius={[0,0,4,4]} />
                <Bar dataKey="Colour" stackId="a" fill="#f59e0b" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Data table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-wider">
                    <th className="px-4 py-3 text-left font-semibold">
                      {GROUPS.find(g => g.id === group)?.label.replace('By ', '') ?? 'Label'}
                    </th>
                    <th className="px-4 py-3 text-center font-semibold">Jobs</th>
                    <th className="px-4 py-3 text-center font-semibold">Total Pages</th>
                    <th className="px-4 py-3 text-center font-semibold">B&W</th>
                    <th className="px-4 py-3 text-center font-semibold">Colour</th>
                    <th className="px-4 py-3 text-right font-semibold">Revenue</th>
                    <th className="px-4 py-3 text-right font-semibold">Cost</th>
                    <th className="px-4 py-3 text-right font-semibold">Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row, i) => (
                    <SummaryRow key={i} row={row} rank={i + 1} />
                  ))}
                </tbody>
                {/* Totals row */}
                <tfoot>
                  <tr className="bg-slate-50 text-xs font-bold text-slate-700 border-t-2 border-slate-200">
                    <td className="px-4 py-3">TOTAL</td>
                    <td className="px-4 py-3 text-center">{totals.jobs.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">{totals.pages.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">{rows.reduce((a,r) => a+r.bw_pages, 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">{rows.reduce((a,r) => a+r.colour_pages, 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{fmtMoney(totals.revenue)}</td>
                    <td className="px-4 py-3 text-right">{fmtMoney(rows.reduce((a,r) => a+r.cost, 0))}</td>
                    <td className={`px-4 py-3 text-right ${totals.profit >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {fmtMoney(totals.profit)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
