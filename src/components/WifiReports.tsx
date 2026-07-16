import { useState } from 'react';
import { WifiSession, WifiUsageLog, WifiPackage } from '../types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line
} from 'recharts';
import {
  TrendingUp, Users, Clock, Flame, Calendar, FileSpreadsheet, Search, History,
  ArrowDownLeft, ArrowUpRight
} from 'lucide-react';
import { formatCurrency, CURRENCY } from '../utils/format';

interface WifiReportsProps {
  sessions: WifiSession[];
  usageLogs: WifiUsageLog[];
  packages: WifiPackage[];
}

function ChartTooltip({ active, payload, label, accent }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--panel-line-strong)', color: 'var(--text-hi)', borderRadius: 10, padding: '8px 12px', fontSize: 12, boxShadow: 'var(--shadow-card)' }}>
      <div style={{ color: 'var(--text-low)', marginBottom: 4, fontSize: 11 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="dm-nums" style={{ fontWeight: 700, color: accent || 'var(--blue-400)' }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
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
        <div className="dm-card p-4 flex items-center gap-3">
          <div className="flex items-center justify-center flex-shrink-0" style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--blue-bg)', color: 'var(--blue-400)' }}>
            <TrendingUp style={{ width: 18, height: 18 }} />
          </div>
          <div>
            <span className="dm-label" style={{ padding: 0, display: 'block' }}>Total Revenue</span>
            <strong className="dm-nums" style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-hi)' }}>{formatCurrency(totalRevenue)}</strong>
          </div>
        </div>

        {/* Stat 2 */}
        <div className="dm-card p-4 flex items-center gap-3">
          <div className="flex items-center justify-center flex-shrink-0" style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--cyan-bg)', color: 'var(--cyan-300)' }}>
            <Users style={{ width: 18, height: 18 }} />
          </div>
          <div>
            <span className="dm-label" style={{ padding: 0, display: 'block' }}>WiFi Customers</span>
            <strong className="dm-nums" style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-hi)' }}>{uniqueUsersCount} Unique</strong>
          </div>
        </div>

        {/* Stat 3 */}
        <div className="dm-card p-4 flex items-center gap-3">
          <div className="flex items-center justify-center flex-shrink-0" style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--warning-bg)', color: 'var(--warning)' }}>
            <Clock style={{ width: 18, height: 18 }} />
          </div>
          <div>
            <span className="dm-label" style={{ padding: 0, display: 'block' }}>Avg Duration</span>
            <strong className="dm-nums" style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-hi)' }}>{avgSessionDuration} Mins</strong>
          </div>
        </div>

        {/* Stat 4 */}
        <div className="dm-card p-4 flex items-center gap-3">
          <div className="flex items-center justify-center flex-shrink-0" style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--success-bg)', color: 'var(--success)' }}>
            <Flame style={{ width: 18, height: 18 }} />
          </div>
          <div className="dm-truncate">
            <span className="dm-label" style={{ padding: 0, display: 'block' }}>Top Package</span>
            <strong className="dm-truncate" style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-hi)', display: 'block' }}>{popularPackageName}</strong>
          </div>
        </div>
      </div>

      {/* Visual Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1 */}
        <div className="dm-card p-5 space-y-4">
          <div>
            <h3 className="dm-h3 flex items-center">
              <Calendar style={{ width: 15, height: 15, marginRight: 6, color: 'var(--blue-400)' }} />
              <span>WiFi Revenue Streams (Last 7 Days)</span>
            </h3>
            <p style={{ color: 'var(--text-low)', fontSize: '0.6875rem', marginTop: 3 }}>Aggregated payments generated through voucher configurations.</p>
          </div>

          <div style={{ height: 220 }}>
            {revenueChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8A93BE' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#8A93BE' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip accent="var(--blue-400)" />} />
                  <Line type="monotone" dataKey="revenue" name={`Revenue (${CURRENCY})`} stroke="#4C6FFF" strokeWidth={3} dot={{ r: 4, fill: '#4C6FFF', strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0, fill: '#7DD3FC' }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-low)', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                No active income history compiled yet.
              </div>
            )}
          </div>
        </div>

        {/* Chart 2 */}
        <div className="dm-card p-5 space-y-4">
          <div>
            <h3 className="dm-h3 flex items-center">
              <FileSpreadsheet style={{ width: 15, height: 15, marginRight: 6, color: 'var(--blue-400)' }} />
              <span>Package Allocation Distribution</span>
            </h3>
            <p style={{ color: 'var(--text-low)', fontSize: '0.6875rem', marginTop: 3 }}>Comparison of active vouchers purchased across rates.</p>
          </div>

          <div style={{ height: 220 }}>
            {packagePopularityChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={packagePopularityChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#8A93BE' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#8A93BE' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip accent="var(--cyan-300)" />} />
                  <Bar dataKey="sessions" name="Sessions Issued" fill="#4C6FFF" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-low)', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                No packages configured yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Connection History & Security Logs */}
      <div className="dm-card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5" style={{ borderBottom: '1px solid var(--panel-line)' }}>
          <div>
            <h3 className="dm-h3 flex items-center">
              <History style={{ width: 15, height: 15, marginRight: 6, color: 'var(--blue-400)' }} />
              <span>Network Audit Log &amp; Activity Trails</span>
            </h3>
            <p style={{ color: 'var(--text-low)', fontSize: '0.6875rem', marginTop: 3 }}>Realtime authentication, connection, and timeout logs tracked from the gateway switches.</p>
          </div>

          {/* Filter buttons */}
          <div className="flex flex-wrap gap-1">
            {(['ALL', 'CONNECTED', 'DISCONNECTED', 'EXPIRED'] as const).map(type => (
              <button
                key={type}
                onClick={() => setLogFilter(type)}
                className={`dm-badge ${logFilter === type ? 'dm-badge-info' : 'dm-badge-neutral'}`}
                style={{ cursor: 'pointer', fontFamily: 'monospace' }}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Search filter input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ width: 14, height: 14, color: 'var(--text-low)' }} />
          <input
            type="text"
            placeholder="Search logs by client name, MAC address..."
            value={logSearch}
            onChange={(e) => setLogSearch(e.target.value)}
            className="dm-input"
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>

        {/* Logs Table */}
        <div className="dm-scroll-x dm-card-inset" style={{ padding: 0 }}>
          <table className="w-full dm-nums" style={{ fontSize: '0.75rem', color: 'var(--text-mid)' }}>
            <thead style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: 'var(--text-low)', borderBottom: '1px solid var(--panel-line)' }}>
              <tr>
                <th className="px-4 py-3 text-left" style={{ fontWeight: 700, letterSpacing: '0.04em' }}>Timestamp</th>
                <th className="px-4 py-3 text-left" style={{ fontWeight: 700, letterSpacing: '0.04em' }}>Client Name</th>
                <th className="px-4 py-3 text-left" style={{ fontWeight: 700, letterSpacing: '0.04em' }}>Device Model</th>
                <th className="px-4 py-3 text-left" style={{ fontWeight: 700, letterSpacing: '0.04em' }}>MAC Address</th>
                <th className="px-4 py-3 text-left" style={{ fontWeight: 700, letterSpacing: '0.04em' }}>Action Event</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length > 0 ? (
                filteredLogs.map(log => (
                  <tr key={log.id} className="dm-row" style={{ borderTop: '1px solid var(--panel-line)' }}>
                    <td className="px-4 py-3" style={{ fontFamily: 'monospace', fontSize: '0.625rem', color: 'var(--text-low)' }}>
                      {new Date(log.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-4 py-3" style={{ fontWeight: 700, color: 'var(--text-hi)' }}>
                      {log.wifi_customers?.name || 'Unknown Guest'}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-low)' }}>{log.device_name}</td>
                    <td className="px-4 py-3" style={{ fontFamily: 'monospace', fontSize: '0.625rem', letterSpacing: '0.03em', color: 'var(--text-low)', textTransform: 'uppercase' }}>
                      {log.mac_address}
                    </td>
                    <td className="px-4 py-3">
                      {log.action === 'CONNECTED' ? (
                        <span className="dm-badge dm-badge-success" style={{ fontFamily: 'monospace' }}>
                          <ArrowUpRight style={{ width: 10, height: 10 }} />
                          {log.action}
                        </span>
                      ) : log.action === 'EXPIRED' ? (
                        <span className="dm-badge dm-badge-warning" style={{ fontFamily: 'monospace' }}>
                          <Clock style={{ width: 10, height: 10 }} />
                          {log.action}
                        </span>
                      ) : (
                        <span className="dm-badge dm-badge-neutral" style={{ fontFamily: 'monospace' }}>
                          <ArrowDownLeft style={{ width: 10, height: 10 }} />
                          {log.action}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center" style={{ color: 'var(--text-low)', fontFamily: 'monospace' }}>
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
