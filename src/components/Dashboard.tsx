import React, { useMemo } from 'react';
import { 
  getProducts, getSales, getRunningSessions, 
  getPrintingOrders, getComputers, getPastSessions 
} from '../utils/db';
import { 
  TrendingUp, AlertTriangle, Monitor, 
  Printer, DollarSign, Award, ChevronRight, CheckCircle2 
} from 'lucide-react';
import { motion } from 'motion/react';

interface DashboardProps {
  onNavigate: (tab: string) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  // Query transactional states
  const products = getProducts();
  const sales = getSales();
  const runningSessions = getRunningSessions();
  const pastSessions = getPastSessions();
  const printingOrders = getPrintingOrders();
  const computers = getComputers();

  // 1. Dynamic Calculations for Revenues
  const { todayRevenue, monthlyRevenue } = useMemo(() => {
    let today = 0;
    let monthly = 0;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfThisMonth = new Date();
    startOfThisMonth.setDate(1);
    startOfThisMonth.setHours(0, 0, 0, 0);

    // Sales Revenue
    sales.forEach(sale => {
      const saleDate = new Date(sale.created_at);
      if (saleDate >= startOfToday) {
        today += sale.total_amount;
      }
      if (saleDate >= startOfThisMonth) {
        monthly += sale.total_amount;
      }
    });

    // Completed Cafe Sessions revenue
    pastSessions.forEach(sess => {
      if (sess.amount && sess.end_time) {
        const endDate = new Date(sess.end_time);
        if (endDate >= startOfToday) {
          today += sess.amount;
        }
        if (endDate >= startOfThisMonth) {
          monthly += sess.amount;
        }
      }
    });

    // Printing Order Payments (deposits or full payments made during this period)
    printingOrders.forEach(order => {
      const orderDate = new Date(order.created_at);
      if (orderDate >= startOfToday) {
        today += order.amount_paid;
      }
      if (orderDate >= startOfThisMonth) {
        monthly += order.amount_paid;
      }
    });

    return { todayRevenue: today, monthlyRevenue: monthly };
  }, [sales, pastSessions, printingOrders]);

  // 2. Best Selling Products calculation
  const bestSellers = useMemo(() => {
    const productFrequency: { [key: string]: { name: string; count: number; category: string } } = {};
    
    sales.forEach(s => {
      s.items.forEach(item => {
        const prodId = item.product_id;
        if (!productFrequency[prodId]) {
          const matchedProduct = products.find(p => p.id === prodId);
          productFrequency[prodId] = {
            name: matchedProduct ? matchedProduct.name : (item.product_name || 'Product'),
            count: 0,
            category: matchedProduct ? matchedProduct.category : 'General'
          };
        }
        productFrequency[prodId].count += item.quantity;
      });
    });

    return Object.values(productFrequency)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }, [sales, products]);

  // 3. Low stock items (threshold check)
  const lowStockItems = useMemo(() => {
    return products.filter(p => {
      const threshold = p.min_stock_level !== undefined ? p.min_stock_level : 10;
      if (threshold === -1) return false; // Infinite/Ignored items
      return p.quantity <= threshold;
    });
  }, [products]);

  // 4. Printing orders breakdown
  const printingBreakdown = useMemo(() => {
    const counts = {
      Pending: 0,
      Designing: 0,
      Printing: 0,
      Completed: 0,
      Collected: 0
    };
    printingOrders.forEach(o => {
      if (counts[o.status] !== undefined) {
        counts[o.status]++;
      }
    });
    return counts;
  }, [printingOrders]);

  // 5. Active Cafe Sessions count
  const occupiedComputersTotal = computers.filter(c => c.status === 'Occupied').length;

