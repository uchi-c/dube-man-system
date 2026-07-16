import { useEffect, useState, useCallback } from 'react';
import {
  History, Filter, RefreshCw, Search,
  ChevronLeft, ChevronRight, FileText
} from 'lucide-react';
import { fetchPrintJobs, fetchAllPrinters } from '../services/supabase';
import { formatCurrency } from '../utils/format';
import type { PrintJob, Printer, PrintJobStatus, ColorMode } from '../types';

// ---- helpers ----------------------------------------------------------------

const STATUS_BADGE: Record<PrintJobStatus, string> = {
  Completed: 'dm-badge-success',
  Cancelled: 'dm-badge-warning',
  Failed:    'dm-badge-danger',
};

const COLOR_BADGE: Record<ColorMode, string> = {
  BW:     'dm-badge-neutral',
  Colour: 'dm-badge-warning',
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

  return (
    <div className="space-y-5" id="print-history">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="dm-h3 flex items-center space-x-2">
            <History style={{ width: 15, height: 15, color: 'var(--blue-400)' }} />
            <span>Print Job History</span>
          </h2>
          <p style={{ color: 'var(--text-low)', fontSize: '0.75rem', marginTop: 3 }}>
            {filtered.length.toLocaleString()} job{filtered.length !== 1 ? 's' : ''} found
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`dm-btn ${showFilters ? 'dm-btn-primary' : 'dm-btn-ghost'}`}
            style={{ minHeight: 36, padding: '0 0.85rem', fontSize: '0.75rem' }}
          >
            <Filter style={{ width: 13, height: 13 }} />
            <span>Filters</span>
          </button>
          <button
            onClick={loadJobs}
            className="dm-icon-btn"
          >
            <RefreshCw className={loading ? 'dm-spin' : ''} style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="dm-card p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Search */}
          <div className="lg:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2" style={{ width: 14, height: 14, color: 'var(--text-low)' }} />
            <input
              className="dm-input w-full"
              style={{ paddingLeft: '2.25rem' }}
              placeholder="Document, employee, customer…"
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            />
          </div>
          {/* Date from */}
          <div>
            <label className="dm-label" style={{ display: 'block', padding: 0, marginBottom: 4 }}>From</label>
            <input type="date" className="dm-input w-full" value={filters.from}
              onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
          </div>
          {/* Date to */}
          <div>
            <label className="dm-label" style={{ display: 'block', padding: 0, marginBottom: 4 }}>To</label>
            <input type="date" className="dm-input w-full" value={filters.to}
              onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
          </div>
          {/* Printer */}
          <div>
            <label className="dm-label" style={{ display: 'block', padding: 0, marginBottom: 4 }}>Printer</label>
            <select className="dm-select w-full" value={filters.printer_id}
              onChange={e => setFilters(f => ({ ...f, printer_id: e.target.value }))}>
              <option value="">All Printers</option>
              {printers.map(p => (
                <option key={p.id} value={p.id}>{p.printer_name}</option>
              ))}
            </select>
          </div>
          {/* Status */}
          <div>
            <label className="dm-label" style={{ display: 'block', padding: 0, marginBottom: 4 }}>Status</label>
            <select className="dm-select w-full" value={filters.status}
              onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">All</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
              <option value="Failed">Failed</option>
            </select>
          </div>
          {/* Color mode */}
          <div>
            <label className="dm-label" style={{ display: 'block', padding: 0, marginBottom: 4 }}>Color</label>
            <select className="dm-select w-full" value={filters.color_mode}
              onChange={e => setFilters(f => ({ ...f, color_mode: e.target.value }))}>
              <option value="">All</option>
              <option value="BW">B&amp;W</option>
              <option value="Colour">Colour</option>
            </select>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="dm-card" style={{ overflow: 'hidden', padding: 0 }}>
        {loading ? (
          <div className="flex items-center justify-center py-20" style={{ color: 'var(--text-low)' }}>
            <RefreshCw className="dm-spin" style={{ width: 18, height: 18, marginRight: 8 }} />
            <span style={{ fontSize: '0.8125rem', fontFamily: 'monospace' }}>Loading jobs…</span>
          </div>
        ) : paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--text-low)' }}>
            <FileText style={{ width: 32, height: 32, marginBottom: 8 }} />
            <span style={{ fontSize: '0.75rem' }}>No print jobs match the current filters</span>
          </div>
        ) : (
          <div className="dm-scroll-x">
            <table className="w-full dm-nums" style={{ fontSize: '0.75rem' }}>
              <thead>
                <tr style={{ background: 'var(--panel-2)', color: 'var(--text-low)', fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th className="px-4 py-3 text-left" style={{ fontWeight: 600 }}>Date / Time</th>
                  <th className="px-4 py-3 text-left" style={{ fontWeight: 600 }}>Document</th>
                  <th className="px-4 py-3 text-left" style={{ fontWeight: 600 }}>Printer</th>
                  <th className="px-4 py-3 text-left" style={{ fontWeight: 600 }}>Computer</th>
                  <th className="px-4 py-3 text-left" style={{ fontWeight: 600 }}>Employee</th>
                  <th className="px-4 py-3 text-left" style={{ fontWeight: 600 }}>Customer</th>
                  <th className="px-4 py-3 text-center" style={{ fontWeight: 600 }}>Pages</th>
                  <th className="px-4 py-3 text-center" style={{ fontWeight: 600 }}>Color</th>
                  <th className="px-4 py-3 text-center" style={{ fontWeight: 600 }}>Size</th>
                  <th className="px-4 py-3 text-right" style={{ fontWeight: 600 }}>Revenue</th>
                  <th className="px-4 py-3 text-center" style={{ fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(job => (
                  <tr key={job.id} className="dm-row" style={{ borderTop: '1px solid var(--panel-line)' }}>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-low)', fontFamily: 'monospace' }}>
                      {fmtDate(job.print_time)}
                    </td>
                    <td className="px-4 py-3" style={{ maxWidth: 140 }}>
                      <span className="dm-truncate" style={{ display: 'block', color: 'var(--text-mid)', fontWeight: 500 }} title={job.document_name ?? ''}>
                        {job.document_name || <span style={{ color: 'var(--text-low)', fontStyle: 'italic' }}>Untitled</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-mid)' }}>{job.printer_name || '—'}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-low)' }}>{job.computer_name || '—'}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-low)' }}>{job.employee_name || '—'}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-low)' }}>{job.customer_name || '—'}</td>
                    <td className="px-4 py-3 text-center" style={{ fontWeight: 700, color: 'var(--text-mid)' }}>{job.page_count}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`dm-badge ${COLOR_BADGE[job.color_mode] ?? 'dm-badge-neutral'}`}>
                        {job.color_mode}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center" style={{ color: 'var(--text-low)' }}>{job.paper_size}</td>
                    <td className="px-4 py-3 text-right" style={{ fontWeight: 600, color: 'var(--text-mid)' }}>
                      {fmtMoney(job.revenue)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`dm-badge ${STATUS_BADGE[job.status] ?? 'dm-badge-success'}`}>
                        {job.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span style={{ fontSize: '0.75rem', color: 'var(--text-low)' }}>
            Page {page + 1} of {totalPages} · {filtered.length} total jobs
          </span>
          <div className="flex items-center space-x-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="dm-icon-btn"
              style={{ width: 36, height: 36, opacity: page === 0 ? 0.4 : 1, cursor: page === 0 ? 'not-allowed' : 'pointer' }}
            >
              <ChevronLeft style={{ width: 14, height: 14 }} />
            </button>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              className="dm-icon-btn"
              style={{ width: 36, height: 36, opacity: page >= totalPages - 1 ? 0.4 : 1, cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer' }}
            >
              <ChevronRight style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
