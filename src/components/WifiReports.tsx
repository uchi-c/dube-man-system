import React, { useState } from 'react';
import { WifiSession, WifiUsageLog, WifiPackage } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend
} from 'recharts';
import { 
  TrendingUp, Users, Clock, Flame, Calendar, FileSpreadsheet, Search, History,
  Activity, ArrowDownLeft, ArrowUpRight
} from 'lucide-react';

interface WifiReportsProps {
  sessions: WifiSession[];
  usageLogs: WifiUsageLog[];
  packages: WifiPackage[];
}

export default function WifiReports({ sessions, usageLogs, packages }: WifiReportsProps) {
  const [logSearch, setLogSearch] = useState('');
  const [logFilter, setLogFilter] = useState<'ALL' | 'CONNECTED' | 'DISCONNECTED' | 'EXPIRED'>('ALL');

  // --- STATS CALCULATION ---
  const totalRevenue = sessions
    .filter(s => s.status === 'ACTIVE' || s.status === 'COMPLETED' || s.status === 'EXPIRED')
    .reduce((sum, s) => sum + s.amount, 0);

  const uniqueUsersCount = new Set(sessions.map(s => s.customer_id)).size;

  const completedSessions = sessions.filter(s => s.status === 'COMPLETED' || s.status === 'EXPIRED');
  const avgSessionDuration = completedSessions.length > 0
    ? Math.round(completedSessions.reduce((sum, s) => sum + s.duration_minutes, 0) / completedSessions.length)
    : 0;

  // Calculate most used package
  const packageUsageCounts: Record<string, number> = {};
  sessions.forEach(s => {
    packageUsageCounts[s.package_id] = (packageUsageCounts[s.package_id] || 0) + 1;
  });

  let mostUsedPackageId = '';
  let maxCount = 0;
  Object.entries(packageUsageCounts).forEach(([pkgId, count]) => {
    if (count > maxCount) {
      maxCount = count;
      mostUsedPackageId = pkgId;
    }
  });

  const popularPackageName = packages.find(p => p.id === mostUsedPackageId)?.name || 'N/A';

  // --- CHART 1: DAILY REVENUE CHART ---
  // Group sessions by date
  const revenueByDate: Record<string, number> = {};
  sessions.forEach(s => {
    const dateStr = new Date(s.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' });
    revenueByDate[dateStr] = (revenueByDate[dateStr] || 0) + s.amount;
  });

  // Convert to chart data format
  const revenueChartData = Object.entries(revenueByDate).map(([date, revenue]) => ({
    date,
    revenue
  })).reverse().slice(-7); // Last 7 days

  // --- CHART 2: PACKAGE POPULARITY ---
  const packagePopularityChartData = packages.map(pkg => {
    const count = sessions.filter(s => s.package_id === pkg.id).length;
    return {
      name: pkg.name.split(' ')[0] + ' ' + pkg.name.split(' ')[1], // Shorten
      sessions: count,
      revenue: count * pkg.price
    };
  });

  // --- USAGE HISTORY LOGS FILTERING ---
  const filteredLogs = usageLogs.filter(log => {
    const custName = log.wifi_customers?.name?.toLowerCase() || '';
    const mac = log.mac_address.toLowerCase();
    const matchesSearch = custName.includes(logSearch.toLowerCase()) || mac.includes(logSearch.toLowerCase());
    const matchesFilter = logFilter === 'ALL' || log.action === logFilter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6 text-left" id="wifi-reports-container">
      {/* Overview stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Stat 1 */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center space-x-3 text-white shadow-sm">
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Total Revenue</span>
            <strong className="text-sm sm:text-base font-black tabular-nums">K {totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
          </div>
        </div>

        {/* Stat 2 */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center space-x-3 text-white shadow-sm">
          <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">WiFi Customers</span>
            <strong className="text-sm sm:text-base font-black tabular-nums">{uniqueUsersCount} Unique</strong>
          </div>
        </div>

        {/* Stat 3 */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center space-x-3 text-white shadow-sm">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Avg Duration</span>
            <strong className="text-sm sm:text-base font-black tabular-nums">{avgSessionDuration} Mins</strong>
          </div>
        </div>

        {/* Stat 4 */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center space-x-3 text-white shadow-sm">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400">
            <Flame className="w-5 h-5" />
          </div>
          <div className="truncate">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Top Package</span>
            <strong className="text-sm sm:text-base font-black truncate block">{popularPackageName}</strong>
          </div>
        </div>
      </div>

      {/* Visual Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1 */}
        <div className="bg-white border rounded-3xl p-5 shadow-sm space-y-4">
          <div>
            <h3 className="font-extrabold text-sm text-slate-800 flex items-center">
              <Calendar className="w-4 h-4 mr-1.5 text-rose-500" />
              <span>WiFi Revenue Streams (Last 7 Days)</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Aggregated payments generated through voucher configurations.</p>
          </div>

          <div className="h-[220px]">
            {revenueChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff' }}
                    labelStyle={{ fontWeight: 'bold', fontSize: '11px' }}
                    itemStyle={{ color: '#fb7185', fontSize: '11px' }}
                  />
                  <Line type="monotone" dataKey="revenue" name="Revenue (MWK)" stroke="#f43f5e" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs font-mono">
                No active income history compiled yet.
              </div>
            )}
          </div>
        </div>

        {/* Chart 2 */}
        <div className="bg-white border rounded-3xl p-5 shadow-sm space-y-4">
          <div>
            <h3 className="font-extrabold text-sm text-slate-800 flex items-center">
              <FileSpreadsheet className="w-4 h-4 mr-1.5 text-rose-500" />
              <span>Package Allocation Distribution</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Comparison of active vouchers purchased across rates.</p>
          </div>

          <div className="h-[220px]">
            {packagePopularityChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={packagePopularityChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff' }}
                    labelStyle={{ fontWeight: 'bold', fontSize: '11px' }}
                    itemStyle={{ color: '#67e8f9', fontSize: '11px' }}
                  />
                  <Bar dataKey="sessions" name="Sessions Issued" fill="#0f172a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs font-mono">
                No packages configured yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Connection History & Security Logs */}
      <div className="bg-white border rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3.5">
          <div>
            <h3 className="font-extrabold text-sm text-slate-800 flex items-center">
              <History className="w-4 h-4 mr-1.5 text-rose-500" />
              <span>Network Audit Log & Activity Trails</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Realtime authentication, connection, and timeout logs tracked from the gateway switches.</p>
          </div>

          {/* Filter buttons */}
          <div className="flex flex-wrap gap-1">
            {(['ALL', 'CONNECTED', 'DISCONNECTED', 'EXPIRED'] as const).map(type => (
              <button
                key={type}
                onClick={() => setLogFilter(type)}
                className={`px-2.5 py-1 text-[9px] font-mono font-bold tracking-wider rounded-lg transition-all cursor-pointer ${
                  logFilter === type 
                    ? 'bg-slate-900 text-white' 
                    : 'bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Search filter input */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Search logs by client name, MAC address..."
            value={logSearch}
            onChange={(e) => setLogSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-rose-500 focus:bg-white transition-all"
          />
        </div>

        {/* Logs Table */}
        <div className="overflow-x-auto border border-slate-100 rounded-2xl">
          <table className="w-full text-xs text-slate-600 tabular-nums">
            <thead className="bg-slate-50 text-[10px] font-mono text-slate-400 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 text-left font-black tracking-wider">Timestamp</th>
                <th className="px-4 py-3 text-left font-black tracking-wider">Client Name</th>
                <th className="px-4 py-3 text-left font-black tracking-wider">Device Model</th>
                <th className="px-4 py-3 text-left font-black tracking-wider">MAC Address</th>
                <th className="px-4 py-3 text-left font-black tracking-wider">Action Event</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredLogs.length > 0 ? (
                filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/40 transition">
                    <td className="px-4 py-3 font-mono text-[10px] text-slate-400">
                      {new Date(log.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-800">
                      {log.wifi_customers?.name || 'Unknown Guest'}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{log.device_name}</td>
                    <td className="px-4 py-3 font-mono text-[10px] tracking-wider text-slate-500 uppercase">
                      {log.mac_address}
                    </td>
                    <td className="px-4 py-3">
                      {log.action === 'CONNECTED' ? (
                        <span className="inline-flex items-center text-[9px] font-mono font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-0.5 rounded-md uppercase tracking-wider">
                          <ArrowUpRight className="w-2.5 h-2.5 mr-0.5 shrink-0" />
                          {log.action}
                        </span>
                      ) : log.action === 'EXPIRED' ? (
                        <span className="inline-flex items-center text-[9px] font-mono font-bold bg-amber-50 text-amber-600 border border-amber-100 px-2 py-0.5 rounded-md uppercase tracking-wider">
                          <Clock className="w-2.5 h-2.5 mr-0.5 shrink-0" />
                          {log.action}
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[9px] font-mono font-bold bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                          <ArrowDownLeft className="w-2.5 h-2.5 mr-0.5 shrink-0" />
                          {log.action}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 font-mono">
                    No matching gateway audit log actions compiled.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
