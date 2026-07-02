import React, { useState } from 'react';
import { WifiCustomer, WifiUsageLog } from '../types';
import { Search, HardDrive, Cpu, ShieldAlert, Wifi, Activity, Clock, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';

interface ConnectedDevicesProps {
  customers: WifiCustomer[];
  usageLogs: WifiUsageLog[];
  onRefresh: () => void;
  loading: boolean;
}

export default function ConnectedDevices({ customers, usageLogs, onRefresh, loading }: ConnectedDevicesProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.mac_address.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.device_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getLatestAction = (customerId: string) => {
    const customerLogs = usageLogs.filter(l => l.customer_id === customerId);
    if (customerLogs.length === 0) return { action: 'DISCONNECTED', time: null };
    return {
      action: customerLogs[0].action,
      time: customerLogs[0].created_at
    };
  };

  const getBrandIcon = (deviceName: string) => {
    const name = deviceName.toLowerCase();
    if (name.includes('iphone') || name.includes('ipad') || name.includes('macbook') || name.includes('apple')) {
      return '🍏';
    }
    if (name.includes('samsung') || name.includes('galaxy')) {
      return '🌌';
    }
    if (name.includes('tecno') || name.includes('infinix') || name.includes('itel')) {
      return '📱';
    }
    return '💻';
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-slate-800 flex items-center">
            <Cpu className="w-4 h-4 mr-1.5 text-rose-500" />
            <span>Hardware Device Registry & MACs</span>
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">Physical device configurations connected to the network switches.</p>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="self-start sm:self-auto p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-xl transition flex items-center space-x-1 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-rose-500' : ''}`} />
          <span className="text-[10px] font-mono">Sync Router</span>
        </button>
      </div>

      <div className="relative pt-2">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none pt-2">
          <Search className="w-4 h-4 text-slate-400" />
        </div>
        <input
          type="text"
          placeholder="Filter by name, MAC address, device model..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-rose-500 focus:bg-white transition-all"
        />
      </div>

      <div className="divide-y divide-slate-100 max-h-[350px] overflow-y-auto pr-1">
        {loading ? (
          <div className="py-12 text-center text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin text-rose-500 mx-auto mb-2" />
            <span className="text-xs font-mono">Syncing switches...</span>
          </div>
        ) : filteredCustomers.length > 0 ? (
          filteredCustomers.map(cust => {
            const latest = getLatestAction(cust.id);
            const status = latest.action;

            return (
              <div key={cust.id} className="py-3.5 flex justify-between items-center text-xs">
                <div className="flex items-center space-x-3 pr-2 truncate">
                  <div className="w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                    <span className="text-sm">{getBrandIcon(cust.device_name)}</span>
                  </div>
                  <div className="truncate">
                    <strong className="text-slate-700 block truncate">{cust.name}</strong>
                    <div className="flex items-center space-x-1.5 mt-0.5">
                      <span className="text-[10px] text-slate-400">{cust.device_name}</span>
                      <span className="text-slate-300">&bull;</span>
                      <code className="text-[9px] font-mono text-slate-500 bg-slate-100 px-1 py-0.2 rounded uppercase">{cust.mac_address}</code>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  {status === 'CONNECTED' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase tracking-wider">
                      <span className="w-1 h-1 rounded-full bg-emerald-400 mr-1 animate-ping" />
                      CONNECTED
                    </span>
                  ) : status === 'EXPIRED' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-50 text-amber-600 border border-amber-100 uppercase tracking-wider">
                      EXPIRED
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-slate-100 text-slate-450 border border-slate-200 uppercase tracking-wider">
                      DISCONNECTED
                    </span>
                  )}
                  {latest.time && (
                    <span className="text-[9px] text-slate-400 font-mono block mt-1">
                      {new Date(latest.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-12 text-center text-slate-400">
            <Cpu className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs">No registered devices found matching "{searchTerm}"</p>
          </div>
        )}
      </div>

      {/* Isolation notice for security */}
      <div className="bg-slate-50 p-4 border rounded-2xl space-y-1.5 border-dashed">
        <span className="font-extrabold text-[9px] text-slate-500 uppercase tracking-wider flex items-center">
          <Wifi className="w-3.5 h-3.5 mr-1 text-slate-500" /> MAC Isolator Enabled
        </span>
        <p className="text-[10px] text-slate-400 leading-snug">
          Switches isolate active MAC leases. Terminated vouchers trigger firewall queues at the gateway layer automatically.
        </p>
      </div>
    </div>
  );
}
