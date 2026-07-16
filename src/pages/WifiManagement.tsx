import React, { useState, useEffect } from 'react';
import { 
  fetchWifiPackages, fetchWifiSessions, fetchWifiCustomers, fetchWifiUsageLogs, 
  fetchRouterSettings, startWifiSession, updateWifiSessionStatus, saveRouterSettings,
  isSupabaseConfigured, supabase
} from '../services/supabase';
import { connectRouter, applyAccessRule, removeAccessRule } from '../services/routerService';
import { getCurrentUser } from '../utils/db';
import { WifiCustomer, WifiPackage, WifiSession, WifiUsageLog, RouterSetting, User } from '../types';
import WifiSessionCard from '../components/WifiSessionCard';
import ConnectedDevices from '../components/ConnectedDevices';
import WifiReports from '../components/WifiReports';
import { 
  Wifi, PlusCircle, LayoutDashboard, Cpu, Database, RefreshCw, Radio,
  Settings2, ShieldCheck, Play, HelpCircle, Save, CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency } from '../utils/format';

export default function WifiManagement() {
  // Current logged in user
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Data states
  const [packages, setPackages] = useState<WifiPackage[]>([]);
  const [sessions, setSessions] = useState<WifiSession[]>([]);
  const [customers, setCustomers] = useState<WifiCustomer[]>([]);
  const [usageLogs, setUsageLogs] = useState<WifiUsageLog[]>([]);
  const [, setRouterSetting] = useState<RouterSetting | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<'sessions' | 'devices' | 'analytics' | 'router'>('sessions');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Form states for Starting session
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [deviceModel, setDeviceModel] = useState('');
  const [macAddress, setMacAddress] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState('');

  // Form states for Router Settings
  const [routerName, setRouterName] = useState('');
  const [routerBrand, setRouterBrand] = useState('Mikrotik');
  const [routerModel, setRouterModel] = useState('');
  const [integrationType, setIntegrationType] = useState('REST_API');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Fetch initial data
  const loadWifiData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [pkgs, sesss, custs, logs, settings] = await Promise.all([
        fetchWifiPackages(),
        fetchWifiSessions(),
        fetchWifiCustomers(),
        fetchWifiUsageLogs(),
        fetchRouterSettings()
      ]);

      setPackages(pkgs || []);
      setSessions(sesss || []);
      setCustomers(custs || []);
      setUsageLogs(logs || []);

      if (settings && settings.length > 0) {
        setRouterSetting(settings[0]);
        setRouterName(settings[0].router_name);
        setRouterBrand(settings[0].router_brand);
        setRouterModel(settings[0].router_model);
        setIntegrationType(settings[0].integration_type);
      } else {
        // Defaults
        setRouterName('Uruu Core Gateway');
        setRouterBrand('Mikrotik');
        setRouterModel('RB760iGS');
        setIntegrationType('REST_API');
      }

      // Default package selection
      if (pkgs && pkgs.length > 0 && !selectedPackageId) {
        setSelectedPackageId(pkgs[0].id);
      }
    } catch (err) {
      console.error('Error loading WiFi management resources:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentUser(getCurrentUser());
    loadWifiData();

    // Supabase Realtime Listener Setup
    if (isSupabaseConfigured) {
      console.log('[WiFi Realtime] Setting up listeners on wifi_sessions & wifi_usage_logs...');
      
      const sessionsSubscription = supabase
        .channel('wifi-sessions-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'wifi_sessions' },
          () => {
            console.log('[WiFi Realtime] wifi_sessions changed! Synchronizing silently...');
            loadWifiData(true);
          }
        )
        .subscribe();

      const logsSubscription = supabase
        .channel('wifi-logs-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'wifi_usage_logs' },
          () => {
            console.log('[WiFi Realtime] wifi_usage_logs changed! Synchronizing silently...');
            loadWifiData(true);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(sessionsSubscription);
        supabase.removeChannel(logsSubscription);
      };
    }
  }, []);

  // MAC Address validation regex
  const validateMac = (mac: string) => {
    const cleanMac = mac.trim();
    // Support standard formats: 00:11:22:33:44:55, 00-11-22-33-44-55, or no delimiters
    const regex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$|^([0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4})$|^([0-9A-Fa-f]{12})$/;
    return regex.test(cleanMac);
  };

  // --- ACTIONS ---

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    // Inputs Validation
    if (!custName.trim()) {
      setFormError('Customer Name is required');
      return;
    }
    if (!custPhone.trim()) {
      setFormError('Customer Phone is required');
      return;
    }
    if (!deviceModel.trim()) {
      setFormError('Device Model is required (e.g. iPhone 12 Pro)');
      return;
    }
    if (!macAddress.trim()) {
      setFormError('Physical Hardware MAC Address is required');
      return;
    }
    if (!validateMac(macAddress)) {
      setFormError('Invalid MAC format. Standard notation: AA:BB:CC:DD:EE:FF or AA-BB-CC-DD-EE-FF');
      return;
    }
    if (!selectedPackageId) {
      setFormError('Please select a WiFi rate package');
      return;
    }

    setActionLoading(true);
    try {
      // 1. Write session to database/localDb
      const newSession = await startWifiSession(
        custName.trim(),
        custPhone.trim(),
        deviceModel.trim(),
        macAddress.trim(),
        selectedPackageId
      );

      if (newSession) {
        // 2. Physical Router API Access Rule Application
        await applyAccessRule(macAddress.trim().toUpperCase(), newSession.duration_minutes);

        setFormSuccess(`WiFi hotspot voucher generated for ${custName}! Access authorized.`);
        
        // Reset inputs
        setCustName('');
        setCustPhone('');
        setDeviceModel('');
        setMacAddress('');
        
        // Refresh data
        await loadWifiData(true);
      } else {
        setFormError('Failed to initialize session. Please check Supabase logs.');
      }
    } catch (err: any) {
      setFormError(err?.message || 'Error occurred while creating voucher');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTerminateSession = async (id: string) => {
    const session = sessions.find(s => s.id === id);
    if (!session) return;

    if (!window.confirm(`Are you sure you want to disconnect ${session.wifi_customers?.name || 'this customer'}? This terminates physical WiFi access.`)) {
      return;
    }

    setActionLoading(true);
    try {
      // 1. Update status to completed
      await updateWifiSessionStatus(id, 'COMPLETED');

      // 2. Remove rule from router gateway
      if (session.wifi_customers?.mac_address) {
        await removeAccessRule(session.wifi_customers.mac_address);
      }

      await loadWifiData(true);
    } catch (err) {
      console.error('Error disconnecting hotspot lease:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSessionExpired = async (id: string) => {
    console.log(`[Timer System] Expired event triggered for WiFi Session ID: ${id}`);
    const session = sessions.find(s => s.id === id);
    if (!session) return;

    try {
      // 1. Update status in db to EXPIRED
      await updateWifiSessionStatus(id, 'EXPIRED');

      // 2. Disconnect physical device rules
      if (session.wifi_customers?.mac_address) {
        await removeAccessRule(session.wifi_customers.mac_address);
      }

      // Refresh silently
      await loadWifiData(true);
    } catch (err) {
      console.error('Error expiring session state:', err);
    }
  };

  const handleSaveRouterSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestResult(null);

    // ADMIN constraint check
    if (currentUser?.role !== 'ADMIN') {
      alert('Security Exception: Only administrative users can rewrite hardware gateway policies.');
      return;
    }

    if (!routerName.trim() || !routerModel.trim()) {
      alert('Router Name and Router Model fields cannot be empty.');
      return;
    }

    setActionLoading(true);
    try {
      const saved = await saveRouterSettings(
        routerName.trim(),
        routerBrand,
        routerModel.trim(),
        integrationType
      );
      if (saved) {
        alert('Gateway switch credentials and access rules saved.');
        await loadWifiData(true);
      }
    } catch (err) {
      console.error('Failed saving router policy:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleTestHandshake = async () => {
    setTestResult(null);
    setActionLoading(true);
    try {
      const res = await connectRouter({
        routerName,
        routerBrand,
        routerModel,
        integrationType: integrationType as any
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || 'Handshake failed' });
    } finally {
      setActionLoading(false);
    }
  };

  // --- RENDERS ---

  const activeSessions = sessions.filter(s => s.status === 'ACTIVE');
  const expiredSessions = sessions.filter(s => s.status === 'EXPIRED');

  // Stats for the Mini Dashboard Cards
  const activeCount = activeSessions.length;
  const expiredCount = expiredSessions.length;
  const todayRevenue = sessions
    .filter(s => {
      const isToday = new Date(s.created_at).toDateString() === new Date().toDateString();
      return isToday && s.status !== 'CANCELLED';
    })
    .reduce((sum, s) => sum + s.amount, 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6" id="wifi-module-main">
      {/* Title Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4 border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center">
            <Wifi className="w-7 h-7 mr-2.5 text-rose-500 animate-pulse" />
            <span>WiFi Control & Bandwidth Manager</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Track user leases, MAC address hardware constraints, and generate prepaid vouchers connected to physical gateway routers.
          </p>
        </div>

        {/* Sync indicators */}
        <div className="flex items-center space-x-2.5">
          <span className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono font-bold ${
            isSupabaseConfigured ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-slate-100 text-slate-500 border border-slate-200'
          }`}>
            <Database className="w-3.5 h-3.5" />
            <span>{isSupabaseConfigured ? 'SUPABASE REALTIME LIVE' : 'LOCAL SIMULATOR ACTIVE'}</span>
          </span>

          <button
            onClick={() => loadWifiData()}
            className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition text-slate-600 cursor-pointer"
            title="Refresh database records"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mini Dashboard Metrics Panels */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between text-left shadow-sm">
          <div>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Active Sessions</span>
            <strong className="text-xl font-extrabold text-slate-800 mt-1 block tabular-nums">{activeCount} Device(s)</strong>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center border border-emerald-100">
            <Radio className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between text-left shadow-sm">
          <div>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Expired Leases</span>
            <strong className="text-xl font-extrabold text-slate-800 mt-1 block tabular-nums">{expiredCount} Session(s)</strong>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center border border-amber-100">
            <Radio className="w-5 h-5 rotate-180" />
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between text-left shadow-sm">
          <div>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Connected Vouchers</span>
            <strong className="text-xl font-extrabold text-slate-800 mt-1 block tabular-nums">{customers.length} MAC Registry</strong>
          </div>
          <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-500 flex items-center justify-center border border-sky-100">
            <Cpu className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between text-left shadow-sm">
          <div>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">WiFi Income (Today)</span>
            <strong className="text-xl font-extrabold text-slate-800 mt-1 block tabular-nums">{formatCurrency(todayRevenue)}</strong>
          </div>
          <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center border border-rose-100">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex border-b border-slate-200 space-x-1 overflow-x-auto pt-2">
        <button
          onClick={() => setActiveTab('sessions')}
          className={`px-4 py-2.5 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer flex items-center space-x-1.5 ${
            activeTab === 'sessions' 
              ? 'border-rose-500 text-rose-600' 
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Active Vouchers & Form</span>
        </button>

        <button
          onClick={() => setActiveTab('devices')}
          className={`px-4 py-2.5 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer flex items-center space-x-1.5 ${
            activeTab === 'devices' 
              ? 'border-rose-500 text-rose-600' 
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>Device MAC Registry</span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-2.5 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer flex items-center space-x-1.5 ${
            activeTab === 'analytics' 
              ? 'border-rose-500 text-rose-600' 
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Settings2 className="w-4 h-4" />
          <span>Revenue & Audit Logs</span>
        </button>

        <button
          onClick={() => setActiveTab('router')}
          className={`px-4 py-2.5 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer flex items-center space-x-1.5 ${
            activeTab === 'router' 
              ? 'border-rose-500 text-rose-600' 
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>Router Integration</span>
        </button>
      </div>

      {/* Primary Panels Content */}
      <div className="pt-2">
        {loading ? (
          <div className="py-20 text-center text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin text-rose-500 mx-auto mb-3" />
            <p className="text-sm font-mono">Synchronizing network databases...</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {/* Live sessions & start form tab */}
            {activeTab === 'sessions' && (
              <motion.div
                key="sessions-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 lg:grid-cols-3 gap-6"
              >
                {/* START WIFI SESSION FORM */}
                <div className="bg-white border rounded-3xl p-5 shadow-sm space-y-4 text-left lg:col-span-1 self-start">
                  <div>
                    <h2 className="text-sm font-black text-slate-800 flex items-center">
                      <PlusCircle className="w-4 h-4 mr-1.5 text-rose-500" />
                      <span>Issue Access Voucher</span>
                    </h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">Authorizes physical device access by registering user's MAC address.</p>
                  </div>

                  {formError && (
                    <div className="bg-rose-50 border border-rose-100 text-rose-600 p-3 rounded-2xl text-[11px] leading-snug">
                      <strong>Validation Error:</strong> {formError}
                    </div>
                  )}

                  {formSuccess && (
                    <div className="bg-emerald-50 border border-emerald-100 text-emerald-600 p-3 rounded-2xl text-[11px] leading-snug flex items-start space-x-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{formSuccess}</span>
                    </div>
                  )}

                  <form onSubmit={handleStartSession} className="space-y-3 text-xs">
                    {/* Customer details */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 font-mono">Customer Full Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Mercy Tembo"
                        value={custName}
                        onChange={(e) => setCustName(e.target.value)}
                        className="w-full px-3.5 py-2 border rounded-xl outline-none focus:border-rose-500 transition-all bg-slate-50/50"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 font-mono">Phone Number</label>
                        <input
                          type="text"
                          placeholder="099xxxxxxx"
                          value={custPhone}
                          onChange={(e) => setCustPhone(e.target.value)}
                          className="w-full px-3.5 py-2 border rounded-xl outline-none focus:border-rose-500 transition-all bg-slate-50/50"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 font-mono">Device Model</label>
                        <input
                          type="text"
                          placeholder="e.g. iPhone 12 Pro"
                          value={deviceModel}
                          onChange={(e) => setDeviceModel(e.target.value)}
                          className="w-full px-3.5 py-2 border rounded-xl outline-none focus:border-rose-500 transition-all bg-slate-50/50"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 font-mono flex items-center justify-between">
                        <span>Hardware MAC Address</span>
                        <span className="text-[9px] text-slate-400 font-normal">AA:BB:CC:DD:EE:FF</span>
                      </label>
                      <input
                        type="text"
                        placeholder="00:1A:2B:3C:4D:5E"
                        value={macAddress}
                        onChange={(e) => setMacAddress(e.target.value)}
                        className="w-full px-3.5 py-2 border rounded-xl outline-none focus:border-rose-500 transition-all bg-slate-50/50 uppercase font-mono tracking-wider"
                        required
                      />
                    </div>

                    {/* Rates Selector */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 font-mono">Rate Package Plan</label>
                      <select
                        value={selectedPackageId}
                        onChange={(e) => setSelectedPackageId(e.target.value)}
                        className="w-full px-3.5 py-2 border rounded-xl outline-none focus:border-rose-500 transition-all bg-slate-50/50"
                      >
                        {packages.map(pkg => (
                          <option key={pkg.id} value={pkg.id}>
                            {pkg.name} ({pkg.duration_minutes} Mins) &mdash; {formatCurrency(pkg.price)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="w-full py-2.5 bg-slate-900 hover:bg-rose-500 text-white font-bold rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer shadow-sm mt-4 text-xs disabled:opacity-50"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{actionLoading ? 'Provisioning Switch...' : 'Authorize Hotspot Access'}</span>
                    </button>
                  </form>
                </div>

                {/* ACTIVE SESSIONS CARDS LIST */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-black text-slate-800 text-left flex items-center">
                        <Radio className="w-4.5 h-4.5 mr-1.5 text-rose-500 animate-pulse" />
                        <span>Live Bandwidth Leases ({activeSessions.length})</span>
                      </h2>
                      <p className="text-[11px] text-slate-400 text-left">Currently authenticated active leases streaming packets on local router.</p>
                    </div>
                  </div>

                  {activeSessions.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {activeSessions.map(sess => (
                        <WifiSessionCard
                          key={sess.id}
                          session={sess}
                          onTerminate={handleTerminateSession}
                          onExpire={handleSessionExpired}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="border border-dashed border-slate-200 rounded-3xl p-12 bg-slate-50/50 text-center text-slate-400">
                      <Wifi className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                      <h4 className="font-bold text-slate-700 text-sm">No Active Network Sessions</h4>
                      <p className="text-[11px] text-slate-400 max-w-sm mx-auto mt-1">
                        Use the allocation card to generate a WiFi access ticket for clients. The connection will stream to the physical router.
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Registered Devices tab */}
            {activeTab === 'devices' && (
              <motion.div
                key="devices-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <ConnectedDevices
                  customers={customers}
                  usageLogs={usageLogs}
                  onRefresh={() => loadWifiData(true)}
                  loading={actionLoading}
                />
              </motion.div>
            )}

            {/* Reports and logs tab */}
            {activeTab === 'analytics' && (
              <motion.div
                key="analytics-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <WifiReports
                  sessions={sessions}
                  usageLogs={usageLogs}
                  packages={packages}
                />
              </motion.div>
            )}

            {/* Router configurations tab */}
            {activeTab === 'router' && (
              <motion.div
                key="router-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-2xl mx-auto"
              >
                <div className="bg-white border rounded-3xl p-6 shadow-sm space-y-6 text-left">
                  <div className="flex items-start justify-between border-b pb-4 border-slate-100">
                    <div>
                      <h2 className="text-sm font-black text-slate-800 flex items-center">
                        <Radio className="w-4.5 h-4.5 mr-1.5 text-rose-500" />
                        <span>Physical Gateway Settings & Rules</span>
                      </h2>
                      <p className="text-[11px] text-slate-400 mt-0.5">Integrates web portal database states with local physical hardware interfaces.</p>
                    </div>

                    <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-full text-[9px] font-mono font-bold tracking-wider bg-rose-50 text-rose-600 border border-rose-100">
                      <ShieldCheck className="w-3 h-3" />
                      <span>ADMIN POLICY ONLY</span>
                    </span>
                  </div>

                  {currentUser?.role !== 'ADMIN' ? (
                    <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-start space-x-2.5 text-amber-800 text-xs leading-normal">
                      <HelpCircle className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
                      <div>
                        <strong>Read-Only Mode:</strong> Your account role (<code>{currentUser?.role || 'STAFF'}</code>) is restricted from modifying hardware credentials. Please contact an administrative user to alter Mikrotik/Cisco server integrations.
                      </div>
                    </div>
                  ) : null}

                  <form onSubmit={handleSaveRouterSettings} className="space-y-4 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 font-mono">Gateway Router Name</label>
                        <input
                          type="text"
                          value={routerName}
                          onChange={(e) => setRouterName(e.target.value)}
                          disabled={currentUser?.role !== 'ADMIN'}
                          className="w-full px-3.5 py-2.5 border rounded-xl outline-none focus:border-rose-500 transition-all bg-slate-50/50 disabled:opacity-60"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 font-mono">Router Brand</label>
                        <select
                          value={routerBrand}
                          onChange={(e) => setRouterBrand(e.target.value)}
                          disabled={currentUser?.role !== 'ADMIN'}
                          className="w-full px-3.5 py-2.5 border rounded-xl outline-none focus:border-rose-500 transition-all bg-slate-50/50 disabled:opacity-60"
                        >
                          <option value="Mikrotik">Mikrotik RouterBoard (Recommended)</option>
                          <option value="Cisco">Cisco ISR / Catalyst</option>
                          <option value="TP-Link">TP-Link Omada SDN</option>
                          <option value="Ubiquiti">Ubiquiti UniFi Gateway</option>
                          <option value="Generic">Generic Linux/pfSense Bridge</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 font-mono">Hardware Model / Board ID</label>
                        <input
                          type="text"
                          value={routerModel}
                          placeholder="e.g. hEX S RB760iGS"
                          onChange={(e) => setRouterModel(e.target.value)}
                          disabled={currentUser?.role !== 'ADMIN'}
                          className="w-full px-3.5 py-2.5 border rounded-xl outline-none focus:border-rose-500 transition-all bg-slate-50/50 disabled:opacity-60"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 font-mono">Physical API Integration Type</label>
                        <select
                          value={integrationType}
                          onChange={(e) => setIntegrationType(e.target.value)}
                          disabled={currentUser?.role !== 'ADMIN'}
                          className="w-full px-3.5 py-2.5 border rounded-xl outline-none focus:border-rose-500 transition-all bg-slate-50/50 disabled:opacity-60"
                        >
                          <option value="REST_API">REST API (HTTP Web Sockets over SSL)</option>
                          <option value="SSH_COMMAND">Secure Shell (Encrypted SSH Commands)</option>
                          <option value="WEB_HOOK">Dynamic Webhook Endpoint Actions</option>
                        </select>
                      </div>
                    </div>

                    {/* Test handshake results output */}
                    {testResult && (
                      <div className={`p-4 rounded-2xl text-[11px] leading-snug border ${
                        testResult.success 
                          ? 'bg-emerald-50 border-emerald-100 text-emerald-700' 
                          : 'bg-rose-50 border-rose-100 text-rose-700'
                      }`}>
                        <strong>Gateway Handshake:</strong> {testResult.message}
                      </div>
                    )}

                    <div className="pt-4 flex flex-col sm:flex-row gap-3">
                      <button
                        type="button"
                        onClick={handleTestHandshake}
                        disabled={actionLoading}
                        className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer flex items-center justify-center space-x-1.5 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin text-rose-500' : ''}`} />
                        <span>Test API Handshake</span>
                      </button>

                      {currentUser?.role === 'ADMIN' && (
                        <button
                          type="submit"
                          disabled={actionLoading}
                          className="flex-1 py-2.5 bg-slate-900 hover:bg-rose-500 text-white font-bold rounded-xl transition cursor-pointer flex items-center justify-center space-x-1.5 disabled:opacity-50"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Save Access Rule Policy</span>
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
