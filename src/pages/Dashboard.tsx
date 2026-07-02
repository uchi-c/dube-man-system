import React, { useEffect, useState } from 'react';
import { 
  LineChart, Package, Printer, Monitor, Users, 
  CreditCard, Sparkles, TrendingUp, AlertCircle, RefreshCw 
} from 'lucide-react';
import { 
  fetchProducts, fetchSales, fetchPrintingOrders, 
  fetchRunningCafeSessions, fetchCustomers, fetchActivityLogs 
} from '../services/supabase';
import { Product, Sale, PrintingOrder, CafeSession, Customer, ActivityLog } from '../types';
import DashboardCard from '../components/DashboardCard';
import DataTable from '../components/DataTable';

import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, BarChart, Bar, Legend 
} from 'recharts';

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [printingOrders, setPrintingOrders] = useState<PrintingOrder[]>([]);
  const [runningSessions, setRunningSessions] = useState<CafeSession[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  const loadAllDashboardData = async () => {
    setLoading(true);
    try {
      const [prods, sls, prnt, sessions, custs, auditLogs] = await Promise.all([
        fetchProducts(),
        fetchSales(),
        fetchPrintingOrders(),
        fetchRunningCafeSessions(),
        fetchCustomers(),
        fetchActivityLogs()
      ]);

      setProducts(prods);
      setSales(sls);
      setPrintingOrders(prnt);
      setRunningSessions(sessions);
      setCustomers(custs);
      setLogs(auditLogs);
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllDashboardData();
  }, []);

  // Compute stats metrics
  const today = new Date().toISOString().substring(0, 10);
  
  const todaySales = React.useMemo(() => {
    return sales
      .filter(s => s.created_at.substring(0, 10) === today)
      .reduce((sum, s) => sum + s.total_amount, 0);
  }, [sales, today]);

  const totalProductsCount = products.length;

  const lowStockCount = React.useMemo(() => {
    return products.filter(p => p.quantity <= 5 && p.quantity > 0).length;
  }, [products]);

  const activeWorkstationsCount = runningSessions.length;

  const pendingPrintingCount = React.useMemo(() => {
    return printingOrders.filter(po => ['Pending', 'Designing', 'Printing'].includes(po.status)).length;
  }, [printingOrders]);

  const totalCustomersCount = customers.length;

  // chart data computations
  const salesTimeSeries = React.useMemo(() => {
    const dailyMap: Record<string, number> = {};
    
    // Last 7 days presets
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().substring(0, 10);
      dailyMap[key] = 0;
    }

    sales.forEach(s => {
      const dayKey = s.created_at.substring(0, 10);
      if (dayKey in dailyMap) {
        dailyMap[dayKey] += s.total_amount;
      }
    });

    return Object.entries(dailyMap).map(([date, total]) => ({
      date: new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
      amount: total
    }));
  }, [sales]);

  const categoryMixData = React.useMemo(() => {
    const mixMap: Record<string, number> = {
      printing: 0,
      stationery: 0,
      branding: 0,
      cafe: 0,
      digital: 0
    };

    products.forEach(p => {
      const category = p.category.toLowerCase();
      if (category in mixMap) {
        mixMap[category] += p.quantity;
      } else {
        mixMap[category] = p.quantity;
      }
    });

    return Object.entries(mixMap).map(([category, stock]) => ({
      name: category.charAt(0).toUpperCase() + category.slice(1),
      stockLevel: stock
    }));
  }, [products]);

  if (loading) {
    return (
      <div className="h-[450px] flex flex-col items-center justify-center text-center text-slate-400" id="dashboard-loading">
        <RefreshCw className="w-8 h-8 animate-spin text-rose-500 mb-2" />
        <span className="text-xs font-mono">Acquiring corporate performance indices...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="dashboard-page">
      {/* Welcome Banner header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gradient-to-r from-slate-900 to-slate-800 p-6 rounded-3xl border border-slate-750 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/5 rounded-full blur-3xl"></div>
        <div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight flex items-center">
            <span>Dube Man HQ Console</span>
            <Sparkles className="w-5 h-5 ml-2.5 text-amber-400 animate-pulse shrink-0" />
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-lg">
            Consolidated operational status metrics. Real-time synchronizations with the main PostgreSQL/Supabase server enabled safely.
          </p>
        </div>
        <button 
          onClick={loadAllDashboardData}
          className="mt-4 sm:mt-0 px-4 py-2 bg-slate-800 hover:bg-slate-755 border border-slate-700 text-white font-bold text-xs rounded-xl transition flex items-center cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-2" /> Refresh State
        </button>
      </div>

      {/* KPI Cards bento box */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <DashboardCard 
          id="kpi-sales"
          title="Today's POS Sales"
          value={`ZMW ${todaySales.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          subValue="Calculated from validated POS transactions"
          icon={CreditCard}
          colorScheme="rose"
        />
        <DashboardCard 
          id="kpi-products"
          title="Low Stock Warning indicators"
          value={`${lowStockCount} items`}
          subValue={`Out of ${totalProductsCount} total product titles`}
          icon={Package}
          colorScheme={lowStockCount > 0 ? "amber" : "slate"}
        />
        <DashboardCard 
          id="kpi-printing"
          title="Active Print & Branding"
          value={`${pendingPrintingCount} Orders`}
          subValue="Under development or printing phase"
          icon={Printer}
          colorScheme="blue"
        />
        <DashboardCard 
          id="kpi-cafe"
          title="Active Internet café sessions"
          value={`${activeWorkstationsCount} Terminals`}
          subValue="Realtime workstation clients logged"
          icon={Monitor}
          colorScheme="emerald"
        />
        <DashboardCard 
          id="kpi-customers"
          title="Registered Clients"
          value={`${totalCustomersCount} Accounts`}
          subValue="Corporate and individual registries"
          icon={Users}
          colorScheme="violet"
        />
        <DashboardCard 
          id="kpi-growth"
          title="Calculated Sales Volume"
          value={`${sales.length} Sales`}
          subValue="Historical receipt total logged"
          icon={TrendingUp}
          colorScheme="slate"
        />
      </div>

      {/* Charts & Graphs Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Sales Chart (7-cols) */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between min-h-[350px]">
          <div>
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-1">POS Sales Output (Last 7 Days)</h3>
            <p className="text-[10px] text-slate-450 font-mono">Aggregate revenue expressed in Zambian Kwacha (ZMW)</p>
          </div>
          
          <div className="h-[250px] mt-4 w-full text-[10px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesTimeSeries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip formatter={(value) => [`ZMW ${value}`, 'Revenue']} />
                <Area type="monotone" dataKey="amount" stroke="#f43f5e" strokeWidth={2.5} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category breakdown (5-cols) */}
        <div className="lg:col-span-5 bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between min-h-[350px]">
          <div>
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-1">Inventory Stock by Category</h3>
            <p className="text-[10px] text-slate-450 font-mono">Piece distribution mapping across active domains</p>
          </div>

          <div className="h-[250px] mt-4 w-full text-[10px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryMixData} margin={{ top: 10, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip formatter={(value) => [`${value} units`, 'Inventory Stock']} />
                <Bar dataKey="stockLevel" fill="#fbbf24" radius={[6, 6, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Critical Logs & Status block */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Low Stock Watch */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
          <div>
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-1">Restock Action Plan Ledger</h3>
            <p className="text-[10px] text-slate-450 font-mono">Products requiring restock. Critical limit: &le; 5 units.</p>
          </div>
          
          <div className="divide-y divide-slate-100 max-h-[220px] overflow-y-auto">
            {products.filter(p => p.quantity <= 5).length > 0 ? (
              products.filter(p => p.quantity <= 5).map(p => (
                <div key={p.id} className="py-2.5 flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-slate-700 block">{p.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">{p.category} &bull; Supplier: {p.supplier || 'N/A'}</span>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-0.5 rounded-full font-mono font-bold text-[10px] ${
                      p.quantity === 0 
                        ? 'bg-rose-100 text-rose-800' 
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {p.quantity === 0 ? 'SOLD OUT' : `${p.quantity} left`}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-slate-450 space-y-1">
                <AlertCircle className="w-5 h-5 text-emerald-500 mx-auto" />
                <p className="font-bold text-slate-700">Stock Levels Perfect</p>
                <p className="text-[10px] text-slate-400">All available products holding positive stock distributions.</p>
              </div>
            )}
          </div>
        </div>

        {/* Security / Activity Logs */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
          <div>
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-1">System Audit Logs</h3>
            <p className="text-[10px] text-slate-450 font-mono">Recent operations and RBAC triggers logged</p>
          </div>

          <div className="divide-y divide-slate-100 max-h-[220px] overflow-y-auto font-mono text-[10px]">
            {logs.slice(0, 10).map((log) => (
              <div key={log.id} className="py-2 text-slate-600 flex justify-between items-start space-x-2">
                <div className="text-left">
                  <span className="font-bold text-slate-800">{log.user_name}: </span>
                  <span className="text-slate-600">{log.action}</span>
                </div>
                <span className="text-slate-400 shrink-0 select-none">
                  {new Date(log.timestamp).toLocaleTimeString(undefined, {hour: '2-digit', minute:'2-digit'})}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
