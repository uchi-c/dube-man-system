import React, { useEffect, useState } from 'react';
import {
  Package, Plus, RefreshCw, AlertTriangle,
  TrendingDown, Edit2, Save, X, Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  fetchPaperInventory, upsertPaperInventory, addPaperStock
} from '../services/supabase';
import type { PaperInventory, PaperSize } from '../types';

const PAPER_SIZES: PaperSize[] = ['A4', 'A3', 'A5', 'Letter', 'Legal', 'Custom'];

// ---- helpers ----------------------------------------------------------------

function stockPercent(item: PaperInventory): number {
  if (item.reams_purchased <= 0) return 0;
  return Math.min(100, (item.reams_remaining / item.reams_purchased) * 100);
}

function stockColor(item: PaperInventory): string {
  const pct = stockPercent(item);
  if (item.reams_remaining <= item.min_stock_reams) return 'bg-rose-500';
  if (pct < 30) return 'bg-amber-400';
  return 'bg-emerald-500';
}

function fmtMoney(n: number) {
  return 'ZMW ' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---- Restock modal ----------------------------------------------------------

interface RestockModalProps {
  item: PaperInventory;
  onConfirm: (reams: number) => Promise<void>;
  onClose: () => void;
  saving: boolean;
}

function RestockModal({ item, onConfirm, onClose, saving }: RestockModalProps) {
  const [reams, setReams] = useState(5);
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-5"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm">Add Stock — {item.paper_size}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl cursor-pointer">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        <div className="bg-slate-50 rounded-2xl p-4 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">Current stock</span>
            <span className="font-bold text-slate-700">
              {item.reams_remaining.toFixed(1)} reams ({Math.round(item.reams_remaining * item.pages_per_ream).toLocaleString()} pages)
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Min threshold</span>
            <span className="font-semibold text-slate-600">{item.min_stock_reams} reams</span>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Reams to add</label>
          <input
            type="number" min="0.5" step="0.5"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 bg-slate-50"
            value={reams}
            onChange={e => setReams(Number(e.target.value))}
          />
          <p className="text-[10px] text-slate-400 mt-1">
            1 ream = {item.pages_per_ream} pages · Total after: {(item.reams_remaining + reams).toFixed(1)} reams
          </p>
        </div>

        <div className="flex space-x-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reams)}
            disabled={saving || reams <= 0}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-60 flex items-center justify-center space-x-1.5 cursor-pointer"
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            <span>Add Reams</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ---- Paper size form --------------------------------------------------------

interface PaperFormProps {
  initial?: PaperInventory;
  onSave: (data: Omit<PaperInventory, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  onClose: () => void;
  saving: boolean;
}

function PaperForm({ initial, onSave, onClose, saving }: PaperFormProps) {
  const [form, setForm] = useState(
    initial
      ? {
          paper_size: initial.paper_size,
          description: initial.description,
          reams_purchased: initial.reams_purchased,
          reams_remaining: initial.reams_remaining,
          pages_per_ream: initial.pages_per_ream,
          cost_per_ream: initial.cost_per_ream,
          min_stock_reams: initial.min_stock_reams,
        }
      : {
          paper_size: 'A4' as PaperSize,
          description: '',
          reams_purchased: 10,
          reams_remaining: 10,
          pages_per_ream: 500,
          cost_per_ream: 0,
          min_stock_reams: 2,
        }
  );

  const inputCls = "w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";
  const labelCls = "block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1";

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm">
            {initial ? 'Edit Paper Stock' : 'Add Paper Stock'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl cursor-pointer">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <form
          onSubmit={e => { e.preventDefault(); onSave(form); }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Paper Size *</label>
              <select
                required
                className={inputCls}
                value={form.paper_size}
                onChange={e => setForm(f => ({ ...f, paper_size: e.target.value as PaperSize }))}
                disabled={!!initial}
              >
                {PAPER_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <input
                className={inputCls}
                placeholder="e.g. 80gsm white"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Reams Purchased</label>
              <input type="number" min="0" step="0.5" required className={inputCls}
                value={form.reams_purchased}
                onChange={e => setForm(f => ({ ...f, reams_purchased: Number(e.target.value) }))} />
            </div>
            <div>
              <label className={labelCls}>Reams Remaining</label>
              <input type="number" min="0" step="0.5" required className={inputCls}
                value={form.reams_remaining}
                onChange={e => setForm(f => ({ ...f, reams_remaining: Number(e.target.value) }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Pages per Ream</label>
              <input type="number" min="1" required className={inputCls}
                value={form.pages_per_ream}
                onChange={e => setForm(f => ({ ...f, pages_per_ream: Number(e.target.value) }))} />
            </div>
            <div>
              <label className={labelCls}>Cost per Ream (ZMW)</label>
              <input type="number" min="0" step="0.01" className={inputCls}
                value={form.cost_per_ream}
                onChange={e => setForm(f => ({ ...f, cost_per_ream: Number(e.target.value) }))} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Min Stock Threshold (reams)</label>
            <input type="number" min="0" step="0.5" className={inputCls}
              value={form.min_stock_reams}
              onChange={e => setForm(f => ({ ...f, min_stock_reams: Number(e.target.value) }))} />
            <p className="text-[9px] text-slate-400 mt-1">
              An alert will appear when remaining stock falls to or below this threshold.
            </p>
          </div>

          <div className="flex space-x-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center space-x-2 cursor-pointer">
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{saving ? 'Saving…' : 'Save'}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ---- Main component ---------------------------------------------------------

export default function PrintInventory() {
  const [inventory, setInventory]   = useState<PaperInventory[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editItem, setEditItem]     = useState<PaperInventory | null>(null);
  const [restockItem, setRestockItem] = useState<PaperInventory | null>(null);
  const [saving, setSaving]         = useState(false);

  const load = async () => {
    setLoading(true);
    setInventory(await fetchPaperInventory());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const lowStock = inventory.filter(i => i.reams_remaining <= i.min_stock_reams);

  const handleSave = async (data: Omit<PaperInventory, 'id' | 'created_at' | 'updated_at'>) => {
    setSaving(true);
    await upsertPaperInventory(data);
    await load();
    setShowForm(false);
    setEditItem(null);
    setSaving(false);
  };

  const handleRestock = async (reams: number) => {
    if (!restockItem) return;
    setSaving(true);
    await addPaperStock(restockItem.id, reams);
    await load();
    setRestockItem(null);
    setSaving(false);
  };

  return (
    <div className="space-y-5" id="print-inventory">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-700 flex items-center space-x-2">
            <Package className="w-4 h-4 text-blue-500" />
            <span>Paper Inventory</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Track paper stock, usage, and low-stock alerts
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={load} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => { setEditItem(null); setShowForm(true); }}
            className="flex items-center space-x-1.5 bg-blue-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-blue-700 shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Stock</span>
          </button>
        </div>
      </div>

      {/* Low-stock alerts */}
      {lowStock.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start space-x-3 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 text-rose-800"
        >
          <AlertTriangle className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs">
            <span className="font-bold">
              {lowStock.length} paper size{lowStock.length > 1 ? 's' : ''} at or below minimum stock:
            </span>
            {' '}
            {lowStock.map(i => (
              <span key={i.id} className="inline-flex items-center mx-1 bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full text-[9px] font-bold">
                {i.paper_size} ({i.reams_remaining.toFixed(1)} reams left)
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {/* Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm font-mono">Loading inventory…</span>
        </div>
      ) : inventory.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-200 py-16 flex flex-col items-center text-slate-400">
          <Layers className="w-10 h-10 mb-3 text-slate-300" />
          <p className="text-sm font-semibold">No paper inventory configured</p>
          <p className="text-xs mt-1">Add stock for each paper size you use.</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-5 flex items-center space-x-2 bg-blue-600 text-white text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-blue-700 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add First Stock</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {inventory.map((item, i) => {
            const pct = stockPercent(item);
            const isLow = item.reams_remaining <= item.min_stock_reams;
            const bar = stockColor(item);
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`bg-white rounded-2xl border shadow-sm p-5 space-y-4 ${
                  isLow ? 'border-rose-200' : 'border-slate-200/80'
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2.5 rounded-xl ${isLow ? 'bg-rose-50' : 'bg-blue-50'}`}>
                      <Layers className={`w-4 h-4 ${isLow ? 'text-rose-500' : 'text-blue-500'}`} />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-800">{item.paper_size}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{item.description || 'Standard paper'}</div>
                    </div>
                  </div>
                  {isLow && (
                    <span className="flex items-center space-x-1 bg-rose-50 border border-rose-200 text-rose-700 text-[9px] font-bold px-2 py-0.5 rounded-full">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      <span>Low Stock</span>
                    </span>
                  )}
                </div>

                {/* Stock bar */}
                <div>
                  <div className="flex justify-between text-[10px] text-slate-400 mb-1.5">
                    <span>Stock level</span>
                    <span className="font-semibold text-slate-600">
                      {item.reams_remaining.toFixed(1)} / {item.reams_purchased.toFixed(1)} reams ({Math.round(pct)}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${bar}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div>
                    <span className="text-slate-400">Pages remaining</span>
                    <div className="font-semibold text-slate-700 mt-0.5">
                      {Math.round(item.reams_remaining * item.pages_per_ream).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400">Min threshold</span>
                    <div className="font-semibold text-slate-700 mt-0.5">{item.min_stock_reams} reams</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Cost per ream</span>
                    <div className="font-semibold text-slate-700 mt-0.5">{fmtMoney(item.cost_per_ream)}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Stock value</span>
                    <div className="font-semibold text-slate-700 mt-0.5">
                      {fmtMoney(item.reams_remaining * item.cost_per_ream)}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex space-x-2 border-t border-slate-100 pt-3">
                  <button
                    onClick={() => { setEditItem(item); setShowForm(true); }}
                    className="flex-1 flex items-center justify-center space-x-1.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => setRestockItem(item)}
                    className="flex-1 flex items-center justify-center space-x-1.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-semibold hover:bg-emerald-100 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Restock</span>
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showForm && (
          <PaperForm
            initial={editItem ?? undefined}
            onSave={handleSave}
            onClose={() => { setShowForm(false); setEditItem(null); }}
            saving={saving}
          />
        )}
        {restockItem && (
          <RestockModal
            item={restockItem}
            onConfirm={handleRestock}
            onClose={() => setRestockItem(null)}
            saving={saving}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
