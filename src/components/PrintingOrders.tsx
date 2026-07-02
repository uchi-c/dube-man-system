import React, { useState, useMemo } from 'react';
import { PrintingOrder, PrintingStatus, Customer } from '../types';
import { 
  getPrintingOrders, updatePrintingOrderStatus, 
  updatePrintingOrderPayment, getCustomers, addPrintingOrder 
} from '../utils/db';
import { 
  Printer, ArrowRight, CheckCircle2, ChevronRight, 
  Clock, Coins, FileText, Search, CreditCard, UserPlus, Sparkles, Filter, Plus 
} from 'lucide-react';
import { motion } from 'motion/react';

interface PrintingOrdersProps {
  userRole: string;
}

export default function PrintingOrders({ userRole }: PrintingOrdersProps) {
  const [orders, setOrders] = useState<PrintingOrder[]>(getPrintingOrders());
  const [customers, setCustomers] = useState<Customer[]>(getCustomers());
  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // Order registration Form modals
  const [isCreating, setIsCreating] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [orderDesc, setOrderDesc] = useState('');
  const [orderQty, setOrderQty] = useState(1);
  const [orderAmount, setOrderAmount] = useState(150);
  const [orderDeposit, setOrderDeposit] = useState(50);
  const [validationError, setValidationError] = useState('');

  // Payment incremental Modal Form
  const [isPaying, setIsPaying] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<PrintingOrder | null>(null);
  const [paidIncrement, setPaidIncrement] = useState<number>(100);

  const canEdit = userRole === 'ADMIN' || userRole === 'STAFF';

  // Status transitions directory
  const nextStatusMap: { [key in PrintingStatus]: PrintingStatus | null } = {
    'Pending': 'Designing',
    'Designing': 'Printing',
    'Printing': 'Completed',
    'Completed': 'Collected',
    'Collected': null
  };

  const refreshOrders = () => {
    setOrders(getPrintingOrders());
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchSearch = o.description.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          o.customer_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = statusFilter === 'All' || o.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [orders, searchQuery, statusFilter]);

  // Handle advancing orders status
  const handleAdvanceStatus = (order: PrintingOrder) => {
    const nextStatus = nextStatusMap[order.status];
    if (!nextStatus) return;

    updatePrintingOrderStatus(order.id, nextStatus);
    refreshOrders();
  };

  // Handle recorded payments
  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentOrder) return;

    if (paidIncrement <= 0) return;

    updatePrintingOrderPayment(paymentOrder.id, paidIncrement);
    refreshOrders();
    setIsPaying(false);
    setPaymentOrder(null);
  };

  // Submit order registrations
  const handleCreateOrderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    if (!selectedCustomerId) {
      setValidationError('Please select a reference customer profile.');
      return;
    }
    if (!orderDesc.trim()) {
      setValidationError('Please type description parameters.');
      return;
    }
    if (orderQty <= 0 || orderAmount <= 0) {
      setValidationError('Amounts and quantities must exceed zero.');
      return;
    }
    if (orderDeposit > orderAmount) {
      setValidationError('Deposit paid cannot exceed total balance.');
      return;
    }

    addPrintingOrder(selectedCustomerId, orderDesc, orderQty, orderAmount, orderDeposit);
    refreshOrders();
    setIsCreating(false);

    // Clear forms
    setSelectedCustomerId('');
    setOrderDesc('');
    setOrderQty(1);
    setOrderAmount(150);
    setOrderDeposit(50);
  };

  return (
    <div className="space-y-6" id="printing-tab">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Printing & Embroidery Desk</h1>
          <p className="text-sm text-slate-500 mt-1">Regulate and dispatch custom designs, polo shirt embroidery, and binding jobs.</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setIsCreating(true)}
            className="px-5 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl flex items-center space-x-2 text-sm font-semibold shadow-xl shadow-rose-950/25 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Print/Embroidery Ticket</span>
          </button>
        )}
      </div>

      {/* Control Search & Filtering tabs */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full md:max-w-md">
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-rose-500 text-slate-700 rounded-2xl outline-none text-sm transition-all"
            placeholder="Search orders by customer or descriptions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        </div>

        {/* Filter statuses */}
        <div className="flex flex-wrap gap-1">
          {['All', 'Pending', 'Designing', 'Printing', 'Completed', 'Collected'].map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
                statusFilter === status
                  ? 'bg-rose-50 border-rose-500 text-rose-700 font-bold shadow-xs'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of print jobs */}
      {filteredOrders.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-fadeIn">
          {filteredOrders.map(order => {
            const balance = order.amount - order.amount_paid;
            const nextStatus = nextStatusMap[order.status];
            
            return (
              <motion.div
                key={order.id}
                whileHover={{ y: -2 }}
                className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs flex flex-col justify-between"
              >
                {/* ID & Status badge */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">
                      ID: {order.id}
                    </span>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-tight uppercase ${
                      order.status === 'Pending' ? 'bg-amber-100 text-amber-800' :
                      order.status === 'Designing' ? 'bg-purple-100 text-purple-800 animate-pulse' :
                      order.status === 'Printing' ? 'bg-blue-100 text-blue-800' :
                      order.status === 'Completed' ? 'bg-emerald-100/80 text-emerald-800 font-extrabold border border-emerald-250' :
                      'bg-slate-100 text-slate-500'
                    }`}>
                      {order.status}
                    </span>
                  </div>

                  {/* Core description */}
                  <h4 className="font-bold text-slate-800 text-sm leading-snug line-clamp-2">{order.description}</h4>
                  
                  {/* Customer details */}
                  <div className="mt-2 text-xs text-slate-500">
                    <div>Customer: <strong className="text-slate-700">{order.customer_name}</strong></div>
                    {order.customer_phone && <div className="text-[10px] text-slate-400 mt-1">Phone callback: {order.customer_phone}</div>}
                  </div>
                </div>

                {/* Account & Milestone advance Buttons */}
                <div className="pt-4 border-t border-slate-100 mt-4">
                  {/* Financial trackers */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3 font-mono">
                    <div className="bg-slate-50 p-2 rounded-xl text-slate-600 border border-slate-100">
                      <span className="text-[9px] text-slate-400 block uppercase">Total billing</span>
                      <strong>MWK {order.amount.toFixed(2)}</strong>
                    </div>
                    <div className="bg-emerald-50/50 p-2 rounded-xl text-emerald-850 border border-emerald-100">
                      <span className="text-[9px] text-emerald-400 block uppercase">Amount Paid</span>
                      <strong className="text-emerald-700">MWK {order.amount_paid.toFixed(2)}</strong>
                    </div>
                    <div className={`p-2 rounded-xl border ${balance > 0 ? 'bg-rose-50 text-rose-800 border-rose-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                      <span className="text-[9px] text-slate-400 block uppercase">Balance due</span>
                      <strong className={balance > 0 ? 'text-rose-600' : 'text-slate-500'}>
                        {balance > 0 ? `MWK ${balance.toFixed(2)}` : 'Fully Paid'}
                      </strong>
                    </div>
                  </div>

                  {/* Advance triggers */}
                  {canEdit && (
                    <div className="flex items-center justify-between gap-2.5">
                      {/* Record payment trigger */}
                      {balance > 0 ? (
                        <button
                          onClick={() => {
                            setPaymentOrder(order);
                            setPaidIncrement(balance);
                            setIsPaying(true);
                          }}
                          className="px-3 py-2 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl text-[11px] font-semibold flex items-center space-x-1"
                        >
                          <Coins className="w-3.5 h-3.5 mr-0.5 text-slate-400" />
                          <span>Collect Pay</span>
                        </button>
                      ) : (
                        <div className="text-emerald-600 text-[10px] font-bold flex items-center bg-emerald-50 px-2.5 py-1.5 rounded-xl border border-emerald-100">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> fully paid
                        </div>
                      )}

                      {/* Transition button */}
                      {nextStatus ? (
                        <button
                          onClick={() => handleAdvanceStatus(order)}
                          className="px-4 py-2 bg-rose-500 hover:bg-rose-600 hover:shadow-sm text-white rounded-xl text-[11px] font-bold flex items-center space-x-1"
                        >
                          <span>Move to {nextStatus}</span>
                          <ArrowRight className="w-3.5 h-3.5 ml-0.5 stroke-[3]" />
                        </button>
                      ) : (
                        <div className="text-slate-400 text-[10px] font-bold bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200/60 uppercase">
                          No further milestones
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center">
          <Printer className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-slate-600 text-sm font-bold mt-4">No printing jobs listed</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
            No printing, lamination, or embroidery jobs match your selection. Click 'Create Print Ticket' to initialize a workflow pipeline.
          </p>
        </div>
      )}

      {/* CREATE PRINT MODAL FORM */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border rounded-3xl max-w-lg w-full p-6 shadow-2xl relative"
          >
            <div className="mb-4">
              <h3 className="text-lg font-bold text-slate-800">Create Print / Embroidery Ticket</h3>
              <p className="text-slate-400 text-xs mt-0.5">Register branding designs, quantities, total billing, and track milestones.</p>
            </div>

            <form onSubmit={handleCreateOrderSubmit} className="space-y-4">
              {/* Select Customer */}
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Customer profile</label>
                <select
                  required
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-rose-500 rounded-xl text-slate-700 text-xs outline-none"
                >
                  <option value="">-- Choose Customer profile --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Branding parameters & Job description</label>
                <textarea
                  required
                  rows={2}
                  maxLength={150}
                  placeholder="e.g. 10x Yellow Embroidery Hoodies - Size Medium"
                  value={orderDesc}
                  onChange={(e) => setOrderDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-rose-500 rounded-xl text-slate-700 text-xs outline-none resize-none font-sans"
                />
              </div>

              {/* Grid quantity and billings */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Order Qty</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={orderQty}
                    onChange={(e) => setOrderQty(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-250 rounded-xl text-slate-700 text-xs outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Total charge</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={orderAmount}
                    onChange={(e) => setOrderAmount(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-250 rounded-xl text-slate-700 text-xs outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Deposit Paid</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={orderDeposit}
                    onChange={(e) => setOrderDeposit(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-250 rounded-xl text-slate-700 text-xs outline-none font-mono"
                  />
                </div>
              </div>

              {validationError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 text-[11px] p-2.5 rounded-xl font-mono">
                  <span>{validationError}</span>
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
                  Log Work Order
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* COLLECT PAYMODAL FORM */}
      {isPaying && paymentOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border rounded-3xl max-w-sm w-full p-6 shadow-2xl relative"
          >
            <div className="mb-4">
              <h3 className="text-base font-bold text-slate-800">Collect Print balance Due</h3>
              <p className="text-slate-400 text-xs mt-0.5">Recording outstanding payments for order <strong>{paymentOrder.id}</strong></p>
            </div>

            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-1 text-slate-600 font-mono">
                <div className="flex justify-between">
                  <span>Total cost:</span>
                  <span>MWK {paymentOrder.amount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Already Paid:</span>
                  <span className="text-emerald-600">MWK {paymentOrder.amount_paid}</span>
                </div>
                <div className="flex justify-between font-bold border-t pt-1 text-slate-800">
                  <span>Remaining:</span>
                  <span className="text-rose-500">MWK {paymentOrder.amount - paymentOrder.amount_paid}</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-500">Paying Amount (MWK)</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={paymentOrder.amount - paymentOrder.amount_paid}
                  value={paidIncrement}
                  onChange={(e) => setPaidIncrement(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-250 rounded-xl text-slate-750 font-bold font-mono text-sm outline-none"
                />
              </div>

              <div className="flex space-x-2 pt-3 border-t justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsPaying(false);
                    setPaymentOrder(null);
                  }}
                  className="px-4 py-2 text-xs text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-500 hover:bg-rose-600 rounded-xl shadow-md"
                >
                  Post Payment
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
