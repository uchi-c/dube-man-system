import { useEffect, useState } from 'react';
import {
  Package, Plus, RefreshCw, AlertTriangle,
  Edit2, Save, X, Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  fetchPaperInventory, upsertPaperInventory, addPaperStock
} from '../services/supabase';
import { formatCurrency } from '../utils/format';
import type { PaperInventory, PaperSize } from '../types';

const PAPER_SIZES: PaperSize[] = ['A4', 'A3', 'A5', 'Letter', 'Legal', 'Custom'];

// ---- helpers ----------------------------------------------------------------

function stockPercent(item: PaperInventory): number {
  if (item.reams_purchased <= 0) return 0;
  return Math.min(100, (item.reams_remaining / item.reams_purchased) * 100);
}

function stockColor(item: PaperInventory): string {
  const pct = stockPercent(item);
  if (item.reams_remaining <= item.min_stock_reams) return 'var(--danger)';
  if (pct < 30) return 'var(--warning)';
  return 'var(--success)';
}

function fmtMoney(n: number) {
  return formatCurrency(n);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(7,11,36,0.75)', backdropFilter: 'blur(4px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="dm-card-glass w-full max-w-sm p-6 space-y-5"
      >
        <div className="flex items-center justify-between">
          <h3 className="dm-h3">Add Stock — {item.paper_size}</h3>
          <button onClick={onClose} className="dm-icon-btn">
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>
        <div className="dm-card-inset space-y-1" style={{ padding: '1rem', fontSize: '0.75rem' }}>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-low)' }}>Current stock</span>
            <span style={{ fontWeight: 700, color: 'var(--text-hi)' }}>
              {item.reams_remaining.toFixed(1)} reams ({Math.round(item.reams_remaining * item.pages_per_ream).toLocaleString()} pages)
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-low)' }}>Min threshold</span>
            <span style={{ fontWeight: 600, color: 'var(--text-mid)' }}>{item.min_stock_reams} reams</span>
          </div>
        </div>

        <div>
          <label className="dm-label" style={{ display: 'block', marginBottom: 4 }}>Reams to add</label>
          <input
            type="number" min="0.5" step="0.5"
            className="dm-input"
            value={reams}
            onChange={e => setReams(Number(e.target.value))}
          />
          <p style={{ fontSize: '0.625rem', color: 'var(--text-low)', marginTop: 4 }}>
            1 ream = {item.pages_per_ream} pages · Total after: {(item.reams_remaining + reams).toFixed(1)} reams
          </p>
        </div>

        <div className="flex space-x-2">
          <button onClick={onClose} className="dm-btn dm-btn-ghost flex-1">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reams)}
            disabled={saving || reams <= 0}
            className="dm-btn flex-1"
            style={{ background: 'var(--success)', color: '#06231a', boxShadow: 'none' }}
          >
            {saving ? <RefreshCw className="dm-spin" style={{ width: 14, height: 14 }} /> : <Plus style={{ width: 14, height: 14 }} />}
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(7,11,36,0.75)', backdropFilter: 'blur(4px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="dm-card-glass w-full max-w-md p-6 space-y-4"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="flex items-center justify-between">
          <h3 className="dm-h3">
            {initial ? 'Edit Paper Stock' : 'Add Paper Stock'}
          </h3>
          <button onClick={onClose} className="dm-icon-btn">
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        <form
          onSubmit={e => { e.preventDefault(); onSave(form); }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="dm-label" style={{ display: 'block', marginBottom: 4 }}>Paper Size *</label>
              <select
                required
                className="dm-select"
                value={form.paper_size}
                onChange={e => setForm(f => ({ ...f, paper_size: e.target.value as PaperSize }))}
                disabled={!!initial}
                style={{ opacity: initial ? 0.6 : 1 }}
              >
                {PAPER_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="dm-label" style={{ display: 'block', marginBottom: 4 }}>Description</label>
              <input
                className="dm-input"
                placeholder="e.g. 80gsm white"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="dm-label" style={{ display: 'block', marginBottom: 4 }}>Reams Purchased</label>
              <input type="number" min="0" step="0.5" required className="dm-input"
                value={form.reams_purchased}
                onChange={e => setForm(f => ({ ...f, reams_purchased: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="dm-label" style={{ display: 'block', marginBottom: 4 }}>Reams Remaining</label>
              <input type="number" min="0" step="0.5" required className="dm-input"
                value={form.reams_remaining}
                onChange={e => setForm(f => ({ ...f, reams_remaining: Number(e.target.value) }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="dm-label" style={{ display: 'block', marginBottom: 4 }}>Pages per Ream</label>
              <input type="number" min="1" required className="dm-input"
                value={form.pages_per_ream}
                onChange={e => setForm(f => ({ ...f, pages_per_ream: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="dm-label" style={{ display: 'block', marginBottom: 4 }}>Cost per Ream (ZMW)</label>
              <input type="number" min="0" step="0.01" className="dm-input"
                value={form.cost_per_ream}
                onChange={e => setForm(f => ({ ...f, cost_per_ream: Number(e.target.value) }))} />
            </div>
          </div>

          <div>
            <label className="dm-label" style={{ display: 'block', marginBottom: 4 }}>Min Stock Threshold (reams)</label>
            <input type="number" min="0" step="0.5" className="dm-input"
              value={form.min_stock_reams}
              onChange={e => setForm(f => ({ ...f, min_stock_reams: Number(e.target.value) }))} />
            <p style={{ fontSize: '0.5625rem', color: 'var(--text-low)', marginTop: 4 }}>
              An alert will appear when remaining stock falls to or below this threshold.
            </p>
          </div>

          <div className="flex space-x-2 pt-2">
            <button type="button" onClick={onClose} className="dm-btn dm-btn-ghost flex-1">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="dm-btn dm-btn-primary flex-1">
              {saving ? <RefreshCw className="dm-spin" style={{ width: 14, height: 14 }} /> : <Save style={{ width: 14, height: 14 }} />}
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
          <h2 className="dm-h3 flex items-center space-x-2">
            <Package style={{ width: 15, height: 15, color: 'var(--blue-400)' }} />
            <span>Paper Inventory</span>
          </h2>
          <p style={{ color: 'var(--text-low)', fontSize: '0.75rem', marginTop: 3 }}>
            Track paper stock, usage, and low-stock alerts
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={load} className="dm-icon-btn">
            <RefreshCw className={loading ? 'dm-spin' : ''} style={{ width: 14, height: 14 }} />
          </button>
          <button
            onClick={() => { setEditItem(null); setShowForm(true); }}
            className="dm-btn dm-btn-primary"
          >
            <Plus style={{ width: 14, height: 14 }} />
            <span>Add Stock</span>
          </button>
        </div>
      </div>

      {/* Low-stock alerts */}
      {lowStock.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="dm-badge dm-badge-danger"
          style={{ width: '100%', padding: '0.75rem 1rem', alignItems: 'flex-start', whiteSpace: 'normal' }}
        >
          <AlertTriangle style={{ width: 15, height: 15, marginTop: 1, flexShrink: 0 }} />
          <div style={{ fontSize: '0.75rem' }}>
            <span style={{ fontWeight: 700 }}>
              {lowStock.length} paper size{lowStock.length > 1 ? 's' : ''} at or below minimum stock:
            </span>
            {' '}
            {lowStock.map(i => (
              <span key={i.id} className="dm-card-inset" style={{ display: 'inline-flex', alignItems: 'center', margin: '0 4px', color: 'var(--danger)', padding: '0.15rem 0.5rem', borderRadius: 999, fontSize: '0.5625rem', fontWeight: 700 }}>
                {i.paper_size} ({i.reams_remaining.toFixed(1)} reams left)
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {/* Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-20" style={{ color: 'var(--text-low)' }}>
          <RefreshCw className="dm-spin" style={{ width: 18, height: 18, marginRight: 8 }} />
          <span style={{ fontSize: '0.8125rem', fontFamily: 'monospace' }}>Loading inventory…</span>
        </div>
      ) : inventory.length === 0 ? (
        <div className="dm-card-inset flex flex-col items-center text-center" style={{ padding: '4rem 1.5rem', borderStyle: 'dashed' }}>
          <Layers style={{ width: 40, height: 40, marginBottom: 12, color: 'var(--text-low)' }} />
          <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-mid)' }}>No paper inventory configured</p>
          <p style={{ fontSize: '0.75rem', marginTop: 4, color: 'var(--text-low)' }}>Add stock for each paper size you use.</p>
          <button
            onClick={() => setShowForm(true)}
            className="dm-btn dm-btn-primary"
            style={{ marginTop: 20 }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            <span>Add First Stock</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {inventory.map((item, i) => {
            const pct = stockPercent(item);
            const isLow = item.reams_remaining <= item.min_stock_reams;
            const barColor = stockColor(item);
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="dm-card p-5 space-y-4"
                style={{ borderColor: isLow ? 'rgba(255,107,107,0.35)' : 'var(--panel-line)' }}
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center justify-center flex-shrink-0" style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--blue-bg)', color: 'var(--blue-400)' }}>
                      <Layers style={{ width: 16, height: 16 }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-hi)' }}>{item.paper_size}</div>
                      <div style={{ fontSize: '0.625rem', color: 'var(--text-low)', marginTop: 2 }}>{item.description || 'Standard paper'}</div>
                    </div>
                  </div>
                  {isLow && (
                    <span className="dm-badge dm-badge-danger">
                      <AlertTriangle style={{ width: 10, height: 10 }} />
                      <span>Low Stock</span>
                    </span>
                  )}
                </div>

                {/* Stock bar */}
                <div>
                  <div className="flex justify-between" style={{ fontSize: '0.625rem', color: 'var(--text-low)', marginBottom: 6 }}>
                    <span>Stock level</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-mid)' }}>
                      {item.reams_remaining.toFixed(1)} / {item.reams_purchased.toFixed(1)} reams ({Math.round(pct)}%)
                    </span>
                  </div>
                  <div style={{ width: '100%', height: 8, background: 'var(--panel-2)', borderRadius: 999, overflow: 'hidden' }}>
                    <div
                      style={{ height: '100%', borderRadius: 999, transition: 'width 0.2s', width: `${pct}%`, background: barColor }}
                    />
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 dm-nums" style={{ fontSize: '0.75rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-low)' }}>Pages remaining</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-mid)', marginTop: 2 }}>
                      {Math.round(item.reams_remaining * item.pages_per_ream).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-low)' }}>Min threshold</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-mid)', marginTop: 2 }}>{item.min_stock_reams} reams</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-low)' }}>Cost per ream</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-mid)', marginTop: 2 }}>{fmtMoney(item.cost_per_ream)}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-low)' }}>Stock value</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-mid)', marginTop: 2 }}>
                      {fmtMoney(item.reams_remaining * item.cost_per_ream)}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex space-x-2 pt-3" style={{ borderTop: '1px solid var(--panel-line)' }}>
                  <button
                    onClick={() => { setEditItem(item); setShowForm(true); }}
                    className="dm-btn dm-btn-ghost flex-1"
                    style={{ minHeight: 36, fontSize: '0.6875rem' }}
                  >
                    <Edit2 style={{ width: 12, height: 12 }} />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => setRestockItem(item)}
                    className="dm-btn flex-1"
                    style={{ minHeight: 36, fontSize: '0.6875rem', background: 'var(--success-bg)', border: '1px solid rgba(61,220,151,0.30)', color: 'var(--success)', boxShadow: 'none' }}
                  >
                    <Plus style={{ width: 12, height: 12 }} />
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
