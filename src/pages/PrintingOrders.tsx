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

const STATUS_BADGE: Record<PrintingStatus, string> = {
  Pending: 'dm-badge-warning',
  Designing: 'dm-badge-info',
  Printing: 'dm-badge-info',
  Completed: 'dm-badge-success',
  Collected: 'dm-badge-neutral',
};

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
          <h1 className="dm-h1">Printing &amp; Embroidery Desk</h1>
          <p style={{ color: 'var(--text-mid)', fontSize: '0.8125rem', marginTop: 4 }}>Regulate and dispatch custom designs, polo shirt embroidery, and binding jobs.</p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={pullOrdersFromDb}
            className="dm-icon-btn"
            title="Reload tickets"
          >
            <RefreshCw className={loading ? 'dm-spin' : ''} style={{ width: 16, height: 16 }} />
          </button>

          {canEdit && (
            <button
              onClick={() => setIsCreating(true)}
              className="dm-btn dm-btn-primary"
            >
              <Plus style={{ width: 16, height: 16 }} />
              <span>Create Print Ticket</span>
            </button>
          )}
        </div>
      </div>

      {/* Control Search & Filtering tabs */}
      <div className="dm-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ width: 15, height: 15, color: 'var(--text-low)' }} />
          <input
            type="text"
            className="dm-input"
            style={{ paddingLeft: '2.5rem' }}
            placeholder="Search orders by customer or descriptions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Filter statuses */}
        <div className="flex flex-wrap gap-1.5">
          {['All', 'Pending', 'Designing', 'Printing', 'Completed', 'Collected'].map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`dm-badge ${statusFilter === status ? 'dm-badge-info' : 'dm-badge-neutral'}`}
              style={{ cursor: 'pointer' }}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of print jobs */}
      {loading ? (
        <div className="flex flex-col items-center justify-center text-center" style={{ height: 250 }}>
          <RefreshCw className="dm-spin" style={{ width: 28, height: 28, color: 'var(--blue-400)', marginBottom: 8 }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-low)', fontFamily: 'monospace' }}>Synchronizing workspace work orders...</span>
        </div>
      ) : filteredOrders.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 dm-animate-in">
          {filteredOrders.map(order => {
            const balance = order.amount - order.amount_paid;
            const nextStatus = nextStatusMap[order.status];

            return (
              <motion.div
                key={order.id}
                whileHover={{ y: -2 }}
                className="dm-card p-5 flex flex-col justify-between text-left"
              >
                {/* ID & Status badge */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="dm-card-inset" style={{ fontSize: '0.625rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-low)', textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: 6 }}>
                      Work ID: {order.id.slice(0, 13)}...
                    </span>
                    <span className={`dm-badge ${STATUS_BADGE[order.status]}`}>
                      {order.status}
                    </span>
                  </div>

                  {/* Core description */}
                  <h4 className="line-clamp-2" style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-hi)', lineHeight: 1.4 }}>{order.description}</h4>

                  {/* Customer details */}
                  <div className="mt-2" style={{ fontSize: '0.75rem', color: 'var(--text-mid)' }}>
                    <div>Customer: <strong style={{ color: 'var(--text-hi)' }}>{order.customer_name}</strong></div>
                    {order.customer_phone && <div style={{ fontSize: '0.625rem', color: 'var(--text-low)', marginTop: 4 }}>Callback phone: {order.customer_phone}</div>}
                  </div>
                </div>

                {/* Account & Milestone advance Buttons */}
                <div className="pt-4 mt-4" style={{ borderTop: '1px solid var(--panel-line)' }}>
                  {/* Financial trackers */}
                  <div className="grid grid-cols-3 gap-2 text-center dm-nums" style={{ fontSize: '0.75rem', marginBottom: 12 }}>
                    <div className="dm-card-inset" style={{ padding: '0.5rem' }}>
                      <span className="dm-label" style={{ padding: 0, display: 'block', fontSize: '0.5625rem' }}>Quota bill</span>
                      <strong style={{ color: 'var(--text-hi)' }}>{formatCurrency(order.amount)}</strong>
                    </div>
                    <div style={{ padding: '0.5rem', borderRadius: 12, background: 'var(--success-bg)', border: '1px solid rgba(61,220,151,0.25)' }}>
                      <span style={{ fontSize: '0.5625rem', color: 'var(--success)', display: 'block', textTransform: 'uppercase', opacity: 0.85 }}>Deposited</span>
                      <strong style={{ color: 'var(--success)' }}>{formatCurrency(order.amount_paid)}</strong>
                    </div>
                    <div style={{
                      padding: '0.5rem', borderRadius: 12,
                      background: balance > 0 ? 'var(--danger-bg)' : 'var(--panel-2)',
                      border: `1px solid ${balance > 0 ? 'rgba(255,107,107,0.25)' : 'var(--panel-line)'}`,
                    }}>
                      <span className="dm-label" style={{ padding: 0, display: 'block', fontSize: '0.5625rem' }}>Deficit</span>
                      <strong style={{ color: balance > 0 ? 'var(--danger)' : 'var(--text-low)' }}>
                        {balance > 0 ? formatCurrency(balance) : 'Clear'}
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
                          className="dm-btn dm-btn-ghost"
                          style={{ minHeight: 36, padding: '0 0.85rem', fontSize: '0.6875rem' }}
                        >
                          <Coins style={{ width: 13, height: 13 }} />
                          <span>Collect Deficit</span>
                        </button>
                      ) : (
                        <div className="dm-badge dm-badge-success">
                          <CheckCircle2 style={{ width: 13, height: 13 }} /> Paid in Full
                        </div>
                      )}

                      {/* Transition button */}
                      {nextStatus ? (
                        <button
                          onClick={() => handleAdvanceStatus(order)}
                          className="dm-btn dm-btn-primary"
                          style={{ minHeight: 36, padding: '0 0.85rem', fontSize: '0.6875rem' }}
                        >
                          <span>Move to {nextStatus}</span>
                          <ArrowRight style={{ width: 13, height: 13 }} strokeWidth={3} />
                        </button>
                      ) : (
                        <div className="dm-badge dm-badge-neutral">
                          Collected &amp; Done
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
        <div className="dm-card-inset text-center" style={{ padding: '3rem 1.5rem' }}>
          <Printer style={{ width: 48, height: 48, color: 'var(--text-low)', margin: '0 auto' }} />
          <h3 style={{ color: 'var(--text-mid)', fontSize: '0.875rem', fontWeight: 700, marginTop: 16 }}>No printing jobs listed</h3>
          <p style={{ color: 'var(--text-low)', fontSize: '0.75rem', maxWidth: 380, margin: '4px auto 0' }}>
            No printing, lamination, or embroidery jobs match your selection. Click 'Create Print Ticket' to initialize a workflow pipeline.
          </p>
        </div>
      )}

      {/* CREATE PRINT MODAL FORM */}
      {isCreating && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50 dm-animate-in" style={{ background: 'rgba(7,11,36,0.75)', backdropFilter: 'blur(4px)' }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="dm-card-glass max-w-lg w-full p-6 relative text-left"
          >
            <div className="mb-4">
              <h3 className="dm-h1" style={{ fontSize: '1.125rem' }}>Create Print / Embroidery Ticket</h3>
              <p style={{ color: 'var(--text-low)', fontSize: '0.75rem', marginTop: 4 }}>Register branding designs, quantities, total billing, and track milestones.</p>
            </div>

            <form onSubmit={handleCreateOrderSubmit} className="space-y-4">
              {/* Select Customer */}
              <div className="space-y-1">
                <label className="dm-label" style={{ padding: 0 }}>Customer profile</label>
                <select
                  required
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="dm-select"
                >
                  <option value="">-- Choose Customer profile --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.phone || 'No Phone'})</option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="dm-label" style={{ padding: 0 }}>Branding parameters &amp; Job description</label>
                <textarea
                  required
                  rows={2}
                  maxLength={150}
                  placeholder="e.g. 10x Yellow Embroidery Hoodies - Size Medium"
                  value={orderDesc}
                  onChange={(e) => setOrderDesc(e.target.value)}
                  className="dm-input"
                  style={{ resize: 'none', minHeight: 'unset' }}
                />
              </div>

              {/* Grid quantity and billings */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="dm-label" style={{ padding: 0 }}>Order Qty</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={orderQty}
                    onChange={(e) => setOrderQty(parseInt(e.target.value) || 0)}
                    className="dm-input"
                    style={{ fontFamily: 'monospace' }}
                  />
                </div>

                <div className="space-y-1">
                  <label className="dm-label" style={{ padding: 0 }}>Total rate</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={orderAmount}
                    onChange={(e) => setOrderAmount(parseFloat(e.target.value) || 0)}
                    className="dm-input"
                    style={{ fontFamily: 'monospace' }}
                  />
                </div>

                <div className="space-y-1">
                  <label className="dm-label" style={{ padding: 0 }}>Deposit Paid</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={orderDeposit}
                    onChange={(e) => setOrderDeposit(parseFloat(e.target.value) || 0)}
                    className="dm-input"
                    style={{ fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              {validationError && (
                <div className="dm-badge dm-badge-danger" style={{ width: '100%', padding: '0.6rem 0.75rem', fontSize: '0.6875rem', lineHeight: 1.5, whiteSpace: 'normal', textAlign: 'left', fontFamily: 'monospace' }}>
                  <span>{validationError}</span>
                </div>
              )}

              <div className="flex space-x-2 pt-3 justify-end" style={{ borderTop: '1px solid var(--panel-line)' }}>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="dm-btn dm-btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="dm-btn dm-btn-primary"
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
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(7,11,36,0.75)', backdropFilter: 'blur(4px)' }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="dm-card-glass max-w-sm w-full p-6 relative text-left"
          >
            <div className="mb-4">
              <h3 className="dm-h3" style={{ fontSize: '1rem' }}>Collect Print balance Due</h3>
              <p style={{ color: 'var(--text-low)', fontSize: '0.75rem', marginTop: 4 }}>Recording outstanding payments for order <strong style={{ color: 'var(--text-mid)' }}>{paymentOrder.id.slice(0, 13)}...</strong></p>
            </div>

            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              <div className="dm-card-inset dm-nums space-y-1.5" style={{ padding: '1rem', fontSize: '0.75rem', color: 'var(--text-mid)' }}>
                <div className="flex justify-between">
                  <span>Total cost:</span>
                  <span>{formatCurrency(paymentOrder.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Already Paid:</span>
                  <span style={{ color: 'var(--success)' }}>{formatCurrency(paymentOrder.amount_paid)}</span>
                </div>
                <div className="flex justify-between pt-1.5" style={{ fontWeight: 700, color: 'var(--text-hi)', borderTop: '1px solid var(--panel-line)' }}>
                  <span>Deficit:</span>
                  <span style={{ color: 'var(--danger)' }}>{formatCurrency(paymentOrder.amount - paymentOrder.amount_paid)}</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="dm-label" style={{ padding: 0 }}>Paying Amount (ZMW)</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={paymentOrder.amount - paymentOrder.amount_paid}
                  value={paidIncrement}
                  onChange={(e) => setPaidIncrement(parseFloat(e.target.value) || 0)}
                  className="dm-input"
                  style={{ fontWeight: 700, fontFamily: 'monospace' }}
                />
              </div>

              <div className="flex space-x-2 pt-3 justify-end" style={{ borderTop: '1px solid var(--panel-line)' }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsPaying(false);
                    setPaymentOrder(null);
                  }}
                  className="dm-btn dm-btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="dm-btn dm-btn-primary"
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
