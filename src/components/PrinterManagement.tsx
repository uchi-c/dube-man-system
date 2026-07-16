import React, { useEffect, useState } from 'react';
import {
  PrinterIcon, Plus, Edit2, Power, RefreshCw, X, Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  fetchAllPrinters, insertPrinter, updatePrinter, disablePrinter
} from '../services/supabase';
import { formatCurrency } from '../utils/format';
import type { Printer, PrinterStatus, PaperSize } from '../types';

const PAPER_SIZES: PaperSize[] = ['A4', 'A3', 'A5', 'Letter', 'Legal', 'Custom'];

const STATUS_BADGE: Record<PrinterStatus, string> = {
  Online: 'dm-badge-success',
  Offline: 'dm-badge-neutral',
  Paused: 'dm-badge-warning',
  Error: 'dm-badge-danger',
};

// ---- empty form state -------------------------------------------------------

const emptyForm = (): Omit<Printer, 'id' | 'created_at' | 'updated_at'> => ({
  printer_name: '',
  windows_printer_name: '',
  location: '',
  branch: '',
  status: 'Offline',
  cost_per_bw_page: 1.0,
  cost_per_colour_page: 5.0,
  paper_sizes: ['A4'],
  is_active: true,
});

// ---- Printer form modal -----------------------------------------------------

interface PrinterFormProps {
  initial?: Printer;
  onSave: (data: Omit<Printer, 'id' | 'created_at' | 'updated_at'> & { id?: string }) => Promise<void>;
  onClose: () => void;
  saving: boolean;
}