  return (
    <div className="space-y-6" id="dashboard-tab">
      {/* Welcome header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Business Overview</h1>
          <p className="text-sm text-slate-500 mt-1">Real-time health indicator metrics for Dube Man General Dealers terminal.</p>
        </div>
        <div className="text-slate-400 text-xs font-mono bg-slate-100 border border-slate-200 px-3.5 py-1.5 rounded-xl">
          Audit Period: Year 2026
        </div>
      </div>

      {/* Primary stats widget grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Revenue */}
        <motion.div 
          whileHover={{ y: -3 }}
          className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm flex items-center space-x-4 h-[110px]"
        >
          <div className="p-3.5 bg-rose-50 rounded-2xl text-rose-500">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Today's Revenue</div>
            <div className="text-xl font-bold text-slate-800 mt-1">MWK {todayRevenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">&bull; Live transactions sync</div>
          </div>
        </motion.div>

        {/* Monthly Revenue */}
        <motion.div 
          whileHover={{ y: -3 }}
          className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm flex items-center space-x-4 h-[110px]"
        >
          <div className="p-3.5 bg-amber-50 rounded-2xl text-amber-500">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Monthly Total</div>
            <div className="text-xl font-bold text-slate-800 mt-1">MWK {monthlyRevenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">Month: June 2026</div>
          </div>
        </motion.div>

        {/* Active cafe sessions */}
        <motion.div 
          whileHover={{ y: -3 }}
          onClick={() => onNavigate('cafe')}
          className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm flex items-center space-x-4 h-[110px] cursor-pointer hover:border-slate-300 transition-all"
        >
          <div className="p-3.5 bg-emerald-50 rounded-2xl text-emerald-500">
            <Monitor className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider flex justify-between items-center w-full">
              <span>Café Terminals</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="text-xl font-bold text-slate-800 mt-1">
              {occupiedComputersTotal} / {computers.length} Active
            </div>
            <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
              {computers.filter(c => c.status === 'Available').length} PCs available
            </div>
          </div>
        </motion.div>

        {/* Pending printing jobs */}
        <motion.div 
          whileHover={{ y: -3 }}
          onClick={() => onNavigate('printing')}
          className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm flex items-center space-x-4 h-[110px] cursor-pointer hover:border-slate-300 transition-all"
        >
          <div className="p-3.5 bg-blue-50 rounded-2xl text-blue-500">
            <Printer className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider flex justify-between items-center w-full">
              <span>Embroidery & Print</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="text-xl font-bold text-slate-800 mt-1">
              {printingOrders.filter(o => o.status !== 'Collected').length} Active
            </div>
            <div className="text-[10px] text-amber-600 font-semibold mt-0.5">
              {printingOrders.filter(o => o.status === 'Pending').length} pending preview
            </div>
          </div>
        </motion.div>
      </div>

      {/* Critical warning banners / Low stock warnings */}
      {lowStockItems.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start space-x-3 text-amber-800"
          id="stock-alerts-pane"
        >
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold text-sm block">Low Stock Warning Indicators Detected ({lowStockItems.length})</span>
            <p className="text-xs text-amber-700 mt-1">
              The following merchandise profiles have reached or dropped below specified alert levels. Replenish immediately to ensure smooth operations:
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {lowStockItems.map(item => (
                <span key={item.id} className="inline-flex items-center space-x-1.5 bg-white border border-amber-200 text-amber-900 text-xs px-2.5 py-1 rounded-lg font-medium shadow-sm">
                  <span>{item.name}</span>
                  <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 rounded-full font-bold">{item.quantity} left</span>
                </span>
              ))}
            </div>
          </div>
          <button 
            onClick={() => onNavigate('inventory')}
            className="text-xs font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-xl border border-amber-300 tracking-wide select-none shrink-0"
          >
            Refill Stock
          </button>
        </motion.div>
      )}

      {/* Sub-grids: Best Products & Printing Orders pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Best Selling Products */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-800 flex items-center space-x-2">
              <Award className="w-4 h-4 text-rose-500" />
              <span>Highest Velocity Products</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">These sales categories are performing with high transaction rates.</p>

            <div className="mt-5 space-y-3">
              {bestSellers.length > 0 ? (
                bestSellers.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                    <div className="flex items-center space-x-3.5">
                      <div className="w-7 h-7 bg-rose-100 text-rose-600 text-xs font-bold rounded-lg flex items-center justify-center">
                        #{idx + 1}
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-slate-700">{item.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{item.category}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-800">{item.count} items sold</div>
                      <div className="text-[9px] text-emerald-600 font-semibold">Fast Moving</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-slate-400 text-xs">
                  No sales recorded in current session. Open the POS terminal to log sales!
                </div>
              )}
            </div>
          </div>

          <button 
            onClick={() => onNavigate('pos')}
            className="mt-6 w-full py-3 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-2xl text-slate-600 border-dashed text-xs font-semibold flex items-center justify-center space-x-2 transition-all transition-duration"
          >
            <span>Open POS Terminal to Log Transacts</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Printing Orders Status pipeline */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-800 flex items-center space-x-2">
              <Printer className="w-4 h-4 text-blue-500" />
              <span>Printing Orders Workflow pipeline</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">Milestone status tracking for custom brand templates and embroidery.</p>

            {/* Pipeline progress bar */}
            <div className="grid grid-cols-5 gap-2 mt-6">
              {[
                { name: 'Pending', count: printingBreakdown.Pending, color: 'text-amber-600', bg: 'bg-amber-50' },
                { name: 'Designing', count: printingBreakdown.Designing, color: 'text-purple-600', bg: 'bg-purple-50' },
                { name: 'Printing', count: printingBreakdown.Printing, color: 'text-blue-600', bg: 'bg-blue-50' },
                { name: 'Ready', count: printingBreakdown.Completed, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { name: 'Collected', count: printingBreakdown.Collected, color: 'text-slate-500', bg: 'bg-slate-100' }
              ].map(step => (
                <div key={step.name} className={`${step.bg} rounded-2xl p-2.5 border border-black/5 text-center flex flex-col justify-center shadow-xs`}>
                  <div className={`text-sm font-extrabold ${step.color}`}>{step.count}</div>
                  <div className="text-[10px] text-slate-500 font-medium tracking-tight mt-1 truncate">{step.name}</div>
                </div>
              ))}
            </div>

            {/* Recent pending list */}
            <div className="mt-5 space-y-2">
              {printingOrders.filter(o => o.status !== 'Collected').slice(0, 2).map(order => {
                const balance = order.amount - order.amount_paid;
                return (
                  <div key={order.id} className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between text-xs">
                    <div className="truncate pr-3">
                      <span className="font-bold text-slate-700 block truncate">{order.description}</span>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">{order.customer_name} &bull; {order.quantity} units</span>
                    </div>
                    <div className="shrink-0 flex items-center space-x-2">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        order.status === 'Pending' ? 'bg-amber-100 text-amber-800' :
                        order.status === 'Designing' ? 'bg-purple-100 text-purple-800' :
                        order.status === 'Printing' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {order.status}
                      </span>
                      {balance > 0 ? (
                        <span className="text-[10px] text-rose-500 font-bold bg-rose-50 px-2 py-0.5 rounded-full">
                          Bal: MWK {balance}
                        </span>
                      ) : (
                        <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full flex items-center">
                          <CheckCircle2 className="w-3 h-3 mr-0.5" /> Paid
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <button 
            onClick={() => onNavigate('printing')}
            className="mt-6 w-full py-3 bg-blue-50/50 border border-blue-200 hover:bg-blue-50 rounded-2xl text-blue-600 text-xs font-semibold flex items-center justify-center space-x-2 transition-all transition-duration"
          >
            <span>Manage Printing Workflow Milestones</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
