import React, { useState, useEffect, useMemo } from 'react';
import { Product } from '../types';
import { fetchProducts, insertProduct, adjustStockLevel, updateProduct } from '../services/supabase';
import {
  Package, Plus, Search, AlertTriangle, Check, ShieldX,
  RefreshCw, ArrowUp, ArrowDown, X, PackagePlus, Tag, Briefcase,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency } from '../utils/format';

interface InventoryProps {
  userRole: string;
}

type StockState = 'in' | 'low' | 'out';

function stockState(p: Product): StockState {
  const min = p.min_stock_level !== undefined ? p.min_stock_level : 5;
  if (p.quantity <= 0) return 'out';
  if (min !== -1 && p.quantity <= min) return 'low';
  return 'in';
}

function StockPill({ p }: { p: Product }) {
  if (p.min_stock_level === -1) {
    return <span className="dm-badge dm-badge-neutral"><Check style={{ width: 12, height: 12 }} /> ∞ Unlimited</span>;
  }
  const s = stockState(p);
  if (s === 'out') return <span className="dm-badge dm-badge-danger"><AlertTriangle style={{ width: 12, height: 12 }} /> Out of stock</span>;
  if (s === 'low') return <span className="dm-badge dm-badge-warning"><AlertTriangle style={{ width: 12, height: 12 }} /> {p.quantity} · Low</span>;
  return <span className="dm-badge dm-badge-success"><Check style={{ width: 12, height: 12 }} /> {p.quantity} in stock</span>;
}

