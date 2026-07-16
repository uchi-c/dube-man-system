import React, { useEffect, useState } from 'react';
import {
  BarChart2, PrinterIcon, User, Users, Monitor,
  RefreshCw, FileText
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  fetchPrintReportByPrinter, fetchPrintReportByEmployee,
  fetchPrintReportByCustomer, fetchPrintReportByComputer
} from '../services/supabase';
import { formatCurrency } from '../utils/format';
import type { PrintReportRow } from '../types';

// ---- Types ------------------------------------------------------------------

type ReportGroup = 'printer' | 'employee' | 'customer' | 'computer';

const GROUPS: { id: ReportGroup; label: string; icon: React.ElementType }[] = [
  { id: 'printer',  label: 'By Printer',   icon: PrinterIcon },
  { id: 'employee', label: 'By Employee',  icon: User },
  { id: 'customer', label: 'By Customer',  icon: Users },
  { id: 'computer', label: 'By Computer',  icon: Monitor },
];

// ---- helpers ----------------------------------------------------------------

function fmtMoney(n: number) {
  return formatCurrency(n);
}

// ---- Summary row ------------------------------------------------------------

function SummaryRow({ row, rank }: { row: PrintReportRow; rank: number }) {
  const profitColor = row.profit >= 0 ? 'var(--success)' : 'var(--danger)';
  return (
    <tr className="dm-row" style={{ fontSize: '0.75rem', borderTop: '1px solid var(--panel-line)' }}>
      <td className="px-4 py-3">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center flex-shrink-0" style={{ width: 24, height: 24, borderRadius: 8, background: 'var(--blue-bg)', color: 'var(--blue-400)', fontSize: '0.625rem', fontWeight: 700 }}>
            #{rank}
          </div>
          <span className="dm-truncate" style={{ fontWeight: 600, color: 'var(--text-mid)' }}>{row.label || '—'}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-center" style={{ color: 'var(--text-mid)' }}>{row.jobs.toLocaleString()}</td>
      <td className="px-4 py-3 text-center" style={{ fontWeight: 600, color: 'var(--text-mid)' }}>{row.pages.toLocaleString()}</td>
      <td className="px-4 py-3 text-center" style={{ color: 'var(--text-low)' }}>{row.bw_pages.toLocaleString()}</td>
      <td className="px-4 py-3 text-center" style={{ color: 'var(--warning)' }}>{row.colour_pages.toLocaleString()}</td>
      <td className="px-4 py-3 text-right" style={{ fontWeight: 600, color: 'var(--text-mid)' }}>{fmtMoney(row.revenue)}</td>
      <td className="px-4 py-3 text-right" style={{ color: 'var(--text-low)' }}>{fmtMoney(row.cost)}</td>
      <td className="px-4 py-3 text-right" style={{ fontWeight: 700, color: profitColor }}>{fmtMoney(row.profit)}</td>
    </tr>
  );
}

