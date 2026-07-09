import React, { useState, useEffect, useMemo } from 'react';
import { Product, Customer, Sale } from '../types';
import { 
  fetchProducts, fetchCustomers, insertCustomer, 
  insertSale, fetchSales 
} from '../services/supabase';
import {
  ShoppingCart, Search, Plus, Minus, Trash2,
  CreditCard, Sparkles, Check, UserPlus,
  AlertCircle, RefreshCw, FileText
} from 'lucide-react';
import { motion } from 'motion/react';
import DataTable from '../components/DataTable';
import { formatCurrency } from '../utils/format';

interface SalesPageProps {
  userRole: string;
}

interface CartItem {
  product: Product;
  quantity: number;
}

export default function Sales({ userRole }: SalesPageProps) {
  const [activeTab, setActiveTab] = useState<'pos' | 'ledger'>('pos');
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesLedger, setSalesLedger] = useState<Sale[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Mobile Money' | 'Bank'>('Cash');
  const [errorText, setErrorText] = useState('');
  const [successText, setSuccessText] = useState('');

  // Registering a temporary walk-in client
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');

  const syncSalesDeskData = async () => {
    setLoading(true);
    try {
      const [prods, custs, ledger] = await Promise.all([
        fetchProducts(),
        fetchCustomers(),
        fetchSales()
      ]);
      setProducts(prods);
      setCustomers(custs);
      setSalesLedger(ledger);
    } catch (err) {
      console.error('Failed syncing sales module databases:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    syncSalesDeskData();
  }, []);

  // Filter products for active picker catalog
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            p.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch && p.min_stock_level !== -1;
    });
  }, [products, searchQuery]);

  // Total cart calculation
  const totalAmount = useMemo(() => {
    return cart.reduce((total, item) => total + (item.product.selling_price * item.quantity), 0);
  }, [cart]);

  // Add Item to cart
  const addToCart = (product: Product) => {
    setErrorText('');
    setSuccessText('');
    
    if (product.quantity <= 0) {
      setErrorText(`Failed: "${product.name}" is completely out of stock.`);
      return;
    }

    const index = cart.findIndex(item => item.product.id === product.id);
    if (index >= 0) {
      const currentQty = cart[index].quantity;
      if (currentQty >= product.quantity) {
        setErrorText(`Stock ceiling reached: ${product.quantity} physical units available.`);
        return;
      }
      const updatedCart = [...cart];
      updatedCart[index].quantity += 1;
      setCart(updatedCart);
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
  };

  const updateCartQuantity = (productId: string, delta: number) => {
    setErrorText('');
    const index = cart.findIndex(item => item.product.id === productId);
    if (index === -1) return;

    const item = cart[index];
    const newQty = item.quantity + delta;

    if (newQty <= 0) {
      setCart(cart.filter(ci => ci.product.id !== productId));
    } else {
      if (newQty > item.product.quantity) {
        setErrorText(`Physical limit of ${item.product.quantity} units exceeded for ${item.product.name}.`);
        return;
      }
      const updatedCart = [...cart];
      updatedCart[index].quantity = newQty;
      setCart(updatedCart);
    }
  };

  const removeCartItem = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  // Create fast customer
  const handleAddNewCustomerOnPOS = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) return;

    try {
      const customer = await insertCustomer(newCustName, newCustPhone, newCustEmail);
      if (customer) {
        const freshCusts = await fetchCustomers();
        setCustomers(freshCusts);
        setSelectedCustomerId(customer.id);
        setIsAddingCustomer(false);
        setNewCustName('');
        setNewCustPhone('');
        setNewCustEmail('');
      }
    } catch (e: any) {
      setErrorText('Error adding customer profile.');
    }
  };

  // Checkout transaction
  const handleCheckout = async () => {
    setErrorText('');
    setSuccessText('');

    if (cart.length === 0) {
      setErrorText('POS Cart cannot be blank.');
      return;
    }

    const itemsPayload = cart.map(item => ({
      product_id: item.product.id,
      quantity: item.quantity,
      unit_price: item.product.selling_price
    }));

    setLoading(true);
    const result = await insertSale(
      selectedCustomerId ? selectedCustomerId : null,
      itemsPayload,
      paymentMethod
    );

    if (typeof result === 'string') {
      setErrorText(`Transaction Aborted: ${result}`);
      setLoading(false);
      return;
    }

    // Success
    setSuccessText(`POS Transaction validated and saved to Supabase ledger! Sale ID: ${result.id.slice(0, 8)}...`);
    setCart([]);
    setSelectedCustomerId('');
    setPaymentMethod('Cash');
    await syncSalesDeskData();
  };

  // columns for table
  const ledgerColumns = [
    {
      header: 'Receipt ID',
      accessor: (sale: Sale) => <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-bold">{sale.id.slice(0, 8)}</span>
    },
    {
      header: 'Timestamp',
      accessor: (sale: Sale) => <span className="text-[11px] font-mono">{new Date(sale.created_at).toLocaleString()}</span>
    },
    {
      header: 'Associated Client',
      accessor: (sale: Sale) => <span className="font-semibold text-slate-700">{sale.customer_name || 'Generic Walk-in'}</span>
    },
    {
      header: 'Receipt Mode',
      accessor: (sale: Sale) => (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
          sale.payment_method === 'Cash' 
            ? 'bg-amber-50 text-amber-700 border border-amber-100' 
            : sale.payment_method === 'Bank' 
              ? 'bg-blue-50 text-blue-700 border border-blue-100' 
              : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
        }`}>
          {sale.payment_method}
        </span>
      )
    },
    {
      header: 'Billing Amount',
      accessor: (sale: Sale) => <strong className="text-rose-600 font-mono tabular-nums">{formatCurrency(sale.total_amount)}</strong>
    },
    {
      header: 'Items Purchased',
      accessor: (sale: Sale) => (
        <span className="text-[10px] text-slate-400 truncate block max-w-xs font-mono">
          {sale.items?.map(it => `${it.product_name || 'Item'} (${it.quantity})`).join(', ') || 'General Charging'}
        </span>
      )
    }
  ];

  return (
    <div className="space-y-6" id="sales-page">
      {/* Tab controls */}
      <div className="flex justify-between items-center bg-slate-50 border border-slate-200/60 p-1.5 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('pos')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'pos' 
              ? 'bg-white text-slate-800 shadow-sm' 
              : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          <ShoppingCart className="w-4 h-4 inline mr-1.5 shrink-0" />
          <span>Terminal Register</span>
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'ledger' 
              ? 'bg-white text-slate-800 shadow-sm' 
              : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          <FileText className="w-4 h-4 inline mr-1.5 shrink-0" />
          <span>Historical Receipts Ledger</span>
        </button>
      </div>

      {activeTab === 'pos' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="pos-view">
          {/* Catalog Selection Column */}
          <div className="lg:col-span-7 space-y-4 text-left">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">POS Billing Clerk</h1>
              <p className="text-sm text-slate-500 mt-1">Dispense stationery products or physical items immediately on site.</p>
            </div>

            {/* Catalog Search input */}
            <div className="relative">
              <input
                type="text"
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 focus:border-rose-500 text-slate-700 font-medium rounded-2xl outline-none text-sm shadow-xs transition-all"
                placeholder="Type search keys (e.g. stationery, paper, binder)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            </div>

            {/* Catalog Picker area */}
            <div className="bg-slate-50 border border-slate-200/20 rounded-3xl p-4 min-h-[380px] max-h-[500px] overflow-y-auto">
              {loading ? (
                <div className="h-[250px] flex flex-col items-center justify-center text-center text-slate-400">
                  <RefreshCw className="w-8 h-8 animate-spin text-rose-500 mb-2" />
                  <span className="text-xs font-mono">Loading product lines...</span>
                </div>
              ) : filteredProducts.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredProducts.map(p => {
                    const outOfStock = p.quantity <= 0;
                    return (
                      <motion.div
                        key={p.id}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => !outOfStock && addToCart(p)}
                        className={`bg-white rounded-2xl p-4 border transition-all flex flex-col justify-between h-[125px] cursor-pointer text-left select-none ${
                          outOfStock 
                            ? 'opacity-60 border-slate-200 cursor-not-allowed bg-slate-50' 
                            : 'border-slate-200 hover:border-rose-400 hover:shadow-md'
                        }`}
                      >
                        <div>
                          <div className="flex justify-between items-start">
                            <span className="text-[9px] font-bold text-rose-500 bg-rose-50 border border-rose-100 rounded-md px-1.5 py-0.5 uppercase tracking-wide">
                              {p.category}
                            </span>
                            <span className={`text-[10px] font-bold ${outOfStock ? 'text-rose-500' : 'text-slate-500'}`}>
                              {outOfStock ? 'Sold Out' : `Stock: ${p.quantity}`}
                            </span>
                          </div>
                          <h4 className="font-bold text-slate-800 text-xs line-clamp-2 leading-tight mt-2">{p.name}</h4>
                        </div>

                        <div className="flex justify-between items-center pt-2 mt-2 border-t border-slate-100">
                          <span className="text-rose-600 font-extrabold text-xs tabular-nums">{formatCurrency(p.selling_price)}</span>
                          {!outOfStock && (
                            <div className="bg-rose-50 hover:bg-rose-100 p-1 rounded-lg text-rose-500 transition-all">
                              <Plus className="w-3.5 h-3.5 stroke-[3]" />
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-[250px] flex flex-col items-center justify-center text-center text-slate-400">
                  <Sparkles className="w-10 h-10 text-slate-300 mb-2" />
                  <h4 className="font-semibold text-xs text-slate-500">Products Catalog Empty</h4>
                  <p className="text-[11px] text-slate-400 max-w-xs mt-1">Adjust search keywords or add products to inventory page.</p>
                </div>
              )}
            </div>
          </div>

          {/* Checkout billing column */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4 flex flex-col justify-between min-h-[480px]">
              
              {/* Items Panel */}
              <div>
                <div className="flex justify-between items-center border-b pb-3 text-left">
                  <h2 className="font-bold text-slate-800 text-sm flex items-center">
                    <ShoppingCart className="w-4 h-4 mr-2 text-rose-500" />
                    <span>Receipt Cart ({cart.reduce((s, c) => s + c.quantity, 0)})</span>
                  </h2>
                  {cart.length > 0 && (
                    <button 
                      onClick={() => setCart([])}
                      className="text-xs text-rose-500 font-black hover:underline cursor-pointer"
                    >
                      Empty
                    </button>
                  )}
                </div>

                <div className="py-1 max-h-[180px] overflow-y-auto divide-y divide-slate-100">
                  {cart.length > 0 ? (
                    cart.map(item => (
                      <div key={item.product.id} className="py-2.5 flex items-start justify-between text-xs">
                        <div className="pr-2 truncate text-left">
                          <span className="font-semibold text-slate-700 block truncate">{item.product.name}</span>
                          <span className="text-[10px] text-rose-500 font-mono font-bold tabular-nums">{formatCurrency(item.product.selling_price)} each</span>
                        </div>
                        
                        <div className="flex items-center space-x-2 shrink-0">
                          <div className="flex items-center space-x-1 border border-slate-200 bg-slate-50 rounded-lg p-0.5">
                            <button 
                              onClick={() => updateCartQuantity(item.product.id, -1)}
                              className="p-1 text-slate-500 hover:bg-slate-200 rounded-sm cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-6 text-center text-xs font-bold text-slate-700 font-mono tabular-nums">{item.quantity}</span>
                            <button 
                              onClick={() => updateCartQuantity(item.product.id, 1)}
                              className="p-1 text-slate-500 hover:bg-slate-200 rounded-sm cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <button 
                            onClick={() => removeCartItem(item.product.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center text-slate-400">
                      <div className="w-10 h-10 bg-slate-50 border rounded-full flex items-center justify-center mx-auto mb-2 text-slate-300">
                        <ShoppingCart className="w-4 h-4" />
                      </div>
                      <span className="font-semibold text-xs block text-slate-500">Cart structure is empty</span>
                      <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">Touch left catalog cards to bill</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Customers selection and triggers */}
              <div className="space-y-3 pt-3 border-t text-left">
                <div className="space-y-1">
                  <label className="text-xs text-slate-500 flex justify-between items-center">
                    <span>Associated Customer Profile</span>
                    {isAddingCustomer ? (
                      <button 
                        onClick={() => setIsAddingCustomer(false)}
                        className="text-[10px] text-slate-400 font-semibold hover:underline"
                      >
                        Select Existing
                      </button>
                    ) : (
                      <button 
                        onClick={() => setIsAddingCustomer(true)}
                        className="text-[10px] text-rose-500 font-bold hover:underline flex items-center cursor-pointer"
                      >
                        <UserPlus className="w-3 h-3 mr-0.5 shrink-0" /> Fast Registration
                      </button>
                    )}
                  </label>

                  {isAddingCustomer ? (
                    <form onSubmit={handleAddNewCustomerOnPOS} className="bg-slate-50 border border-slate-200 p-3 rounded-2xl space-y-2 text-xs">
                      <input
                        type="text"
                        required
                        placeholder="Customer Name e.g. Alinafe"
                        value={newCustName}
                        onChange={(e) => setNewCustName(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg outline-none text-slate-800 focus:border-rose-400"
                      />
                      <input
                        type="text"
                        placeholder="Phone code e.g. +265 888..."
                        value={newCustPhone}
                        onChange={(e) => setNewCustPhone(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg outline-none text-slate-800 focus:border-rose-400"
                      />
                      <button type="submit" className="w-full text-[11px] bg-rose-500 hover:bg-rose-600 text-white font-bold py-1.5 rounded-lg cursor-pointer">
                        Confirm & Fast Assign
                      </button>
                    </form>
                  ) : (
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs outline-none focus:border-rose-500 cursor-pointer"
                    >
                      <option value="">-- Anonymous Walk-in Client --</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.phone || 'No Contact'})</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Receipt pay options */}
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Validated Payment Mode</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['Cash', 'Mobile Money', 'Bank'] as const).map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPaymentMethod(mode)}
                        className={`py-2 text-[11px] font-bold border rounded-xl text-center cursor-pointer transition-all ${
                          paymentMethod === mode
                            ? 'bg-rose-50 border-rose-500 text-rose-700 shadow-sm'
                            : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pricing logs */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-1 font-mono tabular-nums">
                  <div className="flex justify-between text-slate-500">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(totalAmount, { symbol: false })}</span>
                  </div>
                  <div className="flex justify-between text-slate-800 font-bold border-t pt-1.5 text-sm">
                    <span>Receipt Total:</span>
                    <span className="text-rose-600">{formatCurrency(totalAmount)}</span>
                  </div>
                </div>

                {/* Messages notifications */}
                {errorText && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-900 text-[11px] font-mono p-3 rounded-xl flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>{errorText}</span>
                  </div>
                )}

                {successText && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-950 text-[11px] p-3 rounded-xl flex items-center space-x-2">
                    <Check className="w-4 h-4 text-emerald-600 stroke-[3] shrink-0" />
                    <span>{successText}</span>
                  </div>
                )}

                {/* Checkout core action */}
                <button
                  disabled={cart.length === 0 || loading}
                  onClick={handleCheckout}
                  className="w-full py-3.5 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg flex items-center justify-center space-x-2 cursor-pointer transition-all text-xs"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>{loading ? 'Validating transactions...' : 'Record Safe POS checkout'}</span>
                </button>
              </div>

            </div>
          </div>
        </div>
      ) : (
        <div id="ledger-view" className="space-y-4">
          <div className="flex justify-between items-center text-left">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Sales Register Ledger</h1>
              <p className="text-xs text-slate-400 mt-0.5">Comprehensive audit spreadsheet. View historical transactions.</p>
            </div>
            
            <button 
              onClick={syncSalesDeskData}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 cursor-pointer flex items-center transition"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Reload register
            </button>
          </div>

          <DataTable 
            data={salesLedger}
            columns={ledgerColumns}
            searchPlaceholder="Search invoices or customer names..."
            filterFunction={(sale, q) => 
              sale.id.toLowerCase().includes(q.toLowerCase()) || 
              (sale.customer_name || 'Walk-in Customer').toLowerCase().includes(q.toLowerCase()) || 
              sale.payment_method.toLowerCase().includes(q.toLowerCase())
            }
            emptyMessage="No point-of-sale invoices recorded in PostgreSQL table yet."
          />
        </div>
      )}
    </div>
  );
}