export default function Inventory({ userRole }: InventoryProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc'); // low stock first by default
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Single stock adjustment modal
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [adjustType, setAdjustType] = useState<'STOCK_IN' | 'STOCK_OUT'>('STOCK_IN');
  const [adjustQty, setAdjustQty] = useState<number>(5);
  const [adjustError, setAdjustError] = useState('');

  // Create product modal
  const [isCreating, setIsCreating] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdCategory, setNewProdCategory] = useState('Stationery');
  const [newProdQty, setNewProdQty] = useState(10);
  const [newProdBuying, setNewProdBuying] = useState(25.0);
  const [newProdSelling, setNewProdSelling] = useState(40.0);
  const [newProdSupplier, setNewProdSupplier] = useState('');
  const [newProdMinStock, setNewProdMinStock] = useState(5);
  const [createSuccess, setCreateSuccess] = useState(false);

  // Bulk action modals
  const [bulkMode, setBulkMode] = useState<null | 'restock' | 'price'>(null);
  const [bulkQty, setBulkQty] = useState(10);
  const [bulkPricePct, setBulkPricePct] = useState(10);
  const [bulkBusy, setBulkBusy] = useState(false);

  const canEdit = userRole === 'ADMIN' || userRole === 'STAFF';
  const categories = ['All', 'Stationery', 'Printing', 'Embroidery', 'Digital', 'Cafe'];

  const pullProductsFromDb = async () => {
    setLoading(true);
    try {
      const data = await fetchProducts();
      setProducts(data);
    } catch (err) {
      console.error('Failed fetching inventory data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { pullProductsFromDb(); }, []);

  const filteredProducts = useMemo(() => {
    const list = products.filter(p => {
      const q = searchQuery.toLowerCase();
      const matchSearch = p.name.toLowerCase().includes(q) || (p.supplier && p.supplier.toLowerCase().includes(q));
      const matchCategory = selectedCategory === 'All' || p.category.toLowerCase() === selectedCategory.toLowerCase();
      return matchSearch && matchCategory;
    });
    const rank = (p: Product) => (p.min_stock_level === -1 ? Number.MAX_SAFE_INTEGER : p.quantity);
    return [...list].sort((a, b) => (sortDir === 'asc' ? rank(a) - rank(b) : rank(b) - rank(a)));
  }, [products, searchQuery, selectedCategory, sortDir]);

  const selectedProducts = products.filter(p => selectedIds.has(p.id));
  const allVisibleSelected = filteredProducts.length > 0 && filteredProducts.every(p => selectedIds.has(p.id));

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleAllVisible = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) filteredProducts.forEach(p => next.delete(p.id));
      else filteredProducts.forEach(p => next.add(p.id));
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  // ---- Single stock adjust ----
  const handleStockAdjSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustProduct) return;
    setAdjustError('');
    if (adjustQty <= 0) { setAdjustError('Enter a quantity above zero.'); return; }
    try {
      const success = await adjustStockLevel(adjustProduct.id, adjustQty, adjustType);
      if (!success) {
        setAdjustError(`Can't remove that many — only ${adjustProduct.quantity} in stock.`);
        return;
      }
      await pullProductsFromDb();
      setIsAdjusting(false);
      setAdjustProduct(null);
    } catch (err: any) {
      setAdjustError(err?.message || "Couldn't update stock. Try again.");
    }
  };

  // ---- Create product ----
  const handleCreateProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim()) return;
    try {
      const result = await insertProduct({
        name: newProdName,
        category: newProdCategory,
        quantity: newProdQty,
        buying_price: newProdBuying,
        selling_price: newProdSelling,
        supplier: newProdSupplier || 'Direct Procure',
        min_stock_level: newProdMinStock,
      });
      if (result) {
        pullProductsFromDb();
        setCreateSuccess(true);
        setNewProdName(''); setNewProdQty(10); setNewProdBuying(25); setNewProdSelling(40);
        setNewProdSupplier(''); setNewProdMinStock(5);
        setTimeout(() => { setCreateSuccess(false); setIsCreating(false); }, 1400);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  // ---- Bulk restock ----
  const runBulkRestock = async () => {
    if (bulkQty <= 0) return;
    setBulkBusy(true);
    try {
      await Promise.all(selectedProducts.map(p => adjustStockLevel(p.id, bulkQty, 'STOCK_IN')));
      await pullProductsFromDb();
      setBulkMode(null);
      clearSelection();
    } finally {
      setBulkBusy(false);
    }
  };

  // ---- Bulk price adjust (percentage) ----
  const runBulkPrice = async () => {
    setBulkBusy(true);
    try {
      const factor = 1 + bulkPricePct / 100;
      await Promise.all(selectedProducts.map(p =>
        updateProduct({ ...p, selling_price: Math.max(0, Math.round(p.selling_price * factor * 100) / 100) }),
      ));
      await pullProductsFromDb();
      setBulkMode(null);
      clearSelection();
    } finally {
      setBulkBusy(false);
    }
  };

  const inputCls = 'dm-input';

  return (
    <div className="space-y-6 dm-animate-in" id="inventory-tab">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="dm-h1">Inventory</h1>
          <p style={{ color: 'var(--text-mid)', fontSize: '0.875rem', marginTop: 4 }}>Track stock, suppliers and pricing. Low stock surfaces first.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={pullProductsFromDb} className="dm-icon-btn" title="Refresh catalog">
            <RefreshCw style={{ width: 16, height: 16 }} className={loading ? 'dm-spin' : ''} />
          </button>
          {canEdit ? (
            <button onClick={() => setIsCreating(true)} className="dm-btn dm-btn-primary">
              <Plus style={{ width: 16, height: 16 }} /> Add item
            </button>
          ) : (
            <span className="dm-badge dm-badge-neutral" style={{ height: 44, padding: '0 0.9rem' }}>
              <ShieldX style={{ width: 14, height: 14 }} /> Read-only
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="dm-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative w-full md:max-w-md">
          <Search style={{ width: 16, height: 16, color: 'var(--text-low)', position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
          <input type="text" className="dm-input" style={{ paddingLeft: '2.5rem' }} placeholder="Search by product or supplier…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
        <div className="dm-scroll-x flex gap-2">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`dm-badge ${selectedCategory === cat ? 'dm-badge-info' : 'dm-badge-neutral'}`}
              style={{ padding: '0.45rem 0.85rem', fontSize: '0.75rem', cursor: 'pointer', flexShrink: 0 }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="dm-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div className="p-4 space-y-2">
            {[0, 1, 2, 3, 4].map(i => <div key={i} className="dm-skeleton" style={{ height: 52 }} />)}
          </div>
        ) : filteredProducts.length > 0 ? (
          <div className="dm-scroll-x">
            <table className="w-full text-left" style={{ borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--panel-line)' }}>
                  {canEdit && (
                    <th style={{ padding: '12px 16px', width: 44 }}>
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Select all" style={{ accentColor: '#4C6FFF', width: 16, height: 16 }} />
                    </th>
                  )}
                  <th className="dm-label" style={{ padding: '12px 16px' }}>Product</th>
                  <th className="dm-label" style={{ padding: '12px 16px' }}>Category</th>
                  <th className="dm-label dm-num-cell" style={{ padding: '12px 16px' }}>Buy</th>
                  <th className="dm-label dm-num-cell" style={{ padding: '12px 16px' }}>Sell</th>
                  <th className="dm-label" style={{ padding: '12px 16px' }}>
                    <button onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))} className="flex items-center gap-1" style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', cursor: 'pointer' }}>
                      Stock {sortDir === 'asc' ? <ArrowUp style={{ width: 12, height: 12 }} /> : <ArrowDown style={{ width: 12, height: 12 }} />}
                    </button>
                  </th>
                  {canEdit && <th className="dm-label dm-num-cell" style={{ padding: '12px 16px' }}>Adjust</th>}
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(product => {
                  const selected = selectedIds.has(product.id);
                  return (
                    <tr
                      key={product.id}
                      style={{ borderBottom: '1px solid var(--panel-line)', background: selected ? 'var(--blue-bg)' : 'transparent', transition: 'background 0.15s' }}
                    >
                      {canEdit && (
                        <td style={{ padding: '12px 16px' }}>
                          <input type="checkbox" checked={selected} onChange={() => toggleOne(product.id)} aria-label={`Select ${product.name}`} style={{ accentColor: '#4C6FFF', width: 16, height: 16 }} />
                        </td>
                      )}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-hi)' }}>{product.name}</div>
                        <div className="flex items-center gap-1" style={{ fontSize: '0.72rem', color: 'var(--text-low)', marginTop: 2 }}>
                          <Briefcase style={{ width: 11, height: 11 }} /> {product.supplier || 'N/A'}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}><span className="dm-badge dm-badge-neutral">{product.category}</span></td>
                      <td className="dm-num-cell dm-nums" style={{ padding: '12px 16px', color: 'var(--text-mid)' }}>{formatCurrency(product.buying_price, { symbol: false })}</td>
                      <td className="dm-num-cell dm-nums" style={{ padding: '12px 16px', color: 'var(--text-hi)', fontWeight: 600 }}>{formatCurrency(product.selling_price, { symbol: false })}</td>
                      <td style={{ padding: '12px 16px' }}><StockPill p={product} /></td>
                      {canEdit && (
                        <td className="dm-num-cell" style={{ padding: '12px 16px' }}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => { setAdjustProduct(product); setAdjustType('STOCK_OUT'); setAdjustQty(Math.min(product.quantity, 5)); setAdjustError(''); setIsAdjusting(true); }}
                              disabled={product.quantity <= 0}
                              className="dm-icon-btn" style={{ width: 34, height: 34 }} title="Stock out"
                            >
                              <ArrowDown style={{ width: 14, height: 14 }} />
                            </button>
                            <button
                              onClick={() => { setAdjustProduct(product); setAdjustType('STOCK_IN'); setAdjustQty(5); setAdjustError(''); setIsAdjusting(true); }}
                              className="dm-icon-btn" style={{ width: 34, height: 34, color: 'var(--blue-400)', background: 'var(--blue-bg)', borderColor: 'rgba(76,111,255,0.3)' }} title="Stock in"
                            >
                              <ArrowUp style={{ width: 14, height: 14 }} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-12" style={{ color: 'var(--text-low)' }}>
            <Package style={{ width: 40, height: 40, opacity: 0.6, marginBottom: 10 }} />
            <h3 style={{ color: 'var(--text-mid)', fontWeight: 600, fontSize: '0.9rem' }}>No items match</h3>
            <p style={{ fontSize: '0.8rem', maxWidth: 320, marginTop: 4 }}>Clear the search or category filters, or add a new item to get started.</p>
          </div>
        )}
      </div>

      {/* ---- Persistent bulk action bar ---- */}
      <AnimatePresence>
        {canEdit && selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.18 }}
            className="fixed left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-3"
            style={{ bottom: 20, background: 'var(--panel)', border: '1px solid var(--panel-line-strong)', borderRadius: 'var(--r-card)', boxShadow: 'var(--shadow-modal)' }}
          >
            <span className="dm-nums" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-hi)' }}>{selectedIds.size} selected</span>
            <div style={{ width: 1, height: 22, background: 'var(--panel-line)' }} />
            <button onClick={() => { setBulkQty(10); setBulkMode('restock'); }} className="dm-btn dm-btn-ghost" style={{ minHeight: 38 }}>
              <PackagePlus style={{ width: 15, height: 15 }} /> Restock
            </button>
            <button onClick={() => { setBulkPricePct(10); setBulkMode('price'); }} className="dm-btn dm-btn-ghost" style={{ minHeight: 38 }}>
              <Tag style={{ width: 15, height: 15 }} /> Adjust price
            </button>
            <button onClick={clearSelection} className="dm-icon-btn" style={{ width: 38, height: 38 }} aria-label="Clear selection">
              <X style={{ width: 16, height: 16 }} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Bulk modals ---- */}
      <AnimatePresence>
        {bulkMode && (
          <ModalShell onClose={() => setBulkMode(null)}>
            {bulkMode === 'restock' ? (
              <>
                <h3 className="dm-h2">Restock {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''}</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-mid)', marginTop: 4, marginBottom: 16 }}>Add the same quantity to every selected product.</p>
                <label className="dm-label" style={{ padding: 0 }}>Units to add</label>
                <input type="number" min={1} className={inputCls} style={{ marginTop: 6 }} value={bulkQty} onChange={e => setBulkQty(parseInt(e.target.value) || 0)} />
                <div className="flex gap-2 mt-5">
                  <button onClick={() => setBulkMode(null)} className="dm-btn dm-btn-ghost flex-1">Cancel</button>
                  <button onClick={runBulkRestock} disabled={bulkBusy || bulkQty <= 0} className="dm-btn dm-btn-primary flex-1">
                    {bulkBusy ? <RefreshCw style={{ width: 15, height: 15 }} className="dm-spin" /> : <PackagePlus style={{ width: 15, height: 15 }} />}
                    Add stock
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="dm-h2">Adjust price · {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''}</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-mid)', marginTop: 4, marginBottom: 16 }}>Change selling price by a percentage. Use a negative value to discount.</p>
                <label className="dm-label" style={{ padding: 0 }}>Change (%)</label>
                <input type="number" className={inputCls} style={{ marginTop: 6 }} value={bulkPricePct} onChange={e => setBulkPricePct(parseFloat(e.target.value) || 0)} />
                <div className="flex gap-2 mt-5">
                  <button onClick={() => setBulkMode(null)} className="dm-btn dm-btn-ghost flex-1">Cancel</button>
                  <button onClick={runBulkPrice} disabled={bulkBusy} className="dm-btn dm-btn-primary flex-1">
                    {bulkBusy ? <RefreshCw style={{ width: 15, height: 15 }} className="dm-spin" /> : <Tag style={{ width: 15, height: 15 }} />}
                    Apply
                  </button>
                </div>
              </>
            )}
          </ModalShell>
        )}
      </AnimatePresence>

      {/* ---- Single stock adjust modal ---- */}
      <AnimatePresence>
        {isAdjusting && adjustProduct && (
          <ModalShell onClose={() => setIsAdjusting(false)}>
            <span className={`dm-badge ${adjustType === 'STOCK_IN' ? 'dm-badge-success' : 'dm-badge-danger'}`}>
              {adjustType === 'STOCK_IN' ? 'Stock in' : 'Stock out'}
            </span>
            <h3 className="dm-h2" style={{ marginTop: 10 }}>Adjust stock</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-mid)', marginTop: 2, marginBottom: 16 }}>{adjustProduct.name}</p>

            <form onSubmit={handleStockAdjSubmit} className="space-y-4">
              <div className="dm-seg" style={{ width: '100%' }}>
                <button type="button" onClick={() => { setAdjustType('STOCK_IN'); setAdjustError(''); }} className={`dm-seg-item ${adjustType === 'STOCK_IN' ? 'active' : ''}`} style={{ flex: 1 }}>Add</button>
                <button type="button" onClick={() => { setAdjustType('STOCK_OUT'); setAdjustError(''); }} className={`dm-seg-item ${adjustType === 'STOCK_OUT' ? 'active' : ''}`} style={{ flex: 1 }}>Remove</button>
              </div>
              <div>
                <label className="dm-label flex justify-between" style={{ padding: 0 }}>
                  <span>Quantity</span>
                  <span className="dm-nums" style={{ textTransform: 'none', letterSpacing: 0 }}>{adjustProduct.quantity} available</span>
                </label>
                <input type="number" required min={1} className={inputCls} style={{ marginTop: 6 }} value={adjustQty} onChange={e => setAdjustQty(parseInt(e.target.value) || 0)} />
              </div>
              {adjustError && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,107,107,0.3)', fontSize: '0.78rem', color: 'var(--danger)' }} role="alert">
                  <AlertTriangle style={{ width: 15, height: 15, flexShrink: 0 }} />
                  <span>{adjustError}</span>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setIsAdjusting(false)} className="dm-btn dm-btn-ghost flex-1">Cancel</button>
                <button type="submit" className="dm-btn dm-btn-primary flex-1">Save</button>
              </div>
            </form>
          </ModalShell>
        )}
      </AnimatePresence>

      {/* ---- Create product modal ---- */}
      <AnimatePresence>
        {isCreating && (
          <ModalShell onClose={() => setIsCreating(false)} wide>
            <h3 className="dm-h2">New product</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-mid)', marginTop: 4, marginBottom: 16 }}>Add a sellable item with category, supplier and pricing.</p>

            <form onSubmit={handleCreateProductSubmit} className="space-y-4">
              <div>
                <label className="dm-label" style={{ padding: 0 }}>Product name</label>
                <input type="text" required className={inputCls} style={{ marginTop: 6 }} placeholder="e.g. A4 Spiral Notebook" value={newProdName} onChange={e => setNewProdName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="dm-label" style={{ padding: 0 }}>Category</label>
                  <select className="dm-select" style={{ marginTop: 6 }} value={newProdCategory} onChange={e => setNewProdCategory(e.target.value)}>
                    <option value="Stationery">Stationery</option>
                    <option value="Printing">Printing</option>
                    <option value="Embroidery">Embroidery</option>
                    <option value="Digital">Digital</option>
                    <option value="Cafe">Internet Café</option>
                  </select>
                </div>
                <div>
                  <label className="dm-label" style={{ padding: 0 }}>Supplier</label>
                  <input type="text" required className={inputCls} style={{ marginTop: 6 }} placeholder="e.g. Lusaka Stationers" value={newProdSupplier} onChange={e => setNewProdSupplier(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="dm-label" style={{ padding: 0 }}>Buy price</label>
                  <input type="number" required className={inputCls} style={{ marginTop: 6 }} value={newProdBuying} onChange={e => setNewProdBuying(parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <label className="dm-label" style={{ padding: 0 }}>Sell price</label>
                  <input type="number" required className={inputCls} style={{ marginTop: 6 }} value={newProdSelling} onChange={e => setNewProdSelling(parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <label className="dm-label" style={{ padding: 0 }}>Quantity</label>
                  <input type="number" required className={inputCls} style={{ marginTop: 6 }} value={newProdQty} onChange={e => setNewProdQty(parseInt(e.target.value) || 0)} />
                </div>
              </div>
              <div>
                <label className="dm-label" style={{ padding: 0 }}>Low-stock warning at</label>
                <input type="number" required className={inputCls} style={{ marginTop: 6 }} value={newProdMinStock} onChange={e => setNewProdMinStock(parseInt(e.target.value) || 0)} />
              </div>
              {createSuccess && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--success-bg)', border: '1px solid rgba(61,220,151,0.3)', fontSize: '0.78rem', color: 'var(--success)' }}>
                  <Check style={{ width: 15, height: 15, flexShrink: 0 }} strokeWidth={3} />
                  <span>Item added.</span>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setIsCreating(false)} className="dm-btn dm-btn-ghost flex-1">Cancel</button>
                <button type="submit" className="dm-btn dm-btn-primary flex-1">Add item</button>
              </div>
            </form>
          </ModalShell>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- Shared dark modal shell -----------------------------------------------

function ModalShell({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(7,11,36,0.6)', backdropFilter: 'blur(4px)' }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.18 }}
          onClick={e => e.stopPropagation()}
          className="w-full p-6"
          style={{ maxWidth: wide ? 520 : 420, background: 'var(--panel)', border: '1px solid var(--panel-line-strong)', borderRadius: 'var(--r-card)', boxShadow: 'var(--shadow-modal)' }}
          role="dialog" aria-modal="true"
        >
          {children}
        </motion.div>
      </motion.div>
    </>
  );
}
