import React, { useState, useEffect, useMemo } from 'react';
import { Product, Customer, Sale } from '../types';
import {
  fetchProducts, fetchCustomers, insertCustomer,
  insertSale, fetchSales
} from '../services/supabase';
import {
  ShoppingCart, Search, Plus, Minus, Trash2,
  CreditCard, Check, UserPlus, X,
  AlertCircle, RefreshCw, FileText, Package,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import DataTable from '../components/DataTable';
import { formatCurrency } from '../utils/format';
import { cartTotal } from '../utils/billing';

interface SalesPageProps {
  userRole: string;
}

interface CartItem {
  product: Product;
  quantity: number;
}

type CheckoutPhase = 'idle' | 'processing' | 'done';

export default function Sales({ userRole }: SalesPageProps) {
  const [activeTab, setActiveTab] = useState<'pos' | 'ledger'>('pos');
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesLedger, setSalesLedger] = useState<Sale[]>([]);

  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Mobile Money' | 'Bank'>('Cash');
  const [errorText, setErrorText] = useState('');
  const [successText, setSuccessText] = useState('');
  const [phase, setPhase] = useState<CheckoutPhase>('idle');

  // Fast-registration slide-over
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [regError, setRegError] = useState('');

  const syncSalesDeskData = async () => {
    setLoading(true);
    try {
      const [prods, custs, ledger] = await Promise.all([
        fetchProducts(),
        fetchCustomers(),
        fetchSales(),
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

  useEffect(() => { syncSalesDeskData(); }, []);

  // Category chips derived from the sellable catalog
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => { if (p.min_stock_level !== -1) set.add(p.category); });
    return ['All', ...Array.from(set).sort()];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
      const matchesCategory = category === 'All' || p.category === category;
      return matchesSearch && matchesCategory && p.min_stock_level !== -1;
    });
  }, [products, searchQuery, category]);

  const totalAmount = useMemo(() => {
    return cartTotal(cart.map(item => ({
      unitPrice: item.product.selling_price,
      quantity: item.quantity,
    })));
  }, [cart]);

  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);
  const canCheckout = cart.length > 0 && totalAmount > 0 && phase !== 'processing';

  const addToCart = (product: Product) => {
    setErrorText('');
    setSuccessText('');
    setPhase('idle');

    if (product.quantity <= 0) {
      setErrorText(`${product.name} is out of stock.`);
      return;
    }

    const index = cart.findIndex(item => item.product.id === product.id);
    if (index >= 0) {
      if (cart[index].quantity >= product.quantity) {
        setErrorText(`Only ${product.quantity} of ${product.name} in stock.`);
        return;
      }
      const updated = [...cart];
      updated[index].quantity += 1;
      setCart(updated);
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
    setFlashId(product.id);
    setTimeout(() => setFlashId(cur => (cur === product.id ? null : cur)), 600);
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
        setErrorText(`Only ${item.product.quantity} of ${item.product.name} in stock.`);
        return;
      }
      const updated = [...cart];
      updated[index].quantity = newQty;
      setCart(updated);
    }
  };

  const removeCartItem = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const handleAddNewCustomerOnPOS = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    if (!newCustName.trim()) {
      setRegError('Enter a name to register the customer.');
      return;
    }
    try {
      const customer = await insertCustomer(newCustName, newCustPhone, newCustEmail);
      if (customer) {
        const freshCusts = await fetchCustomers();
        setCustomers(freshCusts);
        setSelectedCustomerId(customer.id);
        setIsAddingCustomer(false);
        setNewCustName(''); setNewCustPhone(''); setNewCustEmail('');
      }
    } catch (e: any) {
      setRegError("Couldn't save the customer. Try again.");
    }
  };

  const handleCheckout = async () => {
    setErrorText('');
    setSuccessText('');
    if (!canCheckout) return;

    const itemsPayload = cart.map(item => ({
      product_id: item.product.id,
      quantity: item.quantity,
      unit_price: item.product.selling_price,
    }));

    setPhase('processing');
    const result = await insertSale(
      selectedCustomerId ? selectedCustomerId : null,
      itemsPayload,
      paymentMethod,
    );

    if (typeof result === 'string') {
      setErrorText(`Checkout failed: ${result}`);
      setPhase('idle');
      return;
    }

    setPhase('done');
    setSuccessText(`Checked out — receipt ${result.id.slice(0, 8)} saved.`);
    setCart([]);
    setSelectedCustomerId('');
    setPaymentMethod('Cash');
    await syncSalesDeskData();
    setTimeout(() => setPhase('idle'), 1800);
  };

  const payLabel = phase === 'processing' ? 'Processing…' : phase === 'done' ? 'Checkout complete' : 'Record checkout';

  // Ledger table columns
  const ledgerColumns = [
    {
      header: 'Receipt',
      accessor: (sale: Sale) => (
        <span className="dm-nums" style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-mid)', background: 'var(--panel-2)', padding: '2px 6px', borderRadius: 6, border: '1px solid var(--panel-line)' }}>
          {sale.id.slice(0, 8)}
        </span>
      ),
    },
    {
      header: 'Time',
      accessor: (sale: Sale) => <span className="dm-nums" style={{ fontSize: 11, color: 'var(--text-low)' }}>{new Date(sale.created_at).toLocaleString()}</span>,
    },
    {
      header: 'Customer',
      accessor: (sale: Sale) => <span style={{ fontWeight: 600, color: 'var(--text-hi)' }}>{sale.customer_name || 'Walk-in'}</span>,
    },
    {
      header: 'Method',
      accessor: (sale: Sale) => {
        const cls = sale.payment_method === 'Cash' ? 'dm-badge-warning'
          : sale.payment_method === 'Bank' ? 'dm-badge-info' : 'dm-badge-success';
        return <span className={`dm-badge ${cls}`}>{sale.payment_method}</span>;
      },
    },
    {
      header: 'Amount',
      accessor: (sale: Sale) => <strong className="dm-nums" style={{ color: 'var(--blue-400)' }}>{formatCurrency(sale.total_amount)}</strong>,
    },
    {
      header: 'Items',
      accessor: (sale: Sale) => (
        <span className="dm-truncate" style={{ display: 'block', maxWidth: '18rem', fontSize: 11, color: 'var(--text-low)' }}>
          {sale.items?.map(it => `${it.product_name || 'Item'} (${it.quantity})`).join(', ') || 'General'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 dm-animate-in" id="sales-page">
      {/* Tab controls */}
      <div className="dm-seg" style={{ width: 'fit-content' }}>
        <button onClick={() => setActiveTab('pos')} className={`dm-seg-item ${activeTab === 'pos' ? 'active' : ''}`}>
          <ShoppingCart style={{ width: 15, height: 15 }} /> Terminal
        </button>
        <button onClick={() => setActiveTab('ledger')} className={`dm-seg-item ${activeTab === 'ledger' ? 'active' : ''}`}>
          <FileText style={{ width: 15, height: 15 }} /> Receipts
        </button>
      </div>

      {activeTab === 'pos' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="pos-view">
          {/* Catalog column */}
          <div className="lg:col-span-7 space-y-4">
            <div>
              <h1 className="dm-h1">POS &amp; Sales</h1>
              <p style={{ color: 'var(--text-mid)', fontSize: '0.875rem', marginTop: 4 }}>Tap a product to add it to the cart.</p>
            </div>

            {/* Search + category filter bar (sticky) */}
            <div
              className="space-y-3 py-1"
              style={{ position: 'sticky', top: 0, zIndex: 10 }}
            >
              <div className="relative">
                <Search style={{ width: 16, height: 16, color: 'var(--text-low)', position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  className="dm-input"
                  style={{ paddingLeft: '2.5rem' }}
                  placeholder="Search products…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="dm-scroll-x flex gap-2 pb-1">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`dm-badge ${category === cat ? 'dm-badge-info' : 'dm-badge-neutral'}`}
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', cursor: 'pointer', flexShrink: 0 }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Catalog grid */}
            <div className="dm-card-inset p-4" style={{ minHeight: 360 }}>
              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="dm-skeleton" style={{ height: 96 }} />)}
                </div>
              ) : filteredProducts.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredProducts.map(p => {
                    const outOfStock = p.quantity <= 0;
                    const low = !outOfStock && p.min_stock_level !== undefined && p.quantity <= p.min_stock_level;
                    return (
                      <motion.button
                        key={p.id}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => !outOfStock && addToCart(p)}
                        disabled={outOfStock}
                        className="dm-card text-left"
                        style={{
                          padding: 14,
                          display: 'flex', flexDirection: 'column', gap: 8,
                          cursor: outOfStock ? 'not-allowed' : 'pointer',
                          opacity: outOfStock ? 0.5 : 1,
                          transition: 'border-color 0.15s, transform 0.15s',
                        }}
                        onMouseEnter={e => { if (!outOfStock) (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(76,111,255,0.5)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--panel-line)'; }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="dm-badge dm-badge-info dm-truncate" style={{ maxWidth: '60%' }}>{p.category}</span>
                          <span className={`dm-badge ${outOfStock ? 'dm-badge-danger' : low ? 'dm-badge-warning' : 'dm-badge-neutral'}`}>
                            {outOfStock ? 'Out' : `${p.quantity} left`}
                          </span>
                        </div>
                        <h4 style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-hi)', lineHeight: 1.3 }}>{p.name}</h4>
                        <div className="flex items-center justify-between mt-auto">
                          <span className="dm-nums" style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-hi)' }}>
                            {formatCurrency(p.selling_price)}
                          </span>
                          {!outOfStock && (
                            <span
                              className="flex items-center justify-center"
                              style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--blue-bg)', color: 'var(--blue-400)', border: '1px solid rgba(76,111,255,0.3)' }}
                            >
                              <Plus style={{ width: 16, height: 16 }} strokeWidth={2.5} />
                            </span>
                          )}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center" style={{ minHeight: 300, color: 'var(--text-low)' }}>
                  <Package style={{ width: 40, height: 40, color: 'var(--text-low)', marginBottom: 10, opacity: 0.6 }} />
                  <h4 style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-mid)' }}>No products here</h4>
                  <p style={{ fontSize: '0.8rem', maxWidth: 260, marginTop: 4 }}>Try a different search or category, or add products in Inventory.</p>
                </div>
              )}
            </div>
          </div>

          {/* Cart column */}
          <div className="lg:col-span-5">
            <div className="dm-card p-5 space-y-4 flex flex-col" style={{ position: 'sticky', top: 12, minHeight: 480 }}>
              {/* Cart header */}
              <div className="flex justify-between items-center pb-3" style={{ borderBottom: '1px solid var(--panel-line)' }}>
                <h2 className="dm-h2 flex items-center gap-2">
                  <ShoppingCart style={{ width: 18, height: 18, color: 'var(--blue-400)' }} />
                  Cart <span className="dm-nums" style={{ color: 'var(--text-low)' }}>({cartCount})</span>
                </h2>
                {cart.length > 0 && (
                  <button onClick={() => setCart([])} className="dm-btn dm-btn-ghost" style={{ minHeight: 32, padding: '0 0.65rem', fontSize: '0.75rem' }}>
                    Clear
                  </button>
                )}
              </div>

              {/* Line items */}
              <div className="flex-1 overflow-y-auto" style={{ maxHeight: 220, marginRight: -6, paddingRight: 6 }}>
                {cart.length > 0 ? (
                  <div className="space-y-2">
                    {cart.map(item => (
                      <div
                        key={item.product.id}
                        className={`flex items-center justify-between gap-2 p-2.5 rounded-xl ${flashId === item.product.id ? 'dm-flash' : ''}`}
                        style={{ background: 'var(--panel-2)', border: '1px solid var(--panel-line)' }}
                      >
                        <div className="min-w-0">
                          <div className="dm-truncate" style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-hi)' }}>{item.product.name}</div>
                          <div className="dm-nums" style={{ fontSize: '0.7rem', color: 'var(--blue-400)', fontWeight: 600 }}>{formatCurrency(item.product.selling_price)} each</div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <div className="flex items-center" style={{ background: 'var(--bg-1)', border: '1px solid var(--panel-line)', borderRadius: 9 }}>
                            <button onClick={() => updateCartQuantity(item.product.id, -1)} className="dm-icon-btn" style={{ width: 30, height: 30, background: 'transparent', border: 'none' }} aria-label="Decrease">
                              <Minus style={{ width: 13, height: 13 }} />
                            </button>
                            <span className="dm-nums text-center" style={{ width: 24, fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-hi)' }}>{item.quantity}</span>
                            <button onClick={() => updateCartQuantity(item.product.id, 1)} className="dm-icon-btn" style={{ width: 30, height: 30, background: 'transparent', border: 'none' }} aria-label="Increase">
                              <Plus style={{ width: 13, height: 13 }} />
                            </button>
                          </div>
                          <button onClick={() => removeCartItem(item.product.id)} className="dm-icon-btn" style={{ width: 30, height: 30, color: 'var(--text-low)' }} aria-label="Remove">
                            <Trash2 style={{ width: 14, height: 14 }} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center py-10" style={{ color: 'var(--text-low)' }}>
                    <div className="flex items-center justify-center mb-2" style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--panel-2)', border: '1px solid var(--panel-line)' }}>
                      <ShoppingCart style={{ width: 18, height: 18 }} />
                    </div>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-mid)' }}>No items yet</span>
                    <p style={{ fontSize: '0.78rem', marginTop: 2 }}>Tap a product to add it.</p>
                  </div>
                )}
              </div>

              {/* Footer: customer, payment, totals, checkout */}
              <div className="space-y-3 pt-3" style={{ borderTop: '1px solid var(--panel-line)' }}>
                {/* Customer */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="dm-label" style={{ padding: 0 }}>Customer</label>
                    <button onClick={() => { setIsAddingCustomer(true); setRegError(''); }} className="flex items-center gap-1" style={{ fontSize: '0.72rem', color: 'var(--blue-400)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
                      <UserPlus style={{ width: 13, height: 13 }} /> Fast registration
                    </button>
                  </div>
                  <select value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)} className="dm-select">
                    <option value="">Walk-in customer</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>
                    ))}
                  </select>
                </div>

                {/* Payment method */}
                <div className="space-y-1.5">
                  <label className="dm-label" style={{ padding: 0 }}>Payment method</label>
                  <div className="dm-seg" style={{ width: '100%' }}>
                    {(['Cash', 'Mobile Money', 'Bank'] as const).map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPaymentMethod(mode)}
                        className={`dm-seg-item ${paymentMethod === mode ? 'active' : ''}`}
                        style={{ flex: 1, padding: '0 0.5rem', fontSize: '0.75rem' }}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Totals */}
                <div className="dm-card-inset p-3.5 space-y-1.5">
                  <div className="flex justify-between dm-nums" style={{ fontSize: '0.8rem', color: 'var(--text-mid)' }}>
                    <span>Subtotal</span>
                    <span>{formatCurrency(totalAmount, { symbol: false })}</span>
                  </div>
                  <div className="flex justify-between items-baseline pt-1.5" style={{ borderTop: '1px solid var(--panel-line)' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-hi)' }}>Total</span>
                    <span className="dm-nums" style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: '1.25rem', color: 'var(--blue-400)' }}>{formatCurrency(totalAmount)}</span>
                  </div>
                </div>

                {/* Messages */}
                {errorText && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,107,107,0.3)', fontSize: '0.78rem', color: 'var(--danger)' }} role="alert">
                    <AlertCircle style={{ width: 15, height: 15, flexShrink: 0 }} />
                    <span>{errorText}</span>
                  </div>
                )}
                {successText && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--success-bg)', border: '1px solid rgba(61,220,151,0.3)', fontSize: '0.78rem', color: 'var(--success)' }}>
                    <Check style={{ width: 15, height: 15, flexShrink: 0 }} strokeWidth={3} />
                    <span>{successText}</span>
                  </div>
                )}

                {/* Checkout */}
                <button disabled={!canCheckout} onClick={handleCheckout} className="dm-btn dm-btn-primary w-full" style={{ minHeight: 48 }}>
                  {phase === 'processing'
                    ? <RefreshCw style={{ width: 16, height: 16 }} className="dm-spin" />
                    : phase === 'done'
                      ? <Check style={{ width: 16, height: 16 }} strokeWidth={3} />
                      : <CreditCard style={{ width: 16, height: 16 }} />}
                  <span>{payLabel}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div id="ledger-view" className="space-y-4">
          <div className="flex justify-between items-center gap-4">
            <div>
              <h1 className="dm-h1">Receipts ledger</h1>
              <p style={{ color: 'var(--text-mid)', fontSize: '0.8rem', marginTop: 2 }}>Every recorded transaction, newest first.</p>
            </div>
            <button onClick={syncSalesDeskData} className="dm-btn dm-btn-ghost">
              <RefreshCw style={{ width: 15, height: 15 }} className={loading ? 'dm-spin' : ''} /> Reload
            </button>
          </div>

          <DataTable
            data={salesLedger}
            columns={ledgerColumns}
            searchPlaceholder="Search receipts or customers…"
            filterFunction={(sale, q) =>
              sale.id.toLowerCase().includes(q.toLowerCase()) ||
              (sale.customer_name || 'Walk-in').toLowerCase().includes(q.toLowerCase()) ||
              sale.payment_method.toLowerCase().includes(q.toLowerCase())
            }
            emptyMessage="No sales recorded yet. Complete a checkout to see it here."
            loading={loading}
          />
        </div>
      )}

      {/* ---- Fast registration slide-over ---- */}
      <AnimatePresence>
        {isAddingCustomer && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsAddingCustomer(false)}
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(7,11,36,0.6)', backdropFilter: 'blur(4px)' }}
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
              className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-sm p-6 overflow-y-auto"
              style={{ background: 'var(--bg-1)', borderLeft: '1px solid var(--panel-line)', boxShadow: 'var(--shadow-modal)' }}
              role="dialog" aria-label="Fast customer registration"
            >
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h3 className="dm-h2">Fast registration</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-mid)', marginTop: 2 }}>Add a customer without leaving the sale.</p>
                </div>
                <button onClick={() => setIsAddingCustomer(false)} className="dm-icon-btn" aria-label="Close">
                  <X style={{ width: 16, height: 16 }} />
                </button>
              </div>

              <form onSubmit={handleAddNewCustomerOnPOS} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="dm-label" style={{ padding: 0 }}>Name</label>
                  <input type="text" required className="dm-input" placeholder="e.g. Alinafe Phiri" value={newCustName} onChange={e => setNewCustName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="dm-label" style={{ padding: 0 }}>Phone</label>
                  <input type="text" className="dm-input" placeholder="e.g. +260 97 123 4567" value={newCustPhone} onChange={e => setNewCustPhone(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="dm-label" style={{ padding: 0 }}>Email (optional)</label>
                  <input type="email" className="dm-input" placeholder="e.g. alinafe@email.com" value={newCustEmail} onChange={e => setNewCustEmail(e.target.value)} />
                </div>

                {regError && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,107,107,0.3)', fontSize: '0.78rem', color: 'var(--danger)' }} role="alert">
                    <AlertCircle style={{ width: 15, height: 15, flexShrink: 0 }} />
                    <span>{regError}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setIsAddingCustomer(false)} className="dm-btn dm-btn-ghost flex-1">Cancel</button>
                  <button type="submit" className="dm-btn dm-btn-primary flex-1">Add &amp; select</button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
