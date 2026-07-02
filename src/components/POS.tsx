import React, { useState, useMemo } from 'react';
import { Product, Customer } from '../types';
import { getProducts, getCustomers, addCustomer, createSale } from '../utils/db';
import { 
  ShoppingCart, Search, Plus, Minus, Trash2, 
  CreditCard, Sparkles, Check, UserPlus, Info, Terminal, AlertCircle 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface POSProps {
  userRole: string;
}

interface CartItem {
  product: Product;
  quantity: number;
}

export default function POS({ userRole }: POSProps) {
  const [products, setProducts] = useState<Product[]>(getProducts());
  const [customers, setCustomers] = useState<Customer[]>(getCustomers());
  
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Mobile Money' | 'Bank'>('Cash');
  const [errorText, setErrorText] = useState('');
  const [successText, setSuccessText] = useState('');

  // Registering a temporary fast client
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');

  // Fast moving products sorted/filtered
  const filteredProducts = useMemo(() => {
    // Only display products that are not "virtual scanning/unlimited" or have positive stock
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            p.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch && p.min_stock_level !== -1; // hide infinite setup or general items if too complex
    });
  }, [products, searchQuery]);

  // Total cart calculation
  const totalAmount = useMemo(() => {
    return cart.reduce((total, item) => total + (item.product.selling_price * item.quantity), 0);
  }, [cart]);

  // Mutating quantity on cart
  const addToCart = (product: Product) => {
    setErrorText('');
    setSuccessText('');
    
    // Check if item has stock
    if (product.quantity <= 0) {
      setErrorText(`Failed: Product "${product.name}" is completely out of stock.`);
      return;
    }

    const index = cart.findIndex(item => item.product.id === product.id);
    if (index >= 0) {
      const currentQty = cart[index].quantity;
      if (currentQty >= product.quantity) {
        setErrorText(`Cannot exceed physical stock of: ${product.quantity} units.`);
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
      // Remove item
      const updatedCart = cart.filter(ci => ci.product.id !== productId);
      setCart(updatedCart);
    } else {
      if (newQty > item.product.quantity) {
        setErrorText(`Cannot exceed physical stock of: ${item.product.quantity} units for ${item.product.name}.`);
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

  // Create client profile on POS
  const handleAddNewCustomerOnPOS = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) return;

    try {
      const customer = addCustomer(newCustName, newCustPhone, newCustEmail);
      setCustomers(getCustomers()); // Refresh local customers list
      setSelectedCustomerId(customer.id); // Auto-assign to POS sale
      setIsAddingCustomer(false);
      
      // Clear forms
      setNewCustName('');
      setNewCustPhone('');
      setNewCustEmail('');
    } catch (e: any) {
      setErrorText('Error adding customer profile.');
    }
  };

  // Checkout transaction
  const handleCheckout = () => {
    setErrorText('');
    setSuccessText('');

    if (cart.length === 0) {
      setErrorText('Merchant cart is empty.');
      return;
    }

    const itemsPayload = cart.map(item => ({
      product_id: item.product.id,
      quantity: item.quantity,
      unit_price: item.product.selling_price
    }));

    const result = createSale(
      selectedCustomerId ? selectedCustomerId : null,
      itemsPayload,
      paymentMethod
    );

    if (typeof result === 'string') {
      setErrorText(`Transaction Aborted: ${result}`);
      return;
    }

    // Success
    setSuccessText(`Checkout successfully logged! Sale ID: ${result.id}`);
    setCart([]);
    setSelectedCustomerId('');
    setPaymentMethod('Cash');
    setProducts(getProducts()); // Pull updated stock levels
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="pos-tab">
      {/* Search and item picker catalog (8 cols on lg) */}
      <div className="lg:col-span-7 space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">POS Sales Desk</h1>
          <p className="text-sm text-slate-500 mt-1">Dispense stationery products and digital typing charges instant.</p>
        </div>

        {/* Search tool */}
        <div className="relative">
          <input
            type="text"
            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 focus:border-rose-500 text-slate-700 font-medium rounded-2xl outline-none text-sm shadow-xs transition-all"
            placeholder="Type search keys (e.g. pen, paper, embedding, stationery)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        </div>

        {/* Catalog items scrollable panel */}
        <div className="bg-slate-50 border border-slate-200/50 rounded-3xl p-4 min-h-[400px] max-h-[550px] overflow-y-auto">
          {filteredProducts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {filteredProducts.map(p => {
                const outOfStock = p.quantity <= 0;
                return (
                  <motion.div
                    key={p.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => !outOfStock && addToCart(p)}
                    className={`bg-white rounded-2xl p-4 border transition-all flex flex-col justify-between h-[130px] cursor-pointer text-left select-none ${
                      outOfStock 
                        ? 'opacity-60 border-slate-200 cursor-not-allowed bg-slate-50' 
                        : 'border-slate-200/80 hover:border-rose-400/60 hover:shadow-md'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start">
                        <span className="text-[9px] font-bold text-rose-500 bg-rose-50/50 border border-rose-100 rounded-md px-1.5 py-0.5 uppercase tracking-wide">
                          {p.category}
                        </span>
                        <span className={`text-[10px] font-bold ${outOfStock ? 'text-rose-500' : 'text-slate-500'}`}>
                          {outOfStock ? 'Sold Out' : `Stock: ${p.quantity}`}
                        </span>
                      </div>
                      <h4 className="font-bold text-slate-800 text-xs line-clamp-2 leading-tight mt-2">{p.name}</h4>
                    </div>

                    <div className="flex justify-between items-center pt-2 mt-2 border-t border-slate-100">
                      <span className="text-rose-600 font-extrabold text-xs">MWK {p.selling_price}</span>
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
              <h4 className="font-semibold text-xs text-slate-500">Inventory Catalog Empty</h4>
              <p className="text-[11px] text-slate-400/80 max-w-xs mt-1">No products match current filters. Re-adjust your search keywords.</p>
            </div>
          )}
        </div>
      </div>

      {/* Cart calculator and payment options (5 cols on lg) */}
      <div className="lg:col-span-5 space-y-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4 flex flex-col justify-between min-h-[500px]">
          {/* Cart Header */}
          <div>
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="font-bold text-slate-800 text-sm flex items-center">
                <ShoppingCart className="w-4 h-4 mr-2 text-rose-500" />
                <span>Selected Items ({cart.reduce((s, c) => s + c.quantity, 0)})</span>
              </h2>
              {cart.length > 0 && (
                <button 
                  onClick={() => setCart([])}
                  className="text-xs text-rose-500 font-bold hover:underline"
                >
                  Clear Cart
                </button>
              )}
            </div>

            {/* Cart list scrollable dynamic */}
            <div className="py-2.5 max-h-[220px] overflow-y-auto divide-y divide-slate-100">
              {cart.length > 0 ? (
                cart.map(item => (
                  <div key={item.product.id} className="py-3 flex items-start justify-between text-xs">
                    <div className="pr-2 truncate">
                      <span className="font-semibold text-slate-700 block truncate">{item.product.name}</span>
                      <span className="text-[10px] text-rose-500 font-mono">MWK {item.product.selling_price} each</span>
                    </div>
                    {/* Controls increment */}
                    <div className="flex items-center space-x-2 shrink-0">
                      <div className="flex items-center space-x-1 border border-slate-200 bg-slate-50 rounded-lg p-0.5">
                        <button 
                          onClick={() => updateCartQuantity(item.product.id, -1)}
                          className="p-1 text-slate-500 hover:bg-slate-200 rounded-sm"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center text-xs font-bold text-slate-700">{item.quantity}</span>
                        <button 
                          onClick={() => updateCartQuantity(item.product.id, 1)}
                          className="p-1 text-slate-500 hover:bg-slate-200 rounded-sm"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <button 
                        onClick={() => removeCartItem(item.product.id)}
                        className="p-2 text-slate-400 hover:text-rose-500 transition-all rounded-lg hover:bg-slate-50"
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
                  <span className="font-semibold text-xs block text-slate-500">Cart status empty</span>
                  <p className="text-[10px] text-slate-400/80 mt-1 uppercase tracking-wide">Select catalog items to bill</p>
                </div>
              )}
            </div>
          </div>

          {/* Customer profile selection + Payment Methods */}
          <div className="space-y-3 pt-3 border-t">
            {/* Customer dropdown */}
            <div className="space-y-1">
              <label className="text-xs text-slate-500 flex justify-between items-center">
                <span>Associated Customer (Optional)</span>
                {isAddingCustomer ? (
                  <button 
                    onClick={() => setIsAddingCustomer(false)}
                    className="text-[10px] text-slate-400 font-semibold hover:underline"
                  >
                    Use Existing
                  </button>
                ) : (
                  <button 
                    onClick={() => setIsAddingCustomer(true)}
                    className="text-[10px] text-rose-500 font-bold hover:underline flex items-center"
                  >
                    <UserPlus className="w-3 h-3 mr-0.5" /> Quick Add Profile
                  </button>
                )}
              </label>

              {isAddingCustomer ? (
                <form onSubmit={handleAddNewCustomerOnPOS} className="bg-slate-50 border border-slate-200 p-3 rounded-2xl space-y-2 text-xs">
                  <span className="font-bold text-slate-600 text-[10px] uppercase block">Register Walk-in profile</span>
                  <input
                    type="text"
                    required
                    placeholder="Customer Name e.g. Alinafe"
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    className="w-full px-2.5 py-1.5 focus:bg-white bg-slate-100 border border-slate-200 rounded-lg outline-none text-slate-800"
                  />
                  <input
                    type="text"
                    placeholder="Phone Code e.g. +265 888..."
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    className="w-full px-2.5 py-1.5 focus:bg-white bg-slate-100 border border-slate-200 rounded-lg outline-none text-slate-800"
                  />
                  <button type="submit" className="w-full text-[11px] bg-rose-500 hover:bg-rose-600 text-white font-semibold py-1.5 rounded-lg">
                    Confirm Registry & Assign
                  </button>
                </form>
              ) : (
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs outline-none focus:border-rose-500"
                >
                  <option value="">-- Generic Walk-in Customer --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.phone || 'No Phone'})</option>
                  ))}
                </select>
              )}
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Receipt Payment Mode</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['Cash', 'Mobile Money', 'Bank'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPaymentMethod(mode)}
                    className={`py-2 text-[11px] font-bold border rounded-xl text-center transition-all ${
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

            {/* Price Calculations */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-1.5 font-mono">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal amount:</span>
                <span>MWK {totalAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Vat Tax (0%):</span>
                <span>MWK 0.00</span>
              </div>
              <div className="flex justify-between text-slate-800 font-bold border-t pt-1.5 text-sm">
                <span>Grand Total:</span>
                <span className="text-rose-600">MWK {totalAmount.toFixed(2)}</span>
              </div>
            </div>

            {/* Bounded Errors / Success states */}
            {errorText && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-mono p-3 rounded-xl flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{errorText}</span>
              </div>
            )}

            {successText && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold p-3 rounded-xl flex items-center space-x-2">
                <Check className="w-4 h-4 shrink-0 text-emerald-600 stroke-[3]" />
                <span>{successText}</span>
              </div>
            )}

            {/* Checkout Action Button */}
            <button
              onClick={handleCheckout}
              disabled={cart.length === 0}
              className="w-full py-4 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 disabled:opacity-50 text-white font-bold rounded-2 text-sm shadow-xl shadow-rose-950/20 flex items-center justify-center space-x-2 transition-all cursor-pointer active:scale-98"
            >
              <CreditCard className="w-4 h-4 text-white" />
              <span>Validate & Record Sale</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
