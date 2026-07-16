import React, { useState } from 'react';
import {
  LayoutDashboard, PrinterIcon, History,
  BarChart2, Package, Settings2, ChevronRight
} from 'lucide-react';
import PrintDashboard from '../components/PrintDashboard';
import PrinterManagement from '../components/PrinterManagement';
import PrintHistory from '../components/PrintHistory';
import PrintReports from '../components/PrintReports';
import PrintInventory from '../components/PrintInventory';
import PrintSettings from '../components/PrintSettings';

type PrintTab = 'dashboard' | 'printers' | 'history' | 'reports' | 'inventory' | 'settings';

const TABS: { id: PrintTab; label: string; icon: React.ElementType; badge?: string }[] = [
  { id: 'dashboard',  label: 'Dashboard',   icon: LayoutDashboard },
  { id: 'printers',   label: 'Printers',    icon: PrinterIcon },
  { id: 'history',    label: 'Job History', icon: History },
  { id: 'reports',    label: 'Reports',     icon: BarChart2 },
  { id: 'inventory',  label: 'Paper Stock', icon: Package },
  { id: 'settings',   label: 'Settings',    icon: Settings2 },
];

export default function PrintManager() {
  const [activeTab, setActiveTab] = useState<PrintTab>('dashboard');

  return (
    <div className="space-y-5" id="print-manager">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2 mb-1" style={{ fontSize: '0.75rem', color: 'var(--text-low)', fontFamily: 'monospace' }}>
            <span>Uruu OS</span>
            <ChevronRight style={{ width: 12, height: 12 }} />
            <span style={{ fontWeight: 600, color: 'var(--text-mid)' }}>Print Manager</span>
          </div>
          <h1 className="dm-h1">
            Print Manager
          </h1>
          <p style={{ color: 'var(--text-mid)', fontSize: '0.8125rem', marginTop: 2 }}>
            Monitor printers, jobs, revenue, paper stock, and settings.
          </p>
        </div>
        <div className="dm-badge dm-badge-success self-start sm:self-auto" style={{ fontFamily: 'monospace' }}>
          <span className="dm-dot dm-dot-success dm-dot-pulse" />
          <span>Live Sync Active</span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="dm-card flex flex-wrap gap-1" style={{ padding: '0.4rem' }}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={active ? 'dm-btn dm-btn-primary' : 'dm-btn dm-btn-ghost'}
              style={{ minHeight: 38, padding: '0 1rem', fontSize: '0.75rem', border: active ? 'none' : '1px solid transparent', background: active ? undefined : 'transparent', boxShadow: 'none' }}
            >
              <Icon style={{ width: 14, height: 14 }} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="dm-badge dm-badge-danger" style={{ padding: '0.1rem 0.4rem', fontSize: '0.5625rem' }}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'dashboard'  && <PrintDashboard />}
        {activeTab === 'printers'   && <PrinterManagement />}
        {activeTab === 'history'    && <PrintHistory />}
        {activeTab === 'reports'    && <PrintReports />}
        {activeTab === 'inventory'  && <PrintInventory />}
        {activeTab === 'settings'   && <PrintSettings />}
      </div>
    </div>
  );
}
