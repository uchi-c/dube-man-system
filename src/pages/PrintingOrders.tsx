import React, { useState, useEffect, useMemo } from 'react';
import { PrintingOrder, PrintingStatus, Customer } from '../types';
import { 
  fetchPrintingOrders, insertPrintingOrder, 
  advancePrintingOrderStatus, addPrintingOrderPayment, fetchCustomers
} from '../services/supabase';
import {
  Printer, ArrowRight, CheckCircle2,
  Coins, Search, Plus, RefreshCw
} from 'lucide-react';
import { motion } from 'motion/react';
import { formatCurrency } from '../utils/format';

interface PrintingOrdersProps {
  userRole: string;
}

export default function PrintingOrders({ userRole }: PrintingOrdersProps) {
  const [orders, setOrders] = useState<PrintingOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  
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

  const pullOrdersFromDb = async () => {
    setLoading(true);
    try {
      const [ordData, custData] = await Promise.all([
        fetchPrintingOrders(),
        fetchCustomers()
      ]);
      setOrders(ordData);
      setCustomers(custData);
    } catch (err) {
      console.error('Error syncing printing workstation database:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    pullOrdersFromDb();
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchSearch = o.description.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          o.customer_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = statusFilter === 'All' || o.status.toLowerCase() === statusFilter.toLowerCase();
      return matchSearch && matchStatus;
    });
  }, [orders, searchQuery, statusFilter]);

  // Handle advancing orders status
  const handleAdvanceStatus = async (order: PrintingOrder) => {
    const nextStatus = nextStatusMap[order.status];
    if (!nextStatus) return;

    setLoading(true);
    const success = await advancePrintingOrderStatus(order.id, nextStatus);
    if (success) {
      await pullOrdersFromDb();
    } else {
      setLoading(false);
    }
  };

  // Handle recorded payments
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentOrder) return;
    if (paidIncrement <= 0) return;

    setLoading(true);
    const success = await addPrintingOrderPayment(paymentOrder.id, paidIncrement);
    if (success) {
      await pullOrdersFromDb();
      setIsPaying(false);
      setPaymentOrder(null);
    } else {
      setLoading(false);
    }
  };

  // Submit order registrations
  const handleCreateOrderSubmit = async (e: React.FormEvent) => {
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

    setLoading(true);
    const result = await insertPrintingOrder(
      selectedCustomerId, 
      orderDesc, 
      orderQty, 
      orderAmount, 
      orderDeposit
    );

    if (result) {
      await pullOrdersFromDb();
      setIsCreating(false);
      
      // Clear forms
      setSelectedCustomerId('');
      setOrderDesc('');
      setOrderQty(1);
      setOrderAmount(150);
      setOrderDeposit(50);
    } else {
      setValidationError('Failed to record print order in remote PostgreSQL.');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6" id="printing-tab">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-left">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Printing & Embroidery Desk</h1>
          <p className="text-sm text-slate-500 mt-1">Regulate and dispatch custom designs, polo shirt embroidery, and binding jobs.</p>
        </div>
        
        <div className="flex items-center space-x-2 shrink-0">
          <button 
            onClick={pullOrdersFromDb}
            className="p-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-2xl flex items-center justify-center cursor-pointer transition-all shrink-0"
            title="Reload tickets"
          >
            <RefreshCw className={`w-4 h-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {canEdit && (
            <button
              onClick={() => setIsCreating(true)}
              className="px-5 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl flex items-center space-x-2 text-sm font-semibold shadow-xl shadow-rose-950/20 cursor-pointer transition"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Create Print Ticket</span>
            </button>
          )}
        </div>
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
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
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
      {loading ? (
        <div className="h-[250px] flex flex-col items-center justify-center text-center text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin text-rose-500 mb-2" />
          <span className="text-xs font-mono">Synchronizing workspace work orders...</span>
        </div>
      ) : filteredOrders.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 uruu-animate-in">
          {filteredOrders.map(order => {
            const balance = order.amount - order.amount_paid;
            const nextStatus = nextStatusMap[order.status];
            
            return (
              <motion.div
                key={order.id}
                whileHover={{ y: -2 }}
                className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs flex flex-col justify-between text-left"
              >
                {/* ID & Status badge */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase bg-slate-50 px-2 py-0.5 border rounded">
                      Work ID: {order.id.slice(0, 13)}...
                    </span>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-tight uppercase ${
                      order.status === 'Pending' ? 'bg-amber-100 text-amber-800' :
                      order.status === 'Designing' ? 'bg-purple-100 text-purple-800 animate-pulse' :
                      order.status === 'Printing' ? 'bg-rose-100 text-rose-800' :
                      order.status === 'Completed' ? 'bg-emerald-100/80 text-emerald-800 font-extrabold border border-emerald-200' :
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
                    {order.customer_phone && <div className="text-[10px] text-slate-400 mt-1">Callback phone: {order.customer_phone}</div>}
                  </div>
                </div>

                {/* Account & Milestone advance Buttons */}
                <div className="pt-4 border-t border-slate-100 mt-4">
                  {/* Financial trackers */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3 font-mono tabular-nums">
                    <div className="bg-slate-50 p-2 rounded-xl text-slate-600 border border-slate-100">
                      <span className="text-[9px] text-slate-500 block uppercase font-sans">Quota bill</span>
                      <strong>{formatCurrency(order.amount)}</strong>
                    </div>
                    <div className="bg-emerald-50/50 p-2 rounded-xl text-emerald-800 border border-emerald-100">
                      <span className="text-[9px] text-emerald-500 block uppercase font-sans">Deposited</span>
                      <strong className="text-emerald-700">{formatCurrency(order.amount_paid)}</strong>
                    </div>
                    <div className={`p-2 rounded-xl border ${balance > 0 ? 'bg-rose-50 text-rose-800 border-rose-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                      <span className="text-[9px] text-slate-500 block uppercase font-sans">Deficit</span>
                      <strong className={balance > 0 ? 'text-rose-600' : 'text-slate-500'}>
                        {balance > 0 ? formatCurrency(balance) : 'Clear'}
                      </strong>
                    </div>
                  </div>

                  {/* Advance triggers */}
                  {canEdit && (
                    <div className="flex items-center justify-between gap-2.5 text-xs font-semibold">
                      {/* Record payment trigger */}
                      {balance > 0 ? (
                        <button
                          onClick={() => {
                            setPaymentOrder(order);
                            setPaidIncrement(balance);
                            setIsPaying(true);
                          }}
                          className="px-3 py-2 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl text-[11px] font-semibold flex items-center space-x-1 cursor-pointer"
                        >
                          <Coins className="w-3.5 h-3.5 mr-0.5 text-slate-400" />
                          <span>Collect Deficit</span>
                        </button>
                      ) : (
                        <div className="text-emerald-600 text-[10px] font-bold flex items-center bg-emerald-50 px-2.5 py-1.5 rounded-xl border border-emerald-100 inline">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1 shrink-0" /> Paid in Full
                        </div>
                      )}

                      {/* Transition button */}
                      {nextStatus ? (
                        <button
                          onClick={() => handleAdvanceStatus(order)}
                          className="px-4 py-2 bg-rose-500 hover:bg-rose-600 hover:shadow-sm text-white rounded-xl text-[11px] font-bold flex items-center space-x-1 cursor-pointer transition"
                        >
                          <span>Move to {nextStatus}</span>
                          <ArrowRight className="w-3.5 h-3.5 ml-0.5 stroke-[3]" />
                        </button>
                      ) : (
                        <div className="text-slate-400 text-[10px] font-bold bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200/60 uppercase">
                          Collected & Done
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 uruu-animate-in">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border rounded-3xl max-w-lg w-full p-6 shadow-2xl relative text-left"
          >
            <div className="mb-4">
              <h3 className="text-lg font-bold text-slate-800">Create Print / Embroidery Ticket</h3>
              <p className="text-slate-400 text-xs mt-0.5">Register branding designs, quantities, total billing, and track milestones.</p>
            </div>

            <form onSubmit={handleCreateOrderSubmit} className="space-y-4 text-xs font-sans">
              {/* Select Customer */}
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Customer profile</label>
                <select
                  required
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 focus:border-rose-500 rounded-xl text-slate-700 text-xs outline-none cursor-pointer"
                >
                  <option value="">-- Choose Customer profile --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.phone || 'No Phone'})</option>
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
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 focus:border-rose-500 rounded-xl text-slate-700 text-xs outline-none resize-none"
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
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Total rate</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={orderAmount}
                    onChange={(e) => setOrderAmount(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs outline-none font-mono"
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
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs outline-none font-mono"
                  />
                </div>
              </div>

              {validationError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 text-[11px] p-2.5 rounded-xl font-mono">
                  <span>{validationError}</span>
                </div>
              )}

              <div className="flex space-x-2 pt-3 border-t justify-end text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 hover:bg-slate-50 rounded-xl text-slate-500 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-white bg-rose-500 hover:bg-rose-600 rounded-xl shadow-md cursor-pointer transition"
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
            className="bg-white border rounded-3xl max-w-sm w-full p-6 shadow-2xl relative text-left"
          >
            <div className="mb-4">
              <h3 className="text-base font-bold text-slate-800">Collect Print balance Due</h3>
              <p className="text-slate-400 text-xs mt-0.5">Recording outstanding payments for order <strong>{paymentOrder.id.slice(0, 13)}...</strong></p>
            </div>

            <form onSubmit={handlePaymentSubmit} className="space-y-4 text-xs font-sans">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-1.5 text-slate-600 font-mono tabular-nums">
                <div className="flex justify-between">
                  <span>Total cost:</span>
                  <span>{formatCurrency(paymentOrder.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Already Paid:</span>
                  <span className="text-emerald-600">{formatCurrency(paymentOrder.amount_paid)}</span>
                </div>
                <div className="flex justify-between font-bold border-t pt-1.5 text-slate-800">
                  <span>Deficit:</span>
                  <span className="text-rose-600">{formatCurrency(paymentOrder.amount - paymentOrder.amount_paid)}</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-500">Paying Amount (ZMW)</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={paymentOrder.amount - paymentOrder.amount_paid}
                  value={paidIncrement}
                  onChange={(e) => setPaidIncrement(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-bold font-mono text-xs outline-none"
                />
              </div>

              <div className="flex space-x-2 pt-3 border-t justify-end text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setIsPaying(false);
                    setPaymentOrder(null);
                  }}
                  className="px-4 py-2 hover:bg-slate-50 rounded-xl text-slate-500 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-white bg-rose-500 hover:bg-rose-600 rounded-xl shadow-md cursor-pointer transition"
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
