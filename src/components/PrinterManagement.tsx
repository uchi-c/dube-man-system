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

const STATUS_STYLES: Record<PrinterStatus, { bg: string; text: string; dot: string; label: string }> = {
  Online:  { bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500',  label: 'Online' },
  Offline: { bg: 'bg-slate-100',   text: 'text-slate-500',   dot: 'bg-slate-400',    label: 'Offline' },
  Paused:  { bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-400',    label: 'Paused' },
  Error:   { bg: 'bg-rose-50',     text: 'text-rose-700',    dot: 'bg-rose-500',     label: 'Error' },
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

  const inputCls = "w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 bg-slate-50";
  const labelCls = "block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1";

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-50 rounded-xl">
              <PrinterIcon className="w-4 h-4 text-blue-500" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">
              {initial ? 'Edit Printer' : 'Register Printer'}
            </h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition cursor-pointer">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Display Name *</label>
              <input
                required
                className={inputCls}
                placeholder="e.g. Front Office Printer"
                value={form.printer_name}
                onChange={e => setForm(f => ({ ...f, printer_name: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelCls}>Windows Printer Name *</label>
              <input
                required
                className={inputCls}
                placeholder="Exact name in Windows"
                value={form.windows_printer_name}
                onChange={e => setForm(f => ({ ...f, windows_printer_name: e.target.value }))}
              />
              <p className="text-[9px] text-slate-400 mt-1">
                Must match exactly what Windows shows in Devices & Printers
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Location</label>
              <input
                className={inputCls}
                placeholder="e.g. Reception"
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelCls}>Branch</label>
              <input
                className={inputCls}
                placeholder="e.g. Main Branch"
                value={form.branch}
                onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>BW Cost / Page (ZMW)</label>
              <input
                type="number" min="0" step="0.01"
                className={inputCls}
                value={form.cost_per_bw_page}
                onChange={e => setForm(f => ({ ...f, cost_per_bw_page: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className={labelCls}>Colour Cost / Page (ZMW)</label>
              <input
                type="number" min="0" step="0.01"
                className={inputCls}
                value={form.cost_per_colour_page}
                onChange={e => setForm(f => ({ ...f, cost_per_colour_page: Number(e.target.value) }))}
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className={labelCls}>Status</label>
            <select
              className={inputCls}
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
            <label className={labelCls}>Supported Paper Sizes</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {PAPER_SIZES.map(size => (
                <button
                  key={size}
                  type="button"
                  onClick={() => togglePaperSize(size)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                    form.paper_sizes.includes(size)
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
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
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition disabled:opacity-60 flex items-center justify-center space-x-2 cursor-pointer"
            >
              {saving ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
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
        <h2 className="text-sm font-bold text-slate-700">Registered Printers</h2>
        <div className="flex items-center space-x-2">
          <button
            onClick={load}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => { setEditTarget(null); setShowForm(true); }}
            className="flex items-center space-x-1.5 bg-blue-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-blue-700 transition shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Printer</span>
          </button>
        </div>
      </div>

      {/* Printer cards */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm font-mono">Loading printers…</span>
        </div>
      ) : printers.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-200 py-16 flex flex-col items-center text-slate-400">
          <PrinterIcon className="w-10 h-10 mb-3 text-slate-300" />
          <p className="text-sm font-semibold">No printers registered yet</p>
          <p className="text-xs mt-1">Add your first printer to start monitoring print jobs.</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-5 flex items-center space-x-2 bg-blue-600 text-white text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-blue-700 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Register First Printer</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {printers.map((printer, i) => {
            const style = STATUS_STYLES[printer.status] ?? STATUS_STYLES.Offline;
            return (
              <motion.div
                key={printer.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`bg-white rounded-2xl border shadow-sm p-5 space-y-4 ${
                  !printer.is_active ? 'opacity-50' : ''
                } border-slate-200/80`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 bg-blue-50 rounded-xl">
                      <PrinterIcon className="w-4 h-4 text-blue-500" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-800">{printer.printer_name}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-[160px]">
                        {printer.windows_printer_name}
                      </div>
                    </div>
                  </div>
                  {/* Status badge */}
                  <span className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${style.bg} ${style.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                    <span>{style.label}</span>
                  </span>
                </div>

                {/* Meta */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs tabular-nums">
                  <div>
                    <span className="text-slate-400">Location</span>
                    <div className="font-semibold text-slate-700 mt-0.5">{printer.location || '—'}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Branch</span>
                    <div className="font-semibold text-slate-700 mt-0.5">{printer.branch || '—'}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">BW / Page</span>
                    <div className="font-semibold text-slate-700 mt-0.5">
                      {formatCurrency(printer.cost_per_bw_page)}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400">Colour / Page</span>
                    <div className="font-semibold text-slate-700 mt-0.5">
                      {formatCurrency(printer.cost_per_colour_page)}
                    </div>
                  </div>
                </div>

                {/* Paper sizes */}
                <div className="flex flex-wrap gap-1.5">
                  {printer.paper_sizes.map(size => (
                    <span key={size} className="bg-slate-100 text-slate-600 text-[9px] font-bold px-2 py-0.5 rounded-full">
                      {size}
                    </span>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex space-x-2 pt-1 border-t border-slate-100">
                  <button
                    onClick={() => { setEditTarget(printer); setShowForm(true); }}
                    className="flex-1 flex items-center justify-center space-x-1.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-600 font-semibold hover:bg-slate-50 transition cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                  {printer.is_active && (
                    <button
                      onClick={() => handleDisable(printer.id)}
                      disabled={disabling === printer.id}
                      className="flex-1 flex items-center justify-center space-x-1.5 py-2 rounded-xl border border-rose-200 text-xs text-rose-600 font-semibold hover:bg-rose-50 transition disabled:opacity-50 cursor-pointer"
                    >
                      {disabling === printer.id
                        ? <RefreshCw className="w-3 h-3 animate-spin" />
                        : <Power className="w-3 h-3" />
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
