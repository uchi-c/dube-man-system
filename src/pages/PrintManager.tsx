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
          <div className="flex items-center space-x-2 text-xs text-slate-400 font-mono mb-1">
            <span>Dube Man</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-slate-600 font-semibold">Print Manager</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            Print Manager
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Monitor printers, jobs, revenue, paper stock, and settings.
          </p>
        </div>
        <div className="flex items-center space-x-2 text-[10px] font-mono bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-full self-start sm:self-auto">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
          <span>Live Sync Active</span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-1.5 flex flex-wrap gap-1 shadow-sm">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                active
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${active ? 'text-white' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="bg-rose-500 text-white text-[9px] px-1.5 rounded-full font-bold">
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