function PrinterForm({ initial, onSave, onClose, saving }: PrinterFormProps) {
  const [form, setForm] = useState(
    initial
      ? {
          printer_name: initial.printer_name,
          windows_printer_name: initial.windows_printer_name,
          location: initial.location,
          branch: initial.branch,
          status: initial.status,
          cost_per_bw_page: initial.cost_per_bw_page,
          cost_per_colour_page: initial.cost_per_colour_page,
          paper_sizes: initial.paper_sizes,
          is_active: initial.is_active,
        }
      : emptyForm()
  );

  const togglePaperSize = (size: PaperSize) => {
    setForm(f => ({
      ...f,
      paper_sizes: f.paper_sizes.includes(size)
        ? f.paper_sizes.filter(s => s !== size)
        : [...f.paper_sizes, size]
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(initial ? { ...form, id: initial.id } : form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(7,11,36,0.75)', backdropFilter: 'blur(4px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="dm-card-glass w-full max-w-lg"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--panel-line)' }}>
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--blue-bg)', color: 'var(--blue-400)' }}>
              <PrinterIcon style={{ width: 16, height: 16 }} />
            </div>
            <h3 className="dm-h3">
              {initial ? 'Edit Printer' : 'Register Printer'}
            </h3>
          </div>
          <button onClick={onClose} className="dm-icon-btn">
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="dm-label" style={{ display: 'block', marginBottom: 4 }}>Display Name *</label>
              <input
                required
                className="dm-input"
                placeholder="e.g. Front Office Printer"
                value={form.printer_name}
                onChange={e => setForm(f => ({ ...f, printer_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="dm-label" style={{ display: 'block', marginBottom: 4 }}>Windows Printer Name *</label>
              <input
                required
                className="dm-input"
                placeholder="Exact name in Windows"
                value={form.windows_printer_name}
                onChange={e => setForm(f => ({ ...f, windows_printer_name: e.target.value }))}
              />
              <p style={{ fontSize: '0.5625rem', color: 'var(--text-low)', marginTop: 4 }}>
                Must match exactly what Windows shows in Devices &amp; Printers
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="dm-label" style={{ display: 'block', marginBottom: 4 }}>Location</label>
              <input
                className="dm-input"
                placeholder="e.g. Reception"
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              />
            </div>
            <div>
              <label className="dm-label" style={{ display: 'block', marginBottom: 4 }}>Branch</label>
              <input
                className="dm-input"
                placeholder="e.g. Main Branch"
                value={form.branch}
                onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="dm-label" style={{ display: 'block', marginBottom: 4 }}>BW Cost / Page (ZMW)</label>
              <input
                type="number" min="0" step="0.01"
                className="dm-input"
                style={{ fontFamily: 'monospace' }}
                value={form.cost_per_bw_page}
                onChange={e => setForm(f => ({ ...f, cost_per_bw_page: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="dm-label" style={{ display: 'block', marginBottom: 4 }}>Colour Cost / Page (ZMW)</label>
              <input
                type="number" min="0" step="0.01"
                className="dm-input"
                style={{ fontFamily: 'monospace' }}
                value={form.cost_per_colour_page}
                onChange={e => setForm(f => ({ ...f, cost_per_colour_page: Number(e.target.value) }))}
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="dm-label" style={{ display: 'block', marginBottom: 4 }}>Status</label>
            <select
              className="dm-select"
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value as PrinterStatus }))}
            >
              {(['Online','Offline','Paused','Error'] as PrinterStatus[]).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Paper sizes */}
          <div>
            <label className="dm-label" style={{ display: 'block', marginBottom: 4 }}>Supported Paper Sizes</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {PAPER_SIZES.map(size => (
                <button
                  key={size}
                  type="button"
                  onClick={() => togglePaperSize(size)}
                  className={`dm-badge ${form.paper_sizes.includes(size) ? 'dm-badge-info' : 'dm-badge-neutral'}`}
                  style={{ cursor: 'pointer' }}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="dm-btn dm-btn-ghost flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="dm-btn dm-btn-primary flex-1"
            >
              {saving ? (
                <RefreshCw className="dm-spin" style={{ width: 14, height: 14 }} />
              ) : (
                <Save style={{ width: 14, height: 14 }} />
              )}
              <span>{saving ? 'Saving…' : 'Save Printer'}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ---- Main component ---------------------------------------------------------

export default function PrinterManagement() {
  const [printers, setPrinters]     = useState<Printer[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editTarget, setEditTarget] = useState<Printer | null>(null);
  const [saving, setSaving]         = useState(false);
  const [disabling, setDisabling]   = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const data = await fetchAllPrinters();
    setPrinters(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (
    data: Omit<Printer, 'id' | 'created_at' | 'updated_at'> & { id?: string }
  ) => {
    setSaving(true);
    try {
      if (data.id) {
        // Edit
        const existing = printers.find(p => p.id === data.id)!;
        await updatePrinter({ ...existing, ...data });
      } else {
        await insertPrinter(data);
      }
      await load();
      setShowForm(false);
      setEditTarget(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async (id: string) => {
    if (!confirm('Disable this printer? It will no longer appear in active lists.')) return;
    setDisabling(id);
    await disablePrinter(id);
    await load();
    setDisabling(null);
  };

  return (
    <div className="space-y-5" id="printer-management">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h2 className="dm-h3">Registered Printers</h2>
        <div className="flex items-center space-x-2">
          <button
            onClick={load}
            className="dm-icon-btn"
          >
            <RefreshCw className={loading ? 'dm-spin' : ''} style={{ width: 14, height: 14 }} />
          </button>
          <button
            onClick={() => { setEditTarget(null); setShowForm(true); }}
            className="dm-btn dm-btn-primary"
          >
            <Plus style={{ width: 14, height: 14 }} />
            <span>Add Printer</span>
          </button>
        </div>
      </div>

      {/* Printer cards */}
      {loading ? (
        <div className="flex items-center justify-center py-20" style={{ color: 'var(--text-low)' }}>
          <RefreshCw className="dm-spin" style={{ width: 18, height: 18, marginRight: 8 }} />
          <span style={{ fontSize: '0.8125rem', fontFamily: 'monospace' }}>Loading printers…</span>
        </div>
      ) : printers.length === 0 ? (
        <div className="dm-card-inset flex flex-col items-center text-center" style={{ padding: '4rem 1.5rem', borderStyle: 'dashed' }}>
          <PrinterIcon style={{ width: 40, height: 40, marginBottom: 12, color: 'var(--text-low)' }} />
          <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-mid)' }}>No printers registered yet</p>
          <p style={{ fontSize: '0.75rem', marginTop: 4, color: 'var(--text-low)' }}>Add your first printer to start monitoring print jobs.</p>
          <button
            onClick={() => setShowForm(true)}
            className="dm-btn dm-btn-primary"
            style={{ marginTop: 20 }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            <span>Register First Printer</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {printers.map((printer, i) => {
            return (
              <motion.div
                key={printer.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="dm-card p-5 space-y-4"
                style={{ opacity: printer.is_active ? 1 : 0.5 }}
              >
                {/* Header row */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center justify-center flex-shrink-0" style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--blue-bg)', color: 'var(--blue-400)' }}>
                      <PrinterIcon style={{ width: 16, height: 16 }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-hi)' }}>{printer.printer_name}</div>
                      <div className="dm-truncate" style={{ fontSize: '0.625rem', color: 'var(--text-low)', fontFamily: 'monospace', marginTop: 2, maxWidth: 160 }}>
                        {printer.windows_printer_name}
                      </div>
                    </div>
                  </div>
                  {/* Status badge */}
                  <span className={`dm-badge ${STATUS_BADGE[printer.status] ?? 'dm-badge-neutral'}`}>
                    {printer.status}
                  </span>
                </div>

                {/* Meta */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 dm-nums" style={{ fontSize: '0.75rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-low)' }}>Location</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-mid)', marginTop: 2 }}>{printer.location || '—'}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-low)' }}>Branch</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-mid)', marginTop: 2 }}>{printer.branch || '—'}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-low)' }}>BW / Page</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-mid)', marginTop: 2 }}>
                      {formatCurrency(printer.cost_per_bw_page)}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-low)' }}>Colour / Page</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-mid)', marginTop: 2 }}>
                      {formatCurrency(printer.cost_per_colour_page)}
                    </div>
                  </div>
                </div>

                {/* Paper sizes */}
                <div className="flex flex-wrap gap-1.5">
                  {printer.paper_sizes.map(size => (
                    <span key={size} className="dm-badge dm-badge-neutral">
                      {size}
                    </span>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex space-x-2 pt-1" style={{ borderTop: '1px solid var(--panel-line)' }}>
                  <button
                    onClick={() => { setEditTarget(printer); setShowForm(true); }}
                    className="dm-btn dm-btn-ghost flex-1"
                    style={{ minHeight: 36, fontSize: '0.6875rem' }}
                  >
                    <Edit2 style={{ width: 12, height: 12 }} />
                    <span>Edit</span>
                  </button>
                  {printer.is_active && (
                    <button
                      onClick={() => handleDisable(printer.id)}
                      disabled={disabling === printer.id}
                      className="dm-btn dm-btn-danger flex-1"
                      style={{ minHeight: 36, fontSize: '0.6875rem' }}
                    >
                      {disabling === printer.id
                        ? <RefreshCw className="dm-spin" style={{ width: 12, height: 12 }} />
                        : <Power style={{ width: 12, height: 12 }} />
                      }
                      <span>Disable</span>
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Form modal */}
      <AnimatePresence>
        {showForm && (
          <PrinterForm
            initial={editTarget ?? undefined}
            onSave={handleSave}
            onClose={() => { setShowForm(false); setEditTarget(null); }}
            saving={saving}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
