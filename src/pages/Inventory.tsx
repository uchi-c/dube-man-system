import React, { useState, useEffect, useMemo } from 'react';
import { Product } from '../types';
import { fetchProducts, insertProduct, adjustStockLevel, updateProduct } from '../services/supabase';
import { 
  Package, Plus, Minus, Search, 
  AlertTriangle, Check, Briefcase, Filter, Info, ShieldX, RefreshCw 
} from 'lucide-react';
import { motion } from 'motion/react';

interface InventoryProps {
  userRole: string;
}

export default function Inventory({ userRole }: InventoryProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  // Stock Adjustment modal state
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [adjustType, setAdjustType] = useState<'STOCK_IN' | 'STOCK_OUT'>('STOCK_IN');
  const [adjustQty, setAdjustQty] = useState<number>(5);
  const [adjustError, setAdjustError] = useState('');

  // Create Product modal state
  const [isCreating, setIsCreating] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdCategory, setNewProdCategory] = useState('Stationery');
  const [newProdQty, setNewProdQty] = useState(10);
  const [newProdBuying, setNewProdBuying] = useState(25.00);
  const [newProdSelling, setNewProdSelling] = useState(40.00);
  const [newProdSupplier, setNewProdSupplier] = useState('');
  const [newProdMinStock, setNewProdMinStock] = useState(5);
  const [createSuccess, setCreateSuccess] = useState(false);

  const canEdit = userRole === 'ADMIN' || userRole === 'STAFF';

  // Categories list
  const categories = ['All', 'Stationery', 'Printing', 'Embroidery', 'Digital', 'Cafe'];

  // Refresh helper
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

  useEffect(() => {
    pullProductsFromDb();
  }, []);

  // Filtered lists
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (p.supplier && p.supplier.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchCategory = selectedCategory === 'All' || p.category.toLowerCase() === selectedCategory.toLowerCase();
      return matchSearch && matchCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  // Handle stock log
  const handleStockAdjSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustProduct) return;
    setAdjustError('');

    if (adjustQty <= 0) {
      setAdjustError('Please input a valid quantity greater than zero.');
      return;
    }

    try {
      const success = await adjustStockLevel(
        adjustProduct.id, 
        adjustQty, 
        adjustType === 'STOCK_IN' ? 'STOCK_IN' : 'STOCK_OUT'
      );

      if (!success) {
        setAdjustError(`Cannot deduct stock. Sells out remaining balance of ${adjustProduct.quantity} items.`);
        return;
      }

      await pullProductsFromDb();
      setIsAdjusting(false);
      setAdjustProduct(null);
    } catch (err: any) {
      setAdjustError(err?.message || 'Error executing ledger adjustment');
    }
  };

  // Save new product catalog profile
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
        supplier: newProdSupplier || 'Direct Procure'
      });

      if (result) {
        pullProductsFromDb();
        setCreateSuccess(true);
        
        // Clear forms
        setNewProdName('');
        setNewProdQty(10);
        setNewProdBuying(25);
        setNewProdSelling(40);
        setNewProdSupplier('');
        setNewProdMinStock(5);

        setTimeout(() => {
          setCreateSuccess(false);
          setIsCreating(false);
        }, 1500);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6" id="inventory-tab">
      {/* Header operations */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Merchandise Catalog & Inventory</h1>
          <p className="text-sm text-slate-500 mt-1">Regulate sales metrics, suppliers profiles, and track stock replenishments.</p>
        </div>
        
        <div className="flex items-center space-x-2">
          <button 
            onClick={pullProductsFromDb}
            className="p-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-2xl flex items-center justify-center cursor-pointer transition-all shrink-0"
            title="Refresh database catalog"
          >
            <RefreshCw className={`w-4 h-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {canEdit ? (
            <button
              onClick={() => setIsCreating(true)}
              className="px-5 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl flex items-center space-x-2 text-sm font-semibold shadow-xl shadow-rose-950/20 cursor-pointer transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add Catalog Item</span>
            </button>
          ) : (
            <div className="bg-slate-100 border border-slate-200 p-3 py-2.5 rounded-2xl flex items-center text-xs text-slate-500 space-x-1.5 shrink-0">
              <ShieldX className="w-4 h-4 text-rose-500" />
              <span>Modify rights disabled</span>
            </div>
          )}
        </div>
      </div>

      {/* Filters search and tabs */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative w-full md:max-w-md">
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 focus:border-rose-500 text-slate-700 rounded-2xl outline-none text-sm transition-all text-ellipsis"
            placeholder="Search products by name or suppliers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        </div>

        {/* Categories filters */}
        <div className="flex flex-wrap gap-1.5">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-rose-500 text-white border-rose-500 shadow-sm shadow-rose-500/15'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid inventory catalog cards */}
      {loading ? (
        <div className="h-[250px] flex flex-col items-center justify-center text-center text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin text-rose-500 mb-2" />
          <span className="text-xs font-mono">Synchronizing live product lines...</span>
        </div>
      ) : filteredProducts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProducts.map(product => {
            const minStock = product.min_stock_level !== undefined ? product.min_stock_level : 5;
            const isLowStock = product.quantity <= minStock;
            
            return (
              <motion.div
                key={product.id}
                whileHover={{ y: -3 }}
                className={`bg-white rounded-3xl p-5 border shadow-xs flex flex-col justify-between h-[230px] ${
                  isLowStock ? 'border-amber-200 bg-amber-50/10' : 'border-slate-200/80'
                }`}
              >
                {/* Product label card */}
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold text-rose-500 bg-rose-50 border border-rose-100 rounded-full px-2.5 py-0.5 uppercase tracking-wide">
                      {product.category}
                    </span>
                    {isLowStock ? (
                      <span className="inline-flex items-center space-x-1 text-amber-600 text-[10px] font-bold bg-amber-100 border border-amber-200/80 rounded-full px-2 py-0.5">
                        <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                        <span>Low Stock</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 text-emerald-600 text-[10px] font-semibold bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
                        <Check className="w-3 h-3 text-emerald-500 stroke-[3]" />
                        <span>Good Stock</span>
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-slate-800 text-sm line-clamp-2 leading-tight">
                    {product.name}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1 truncate flex items-center">
                    <Briefcase className="w-3 h-3 mr-1 text-slate-400" />
                    Supplier: {product.supplier || 'N/A'}
                  </p>
                </div>

                {/* Pricing & Stock indicators */}
                <div className="pt-3 border-t border-slate-100 mt-3">
                  <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono tabular-nums">
                    <div className="p-2 bg-slate-50 border border-slate-100 rounded-xl">
                      <span className="text-[9px] text-slate-400 block mb-0.5">Buy Price</span>
                      <strong className="text-slate-700 text-[10px]">ZMW {product.buying_price}</strong>
                    </div>
                    <div className="p-2 bg-slate-50 border border-slate-100 rounded-xl">
                      <span className="text-[9px] text-slate-400 block mb-0.5">Sell Price</span>
                      <strong className="text-rose-600 text-[10px]">ZMW {product.selling_price}</strong>
                    </div>
                    <div className={`p-2 border rounded-xl ${isLowStock ? 'bg-amber-100/40 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
                      <span className="text-[9px] text-slate-400 block mb-0.5">In Stock</span>
                      <strong className={isLowStock ? 'text-amber-800 text-[11px]' : 'text-slate-800 text-[11px]'}>
                        {product.min_stock_level === -1 ? '∞' : product.quantity}
                      </strong>
                    </div>
                  </div>

                  {/* Operation adjustments */}
                  {canEdit && (
                    <div className="mt-3.5 flex items-center justify-end space-x-1.5">
                      <button
                        onClick={() => {
                          setAdjustProduct(product);
                          setAdjustType('STOCK_OUT');
                          setAdjustQty(Math.min(product.quantity, 5));
                          setIsAdjusting(true);
                        }}
                        disabled={product.quantity <= 0}
                        className="p-1 px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 border border-slate-200 rounded-xl text-slate-600 text-[11px] font-semibold flex items-center transition-all cursor-pointer"
                      >
                        <Minus className="w-3 h-3 mr-1 text-slate-400" />
                        <span>Stock Out</span>
                      </button>

                      <button
                        onClick={() => {
                          setAdjustProduct(product);
                          setAdjustType('STOCK_IN');
                          setAdjustQty(5);
                          setIsAdjusting(true);
                        }}
                        className="p-1 px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 font-bold rounded-xl text-[11px] flex items-center transition-all cursor-pointer"
                      >
                        <Plus className="w-3 h-3 mr-1 text-rose-500" />
                        <span>Stock In</span>
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center shadow-xs">
          <Package className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-slate-600 text-sm font-bold mt-4">No Inventory Items Registered</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
            No products matched your current category or search key filters. Clear query tags or register novel SKUs above.
          </p>
        </div>
      )}

      {/* STOCK ADJUSTMENT MODAL */}
      {isAdjusting && adjustProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-slate-100 rounded-3xl max-w-md w-full p-6 shadow-2xl relative text-left"
          >
            <div className="mb-4">
              <span className={`text-[10px] font-mono font-black px-2.5 py-0.5 rounded-full ${
                adjustType === 'STOCK_IN' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}>
                {adjustType === 'STOCK_IN' ? 'QUANTITY REPLENISHMENT' : 'DEDUCTION INVOICE'}
              </span>
              <h3 className="text-base font-extrabold text-slate-800 mt-2">Adjust physical stock levels</h3>
              <p className="text-slate-400 text-xs mt-0.5">Updating: <strong>{adjustProduct.name}</strong></p>
            </div>

            <form onSubmit={handleStockAdjSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-500 font-mono uppercase tracking-wider block">Transaction Class</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setAdjustType('STOCK_IN'); setAdjustError(''); }}
                    className={`p-2.5 text-xs font-bold rounded-xl border text-center transition-all cursor-pointer ${
                      adjustType === 'STOCK_IN' ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-slate-50 text-slate-400 border-transparent'
                    }`}
                  >
                    Stock In (+ Add)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAdjustType('STOCK_OUT'); setAdjustError(''); }}
                    className={`p-2.5 text-xs font-bold rounded-xl border text-center transition-all cursor-pointer ${
                      adjustType === 'STOCK_OUT' ? 'bg-rose-50 border-rose-400 text-rose-700' : 'bg-slate-50 text-slate-400 border-transparent'
                    }`}
                  >
                    Stock Out (- Deduct)
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-500 font-mono uppercase tracking-wider flex justify-between">
                  <span>Adjustment Quantity</span>
                  <span className="text-slate-400 lowercase font-sans">available: {adjustProduct.quantity}</span>
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(parseInt(e.target.value) || 0)}
                  className="w-full pl-4 pr-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-rose-500 rounded-xl text-slate-700 text-xs outline-none transition-all font-mono"
                />
              </div>

              {adjustError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 text-[11px] p-3 rounded-xl flex items-center space-x-2 font-mono">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{adjustError}</span>
                </div>
              )}

              <div className="flex space-x-2 pt-3 border-t justify-end text-xs">
                <button
                  type="button"
                  onClick={() => setIsAdjusting(false)}
                  className="px-4 py-2 hover:bg-slate-100 rounded-xl font-bold text-slate-500 cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-bold text-white bg-rose-500 hover:bg-rose-600 rounded-xl shadow-md cursor-pointer transition"
                >
                  Execute adjustment
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* CREATE NEW PRODUCT MODAL */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border rounded-3xl max-w-lg w-full p-6 shadow-2xl relative text-left"
          >
            <div className="mb-4">
              <h3 className="text-lg font-bold text-slate-800">New Product Sku Entry</h3>
              <p className="text-slate-400 text-xs mt-0.5">Define category boundary, purchase supplier parameters, and default wholesale rates.</p>
            </div>

            <form onSubmit={handleCreateProductSubmit} className="space-y-4 text-xs font-sans">
              <div className="space-y-1">
                <label className="text-xs text-slate-500 font-bold block mb-1">Product Description/Service Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Spiral Binding Notebook (A4 size)"
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs focus:border-rose-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-500 font-bold block mb-1">Business Division Category</label>
                  <select
                    value={newProdCategory}
                    onChange={(e) => setNewProdCategory(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs focus:border-rose-500 outline-none cursor-pointer"
                  >
                    <option value="Stationery">Stationery Sales</option>
                    <option value="Printing">Printing Services</option>
                    <option value="Embroidery">Embroidery & Branding</option>
                    <option value="Digital">Digital Services</option>
                    <option value="Cafe">Internet Café</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-500 font-bold block mb-1">Supplier Entity</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Limbe Stationery Vendors"
                    value={newProdSupplier}
                    onChange={(e) => setNewProdSupplier(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs focus:border-rose-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-500 font-bold block mb-1">Buy Rate (Wholesale)</label>
                  <input
                    type="number"
                    required
                    value={newProdBuying}
                    onChange={(e) => setNewProdBuying(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs focus:border-rose-500 outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-500 font-bold block mb-1">Sale Rate (Retail)</label>
                  <input
                    type="number"
                    required
                    value={newProdSelling}
                    onChange={(e) => setNewProdSelling(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs focus:border-rose-500 outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-500 font-bold block mb-1">Wholesale quantity</label>
                  <input
                    type="number"
                    required
                    value={newProdQty}
                    onChange={(e) => setNewProdQty(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs focus:border-rose-500 outline-none font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-500 flex justify-between font-bold">
                  <span>Minimum Stock levels warning</span>
                </label>
                <input
                  type="number"
                  required
                  value={newProdMinStock}
                  onChange={(e) => setNewProdMinStock(parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs focus:border-rose-500 outline-none font-mono"
                />
              </div>

              {createSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3 rounded-xl flex items-center space-x-2">
                  <Check className="w-4 h-4 shrink-0 text-emerald-600 stroke-[3]" />
                  <span>Item added to inventory spreadsheet! Refreshing state...</span>
                </div>
              )}

              <div className="flex space-x-2 pt-3 border-t justify-end font-bold">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-white bg-rose-500 hover:bg-rose-600 rounded-xl shadow-md cursor-pointer transition"
                >
                  Confirm Registry Sku
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
