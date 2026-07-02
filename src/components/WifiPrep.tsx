import React, { useState } from 'react';
import { WifiSessionRecord } from '../types';
import { getWifiRecords, addWifiRecord } from '../utils/db';
import { Wifi, PlusCircle, HelpCircle, HardDrive, KeyRound, Clock, ShieldCheck, Sparkles, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function WifiPrep() {
  const [records, setRecords] = useState<WifiSessionRecord[]>(getWifiRecords());
  const [clientName, setClientName] = useState('');
  const [clientDevice, setClientDevice] = useState('Android-Guest');
  const [durationMins, setDurationMins] = useState(60);
  const [allocatedMb, setAllocatedMb] = useState(500);

  const [activeTab, setActiveTab] = useState<'sessions' | 'rules'>('sessions');
  const [voucherCode, setVoucherCode] = useState('');

  const generateVoucher = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) return;

    // Simulate adding captive portal session logs to Supabase
    addWifiRecord(clientName, clientDevice, durationMins, allocatedMb);
    setRecords(getWifiRecords());

    // Generate simulated single-use random ticket
    const prefix = "DUBE-WIFI-";
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    setVoucherCode(`${prefix}${rand}`);

    // Form clear
    setClientName('');
  };

  return (
    <div className="space-y-6" id="wifi-tab">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Voucher & WiFi Portal Desk</h1>
        <p className="text-sm text-slate-500 mt-1">Pre-flight system dashboard tracking dynamic internet vouchers, access limits, and guest allocations.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Voucher generation tool (5 cols) */}
        <div className="lg:col-span-5">
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-800 flex items-center">
              <Wifi className="w-4 h-4 mr-1.5 text-rose-500" />
              <span>Generate Captive Ticket Voucher</span>
            </h2>
            <p className="text-xs text-slate-400">Creates isolated dynamic tickets in client database tables. Network settings are synchronized via central routers.</p>

            <form onSubmit={generateVoucher} className="space-y-3 pt-3 border-t">
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Guest Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alinaje Phiri"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Access Duration</label>
                  <select
                    value={durationMins}
                    onChange={(e) => setDurationMins(parseInt(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none text-slate-700"
                  >
                    <option value={30}>30 Minutes</option>
                    <option value={60}>1 Hour</option>
                    <option value={120}>2 Hours</option>
                    <option value={240}>4 Hours</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Bandwidth quota</label>
                  <select
                    value={allocatedMb}
                    onChange={(e) => setAllocatedMb(parseInt(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none text-slate-700"
                  >
                    <option value={250}>250 MB Limit</option>
                    <option value={500}>500 MB Limit</option>
                    <option value={1024}>1.0 GB Limit</option>
                    <option value={2048}>2.0 GB Limit</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-500">Registered platform type</label>
                <input
                  type="text"
                  placeholder="e.g. iPhone / Android Guest"
                  value={clientDevice}
                  onChange={(e) => setClientDevice(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-rose-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold hover:shadow-md transition-all flex items-center justify-center space-x-1"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Issue Voucher Slip</span>
              </button>
            </form>

            <AnimatePresence>
              {voucherCode && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-4 p-4 bg-rose-50 border border-rose-200 rounded-2xl text-center space-y-2"
                >
                  <span className="text-[10px] font-bold text-rose-500 tracking-wider block uppercase">ACTIVE GATEWAY Voucher PIN</span>
                  <div className="text-xl font-extrabold text-rose-700 select-all font-mono tracking-widest bg-white border inline-block px-4 py-1.5 rounded-xl">
                    {voucherCode}
                  </div>
                  <p className="text-[10px] text-rose-600/60 font-medium">Valid for 60 mins. Present this printed slip to client.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Dynamic active sessions and structural architecture metrics (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
            {/* Tab selection */}
            <div className="flex border-b pb-3 mb-4 space-x-4">
              <button
                onClick={() => setActiveTab('sessions')}
                className={`text-xs font-extrabold pb-1 transition-all border-b-2 ${
                  activeTab === 'sessions' ? 'border-rose-500 text-rose-600' : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                Active Guest Sessions ({records.length})
              </button>
              <button
                onClick={() => setActiveTab('rules')}
                className={`text-xs font-extrabold pb-1 transition-all border-b-2 ${
                  activeTab === 'rules' ? 'border-rose-500 text-rose-600' : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                WiFi Security Isolation rules
              </button>
            </div>

            {activeTab === 'sessions' ? (
              <div className="divide-y divide-slate-100 max-h-[350px] overflow-y-auto pr-1">
                {records.length > 0 ? (
                  records.map(rec => (
                    <div key={rec.id} className="py-3.5 flex justify-between items-center text-xs">
                      <div className="flex items-center space-x-3 pr-2 truncate">
                        <div className="w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                          <HardDrive className="w-4 h-4" />
                        </div>
                        <div className="truncate">
                          <strong className="text-slate-700 block truncate">{rec.customer_name}</strong>
                          <span className="text-[10px] text-slate-400 block mt-0.5">{rec.device_name} &bull; {new Date(rec.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                      </div>
                      <div className="text-right font-mono shrink-0">
                        <div className="text-slate-700 font-bold">{rec.bandwidth_used_mb} MB consumed</div>
                        <div className="text-[10px] text-rose-500 flex items-center justify-end mt-0.5">
                          <Clock className="w-3 h-3 mr-0.5" /> {rec.access_duration_minutes}m limits
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-slate-400">
                    No WiFi vouchers allocated in current session logs.
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4 text-xs text-slate-500 text-left">
                <div className="bg-rose-50/40 p-4 border rounded-2xl space-y-2">
                  <span className="font-bold text-rose-700 flex items-center uppercase text-[10px]">
                    <ShieldCheck className="w-4 h-4 mr-1 text-emerald-600 stroke-[3]" /> NO DANGEROUS SECURITY EXPOSURES
                  </span>
                  <p className="leading-snug">
                    To maintain strict compliance with cybersecurity protocols, **no infrastructure credentials, SSID passwords, or master keys are preserved inside the client-facing databases.**
                  </p>
                </div>

                <div className="space-y-3 font-sans">
                  <div className="flex items-start space-x-2">
                    <div className="w-5 h-5 bg-slate-100 text-slate-600 rounded-md font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</div>
                    <div>
                      <strong className="text-slate-700 block">Isolated VLAN Setup</strong>
                      <span>All guest voucher terminals operate entirely within a standalone captive wireless network segregated using network switches, isolating POS accounting computers.</span>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <div className="w-5 h-5 bg-slate-100 text-slate-600 rounded-md font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</div>
                    <div>
                      <strong className="text-slate-700 block">Dynamic Mikrotik Captive hookup</strong>
                      <span>The router continuously reads from the Supabase `wifi_sessions` table through micro webhooks to issue bandwidth access caps, automating client cleanups without manual resets.</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
