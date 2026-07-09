import { useEffect, useState, useCallback } from 'react';
import {
  History, Filter, RefreshCw, Search,
  ChevronLeft, ChevronRight, FileText
} from 'lucide-react';
import { fetchPrintJobs, fetchAllPrinters } from '../services/supabase';
import { formatCurrency } from '../utils/format';
import type { PrintJob, Printer, PrintJobStatus, ColorMode } from '../types';

// ---- helpers ----------------------------------------------------------------

const STATUS_STYLES: Record<PrintJobStatus, { bg: string; text: string }> = {
  Completed: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  Cancelled: { bg: 'bg-amber-50',   text: 'text-amber-700'   },
  Failed:    { bg: 'bg-rose-50',    text: 'text-rose-600'    },
};

const COLOR_STYLES: Record<ColorMode, { bg: string; text: string }> = {
  BW:     { bg: 'bg-slate-100', text: 'text-slate-600' },
  Colour: { bg: 'bg-amber-50',  text: 'text-amber-700' },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function fmtMoney(n: number) {
  return formatCurrency(n);
}

// ---- Filters state ----------------------------------------------------------

interface Filters {
  search: string;
  from: string;
  to: string;
  printer_id: string;
  status: string;
  color_mode: string;
}

const defaultFilters = (): Filters => {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 30);
  return {
    search: '',
    from: from.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
    printer_id: '',
    status: '',
    color_mode: '',
  };
};

const PAGE_SIZE = 20;

// ---- Main component ---------------------------------------------------------

export default function PrintHistory() {
  const [jobs, setJobs]           = useState<PrintJob[]>([]);
  const [printers, setPrinters]   = useState<Printer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filters, setFilters]     = useState<Filters>(defaultFilters);
  const [page, setPage]           = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  const loadPrinters = async () => {
    const data = await fetchAllPrinters();
    setPrinters(data);
  };

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setPage(0);
    const data = await fetchPrintJobs({
      from: filters.from ? `${filters.from}T00:00:00Z` : undefined,
      to:   filters.to   ? `${filters.to}T23:59:59Z`   : undefined,
      printerId: filters.printer_id || undefined,
      limit: 1000,
    });
    setJobs(data);
    setLoading(false);
  }, [filters.from, filters.to, filters.printer_id]);

  useEffect(() => { loadPrinters(); }, []);
  useEffect(() => { loadJobs(); }, [loadJobs]);

  // Client-side filtering for status / color / search
  const filtered = jobs.filter(j => {
    if (filters.status && j.status !== filters.status) return false;
    if (filters.color_mode && j.color_mode !== filters.color_mode) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      return (
        (j.document_name ?? '').toLowerCase().includes(q) ||
        (j.printer_name ?? '').toLowerCase().includes(q) ||
        (j.employee_name ?? '').toLowerCase().includes(q) ||
        (j.customer_name ?? '').toLowerCase().includes(q) ||
        (j.computer_name ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const inputCls = "px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";

  return (
    <div className="space-y-5" id="print-history">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-700 flex items-center space-x-2">
            <History className="w-4 h-4 text-blue-500" />
            <span>Print Job History</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {filtered.length.toLocaleString()} job{filtered.length !== 1 ? 's' : ''} found
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
              showFilters ? 'border-blue-400 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filters</span>
          </button>
          <button
            onClick={loadJobs}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Search */}
          <div className="lg:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              className={`${inputCls} pl-8 w-full`}
              placeholder="Document, employee, customer…"
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            />
          </div>
          {/* Date from */}
          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">From</label>
            <input type="date" className={`${inputCls} w-full`} value={filters.from}
              onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
          </div>
          {/* Date to */}
          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">To</label>
            <input type="date" className={`${inputCls} w-full`} value={filters.to}
              onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
          </div>
          {/* Printer */}
          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Printer</label>
            <select className={`${inputCls} w-full`} value={filters.printer_id}
              onChange={e => setFilters(f => ({ ...f, printer_id: e.target.value }))}>
              <option value="">All Printers</option>
              {printers.map(p => (
                <option key={p.id} value={p.id}>{p.printer_name}</option>
              ))}
            </select>
          </div>
          {/* Status */}
          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Status</label>
            <select className={`${inputCls} w-full`} value={filters.status}
              onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">All</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
              <option value="Failed">Failed</option>
            </select>
          </div>
          {/* Color mode */}
          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Color</label>
            <select className={`${inputCls} w-full`} value={filters.color_mode}
              onChange={e => setFilters(f => ({ ...f, color_mode: e.target.value }))}>
              <option value="">All</option>
              <option value="BW">B&W</option>
              <option value="Colour">Colour</option>
            </select>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm font-mono">Loading jobs…</span>
          </div>
        ) : paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-300">
            <FileText className="w-8 h-8 mb-2" />
            <span className="text-xs">No print jobs match the current filters</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider">
                  <th className="px-4 py-3 text-left font-semibold">Date / Time</th>
                  <th className="px-4 py-3 text-left font-semibold">Document</th>
                  <th className="px-4 py-3 text-left font-semibold">Printer</th>
                  <th className="px-4 py-3 text-left font-semibold">Computer</th>
                  <th className="px-4 py-3 text-left font-semibold">Employee</th>
                  <th className="px-4 py-3 text-left font-semibold">Customer</th>
                  <th className="px-4 py-3 text-center font-semibold">Pages</th>
                  <th className="px-4 py-3 text-center font-semibold">Color</th>
                  <th className="px-4 py-3 text-center font-semibold">Size</th>
                  <th className="px-4 py-3 text-right font-semibold">Revenue</th>
                  <th className="px-4 py-3 text-center font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.map(job => {
                  const statusStyle = STATUS_STYLES[job.status] ?? STATUS_STYLES.Completed;
                  const colorStyle  = COLOR_STYLES[job.color_mode] ?? COLOR_STYLES.BW;
                  return (
                    <tr key={job.id} className="hover:bg-slate-50/50 transition">
                      <td className="px-4 py-3 text-slate-500 font-mono whitespace-nowrap">
                        {fmtDate(job.print_time)}
                      </td>
                      <td className="px-4 py-3 max-w-[140px]">
                        <span className="truncate block text-slate-700 font-medium" title={job.document_name ?? ''}>
                          {job.document_name || <span className="text-slate-300 italic">Untitled</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{job.printer_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{job.computer_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{job.employee_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{job.customer_name || '—'}</td>
                      <td className="px-4 py-3 text-center font-bold text-slate-700">{job.page_count}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${colorStyle.bg} ${colorStyle.text}`}>
                          {job.color_mode}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-500">{job.paper_size}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">
                        {fmtMoney(job.revenue)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold ${statusStyle.bg} ${statusStyle.text}`}>
                          {job.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Page {page + 1} of {totalPages} · {filtered.length} total jobs
          </span>
          <div className="flex items-center space-x-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-slate-500" />
            </button>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
