import React, { useState, useMemo } from 'react';
import { Product } from '../types';
import { getProducts, saveProduct, modifyProductStock } from '../utils/db';
import { 
  Package, Plus, Minus, Search, 
  AlertTriangle, Check, Briefcase, Filter, Info, ShieldX 
} from 'lucide-react';
import { motion } from 'motion/react';

interface InventoryProps {
  userRole: string;
}

export default function Inventory({ userRole }: InventoryProps) {
  const [products, setProducts] = useState<Product[]>(getProducts());
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
  const refreshProducts = () => {
    setProducts(getProducts());
  };

  // Filtered lists
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (p.supplier && p.supplier.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchCategory = selectedCategory === 'All' || p.category === selectedCategory;
      return matchSearch && matchCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  // Handle stock log
  const handleStockAdjSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustProduct) return;
    setAdjustError('');

    if (adjustQty <= 0) {
      setAdjustError('Please input a valid quantity greater than zero.');
      return;
    }

    const success = modifyProductStock(adjustProduct.id, adjustQty, adjustType);
    if (!success) {
      setAdjustError(`Cannot deduct stock. Sells out remaining balance of ${adjustProduct.quantity} items.`);
      return;
    }

    refreshProducts();
    setIsAdjusting(false);
    setAdjustProduct(null);
  };

  // Save new product catalog profile
  const handleCreateProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim()) return;

    const mockProd: Product = {
      id: '', // Will be overridden in saveProduct
      name: newProdName,
      category: newProdCategory,
      quantity: newProdQty,
      buying_price: newProdBuying,
      selling_price: newProdSelling,
      supplier: newProdSupplier || 'Direct Procure',
      min_stock_level: newProdMinStock,
      created_at: '',
      updated_at: ''
    };

    saveProduct(mockProd);
    refreshProducts();
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
  };

  return (
    <div className="space-y-6" id="inventory-tab">
      {/* Header operations */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Merchandise Catalog & Inventory</h1>
          <p className="text-sm text-slate-500 mt-1">Regulate pricing, supplier ties, and record stock-in/stock-out payloads.</p>
        </div>
        {canEdit ? (
          <button
            onClick={() => setIsCreating(true)}
            className="px-5 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl flex items-center space-x-2 text-sm font-semibold shadow-xl shadow-rose-950/25 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Sku Catalog</span>
          </button>
        ) : (
          <div className="bg-slate-100 border border-slate-200 p-3.5 rounded-2xl flex items-center text-xs text-slate-500 space-x-1.5">
            <ShieldX className="w-4 h-4 text-rose-500" />
            <span>Staff write-access required to modify items</span>
          </div>
        )}
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
              className={`px-3.5 py-2 text-xs font-semibold rounded-xl border transition-all ${
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
      {filteredProducts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProducts.map(product => {
            const minStock = product.min_stock_level !== undefined ? product.min_stock_level : 10;
            const isLowStock = minStock !== -1 && product.quantity <= minStock;
            
            return (
              <motion.div
                key={product.id}
                whileHover={{ y: -3 }}
                className={`bg-white rounded-3xl p-5 border shadow-xs flex flex-col justify-between h-[230px] ${
                  isLowStock ? 'border-amber-200 bg-amber-50/5' : 'border-slate-200/80'
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
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 bg-slate-50 border border-slate-100 rounded-xl">
                      <span className="text-[10px] text-slate-400 block mb-0.5">Buy Price</span>
                      <strong className="text-slate-700">MWK {product.buying_price}</strong>
                    </div>
                    <div className="p-2 bg-slate-50 border border-slate-100 rounded-xl">
                      <span className="text-[10px] text-slate-400 block mb-0.5">Sell Price</span>
                      <strong className="text-rose-600">MWK {product.selling_price}</strong>
                    </div>
                    <div className={`p-2 border rounded-xl ${isLowStock ? 'bg-amber-100/40 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
                      <span className="text-[10px] text-slate-400 block mb-0.5">In Stock</span>
                      <strong className={isLowStock ? 'text-amber-800' : 'text-slate-800'}>
                        {product.min_stock_level === -1 ? '∞' : product.quantity}
                      </strong>
                    </div>
                  </div>

                  {/* Operation adjustments */}
                  {canEdit && product.min_stock_level !== -1 && (
                    <div className="mt-3.5 flex items-center justify-end space-x-1.5">
                      <button
                        onClick={() => {
                          setAdjustProduct(product);
                          setAdjustType('STOCK_OUT');
                          setAdjustQty(Math.min(product.quantity, 5));
                          setIsAdjusting(true);
                        }}
                        disabled={product.quantity <= 0}
                        className="p-1 px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 border border-slate-200 rounded-xl text-slate-600 text-xs font-semibold flex items-center space-x-1 transition-all"
                      >
                        <Minus className="w-3 w-3 mr-1 text-slate-400" />
                        <span>Stock Out</span>
                      </button>

                      <button
                        onClick={() => {
                          setAdjustProduct(product);
                          setAdjustType('STOCK_IN');
                          setAdjustQty(5);
                          setIsAdjusting(true);
                        }}
                        className="p-1 px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 font-bold rounded-xl text-xs flex items-center space-x-1 transition-all"
                      >
                        <Plus className="w-3 w-3 mr-1 text-rose-500" />
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
          <h3 className="text-slate-600 text-sm font-bold mt-4">No Inventory Sku Catalog Linked</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
            No items matched your current search filters. Reconfigure the tags or click 'Add New Sku' to expand merchandise listings.
          </p>
        </div>
      )}

      {/* STOCK ADJUSTMENT MODAL */}
      {isAdjusting && adjustProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border rounded-3xl max-w-md w-full p-6 shadow-2xl relative"
          >
            <div className="mb-4">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                adjustType === 'STOCK_IN' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}>
                {adjustType === 'STOCK_IN' ? 'QUANTITY REPLENISHMENT' : 'DECLINE DEDUCTION'}
              </span>
              <h3 className="text-lg font-bold text-slate-800 mt-2">Adjust Inventory level</h3>
              <p className="text-slate-400 text-xs mt-0.5">Executing adjustments for: <strong>{adjustProduct.name}</strong></p>
            </div>

            <form onSubmit={handleStockAdjSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-500">Transaction category</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType('STOCK_IN')}
                    className={`p-2 text-xs font-semibold rounded-xl border text-center transition-all ${
                      adjustType === 'STOCK_IN' ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-slate-50 text-slate-400 border-transparent'
                    }`}
                  >
                    Stock In (+ addition)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('STOCK_OUT')}
                    className={`p-2 text-xs font-semibold rounded-xl border text-center transition-all ${
                      adjustType === 'STOCK_OUT' ? 'bg-rose-50 border-rose-400 text-rose-700' : 'bg-slate-50 text-slate-400 border-transparent'
                    }`}
                  >
                    Stock Out (- reduction)
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-500 flex justify-between">
                  <span>Adjustment quantity</span>
                  <span className="text-slate-400">Current Stock: {adjustProduct.quantity}</span>
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(parseInt(e.target.value) || 0)}
                  className="w-full pl-4 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm focus:border-rose-500 outline-none transition-all"
                />
              </div>

              {adjustError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs p-3 rounded-xl flex items-start space-x-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{adjustError}</span>
                </div>
              )}

              <div className="flex space-x-2 pt-3 border-t justify-end">
                <button
                  type="button"
                  onClick={() => setIsAdjusting(false)}
                  className="px-4 py-2 text-xs text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-500 hover:bg-rose-600 rounded-xl shadow-md"
                >
                  Submit stock adjustment
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
            className="bg-white border rounded-3xl max-w-lg w-full p-6 shadow-2xl relative"
          >
            <div className="mb-4">
              <h3 className="text-lg font-bold text-slate-800">New Merchandise catalog Sku</h3>
              <p className="text-slate-400 text-xs mt-0.5">Register a new product, define category pricing bounds, and initial quantities.</p>
            </div>

            <form onSubmit={handleCreateProductSubmit} className="space-y-4">
              {/* Product name */}
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Product/Service Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Premium Fleece Embroidery Hoodie"
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs focus:border-rose-500 outline-none"
                />
              </div>

              {/* Grid 2-cols */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Business Category</label>
                  <select
                    value={newProdCategory}
                    onChange={(e) => setNewProdCategory(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs focus:border-rose-500 outline-none"
                  >
                    <option value="Stationery">Stationery Sales</option>
                    <option value="Printing">Printing Services</option>
                    <option value="Embroidery">Embroidery & Branding</option>
                    <option value="Digital">Digital Services</option>
                    <option value="Cafe">Internet Café</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Registered Supplier Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Textile Hub Wholesales"
                    value={newProdSupplier}
                    onChange={(e) => setNewProdSupplier(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs focus:border-rose-500 outline-none"
                  />
                </div>
              </div>

              {/* Grid 3-cols pricing */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Cost Price (Buying)</label>
                  <input
                    type="number"
                    required
                    value={newProdBuying}
                    onChange={(e) => setNewProdBuying(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs focus:border-rose-500 outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Sales Price (Retail)</label>
                  <input
                    type="number"
                    required
                    value={newProdSelling}
                    onChange={(e) => setNewProdSelling(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs focus:border-rose-500 outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Initial Stock qty</label>
                  <input
                    type="number"
                    required
                    value={newProdQty}
                    onChange={(e) => setNewProdQty(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs focus:border-rose-500 outline-none font-mono"
                  />
                </div>
              </div>

              {/* min level threshold */}
              <div className="space-y-1">
                <label className="text-xs text-slate-500 flex justify-between">
                  <span>Minimum Warning Stock level</span>
                  <span className="text-slate-400 font-mono text-[10px]">Will raise low-stock banners</span>
                </label>
                <input
                  type="number"
                  required
                  value={newProdMinStock}
                  onChange={(e) => setNewProdMinStock(parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs focus:border-rose-500 outline-none font-mono"
                />
              </div>

              {createSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3 rounded-xl flex items-center space-x-2">
                  <Check className="w-4 h-4 shrink-0 text-emerald-600 stroke-[3]" />
                  <span>Catalog item inserted successfully! Refreshing ledger...</span>
                </div>
              )}

              <div className="flex space-x-2 pt-3 border-t justify-end">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 text-xs text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-500 hover:bg-rose-600 rounded-xl shadow-md"
                >
                  Confirm Registration
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