// ---- Custom tooltip ---------------------------------------------------------

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--panel-line-strong)', color: 'var(--text-hi)', borderRadius: 10, padding: '8px 12px', fontSize: 12, boxShadow: 'var(--shadow-card)' }}>
      <div className="dm-truncate" style={{ fontWeight: 700, color: 'var(--text-mid)', marginBottom: 4, maxWidth: 180 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center space-x-2">
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
          <span style={{ color: 'var(--text-low)' }}>{p.name}:</span>
          <span style={{ fontWeight: 700 }}>{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</span>
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

  return (
    <div className="space-y-5" id="print-reports">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="dm-h3 flex items-center space-x-2">
            <BarChart2 style={{ width: 15, height: 15, color: 'var(--blue-400)' }} />
            <span>Print Reports</span>
          </h2>
          <p style={{ color: 'var(--text-low)', fontSize: '0.75rem', marginTop: 3 }}>
            Revenue, pages, and job breakdown
          </p>
        </div>
        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          <input type="date" className="dm-input" style={{ width: 'auto' }} value={from} onChange={e => setFrom(e.target.value)} />
          <span style={{ color: 'var(--text-low)', fontSize: '0.75rem' }}>→</span>
          <input type="date" className="dm-input" style={{ width: 'auto' }} value={to} onChange={e => setTo(e.target.value)} />
          <button
            onClick={load}
            className="dm-icon-btn"
          >
            <RefreshCw className={loading ? 'dm-spin' : ''} style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </div>

      {/* Group tabs */}
      <div className="flex flex-wrap gap-2">
        {GROUPS.map(g => {
          const Icon = g.icon;
          const active = group === g.id;
          return (
            <button
              key={g.id}
              onClick={() => setGroup(g.id)}
              className={`dm-badge ${active ? 'dm-badge-info' : 'dm-badge-neutral'}`}
              style={{ cursor: 'pointer', padding: '0.5rem 0.9rem', fontSize: '0.78rem' }}
            >
              <Icon style={{ width: 13, height: 13 }} />
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
          <div key={kpi.label} className="dm-card p-4">
            <div className="dm-label" style={{ padding: 0 }}>{kpi.label}</div>
            <div className="dm-nums" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-hi)', marginTop: 4 }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20" style={{ color: 'var(--text-low)' }}>
          <RefreshCw className="dm-spin" style={{ width: 18, height: 18, marginRight: 8 }} />
          <span style={{ fontSize: '0.8125rem', fontFamily: 'monospace' }}>Building report…</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="dm-card-inset flex flex-col items-center text-center" style={{ padding: '4rem 1.5rem', borderStyle: 'dashed' }}>
          <FileText style={{ width: 32, height: 32, marginBottom: 8, color: 'var(--text-low)' }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-low)' }}>No data in selected period</span>
        </div>
      ) : (
        <>
          {/* Bar chart */}
          <div className="dm-card p-6">
            <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-mid)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Pages by {GROUPS.find(g => g.id === group)?.label.replace('By ', '') ?? ''}
              <span style={{ color: 'var(--text-low)', fontWeight: 400, marginLeft: 8 }}>(top 8)</span>
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#8A93BE' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#8A93BE' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => <span style={{ color: 'var(--text-low)' }}>{v}</span>} />
                <Bar dataKey="B&W"    stackId="a" fill="#4C6FFF" radius={[0,0,4,4]} />
                <Bar dataKey="Colour" stackId="a" fill="#7DD3FC" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Data table */}
          <div className="dm-card" style={{ overflow: 'hidden', padding: 0 }}>
            <div className="dm-scroll-x">
              <table className="w-full dm-nums">
                <thead>
                  <tr style={{ background: 'var(--panel-2)', color: 'var(--text-low)', fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <th className="px-4 py-3 text-left" style={{ fontWeight: 600 }}>
                      {GROUPS.find(g => g.id === group)?.label.replace('By ', '') ?? 'Label'}
                    </th>
                    <th className="px-4 py-3 text-center" style={{ fontWeight: 600 }}>Jobs</th>
                    <th className="px-4 py-3 text-center" style={{ fontWeight: 600 }}>Total Pages</th>
                    <th className="px-4 py-3 text-center" style={{ fontWeight: 600 }}>B&amp;W</th>
                    <th className="px-4 py-3 text-center" style={{ fontWeight: 600 }}>Colour</th>
                    <th className="px-4 py-3 text-right" style={{ fontWeight: 600 }}>Revenue</th>
                    <th className="px-4 py-3 text-right" style={{ fontWeight: 600 }}>Cost</th>
                    <th className="px-4 py-3 text-right" style={{ fontWeight: 600 }}>Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <SummaryRow key={i} row={row} rank={i + 1} />
                  ))}
                </tbody>
                {/* Totals row */}
                <tfoot>
                  <tr style={{ background: 'var(--panel-2)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-hi)', borderTop: '2px solid var(--panel-line-strong)' }}>
                    <td className="px-4 py-3">TOTAL</td>
                    <td className="px-4 py-3 text-center">{totals.jobs.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">{totals.pages.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">{rows.reduce((a,r) => a+r.bw_pages, 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">{rows.reduce((a,r) => a+r.colour_pages, 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{fmtMoney(totals.revenue)}</td>
                    <td className="px-4 py-3 text-right">{fmtMoney(rows.reduce((a,r) => a+r.cost, 0))}</td>
                    <td className="px-4 py-3 text-right" style={{ color: totals.profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
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
