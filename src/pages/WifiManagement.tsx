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

// ---- Stat card (matches Dashboard's HeroStat pattern) ---------------------

function StatCard({ icon: Icon, label, value, tone = 'blue' }: {
  icon: React.ElementType; label: string; value: React.ReactNode;
  tone?: 'blue' | 'cyan' | 'success' | 'warning';
}) {
  const fg = tone === 'cyan' ? 'var(--cyan-300)' : tone === 'success' ? 'var(--success)' : tone === 'warning' ? 'var(--warning)' : 'var(--blue-400)';
  const bg = tone === 'cyan' ? 'var(--cyan-bg)' : tone === 'success' ? 'var(--success-bg)' : tone === 'warning' ? 'var(--warning-bg)' : 'var(--blue-bg)';
  return (
    <div className="dm-card p-4 flex items-center justify-between text-left">
      <div>
        <span className="dm-label" style={{ padding: 0, display: 'block' }}>{label}</span>
        <strong className="dm-kpi dm-nums" style={{ fontSize: '1.15rem', display: 'block', marginTop: 4 }}>{value}</strong>
      </div>
      <div className="flex items-center justify-center flex-shrink-0" style={{ width: 36, height: 36, borderRadius: 10, background: bg, color: fg }}>
        <Icon style={{ width: 17, height: 17 }} />
      </div>
    </div>
  );
}

const TABS: { id: 'sessions' | 'devices' | 'analytics' | 'router'; label: string; icon: React.ElementType }[] = [
  { id: 'sessions',  label: 'Active Vouchers & Form', icon: LayoutDashboard },
  { id: 'devices',   label: 'Device MAC Registry',    icon: Cpu },
  { id: 'analytics', label: 'Revenue & Audit Logs',   icon: Settings2 },
  { id: 'router',    label: 'Router Integration',     icon: Radio },
];

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
    <div className="space-y-6" id="wifi-module-main">
      {/* Title Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4" style={{ borderBottom: '1px solid var(--panel-line)' }}>
        <div>
          <h1 className="dm-h1 flex items-center">
            <Wifi className="dm-dot-pulse" style={{ width: 24, height: 24, marginRight: 10, color: 'var(--blue-400)' }} />
            <span>WiFi Control &amp; Bandwidth Manager</span>
          </h1>
          <p style={{ color: 'var(--text-mid)', fontSize: '0.75rem', marginTop: 4 }}>
            Track user leases, MAC address hardware constraints, and generate prepaid vouchers connected to physical gateway routers.
          </p>
        </div>

        {/* Sync indicators */}
        <div className="flex items-center gap-2.5">
          <span className={`dm-badge ${isSupabaseConfigured ? 'dm-badge-info' : 'dm-badge-neutral'}`} style={{ fontFamily: 'monospace' }}>
            <Database style={{ width: 13, height: 13 }} />
            <span>{isSupabaseConfigured ? 'SUPABASE REALTIME LIVE' : 'LOCAL SIMULATOR ACTIVE'}</span>
          </span>

          <button
            onClick={() => loadWifiData()}
            className="dm-icon-btn"
            title="Refresh database records"
          >
            <RefreshCw style={{ width: 16, height: 16 }} />
          </button>
        </div>
      </div>

      {/* Mini Dashboard Metrics Panels */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Radio} label="Active Sessions" value={`${activeCount} Device(s)`} tone="success" />
        <StatCard icon={Radio} label="Expired Leases" value={`${expiredCount} Session(s)`} tone="warning" />
        <StatCard icon={Cpu} label="Connected Vouchers" value={`${customers.length} MAC Registry`} tone="cyan" />
        <StatCard icon={Radio} label="WiFi Income (Today)" value={formatCurrency(todayRevenue)} tone="blue" />
      </div>

      {/* Tabs navigation */}
      <div className="dm-scroll-x flex gap-2 pt-1">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`dm-badge ${active ? 'dm-badge-info' : 'dm-badge-neutral'}`}
              style={{ padding: '0.5rem 0.9rem', fontSize: '0.78rem', cursor: 'pointer', flexShrink: 0 }}
            >
              <Icon style={{ width: 13, height: 13 }} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Primary Panels Content */}
      <div className="pt-2">
        {loading ? (
          <div className="py-20 text-center" style={{ color: 'var(--text-low)' }}>
            <RefreshCw className="dm-spin" style={{ width: 28, height: 28, color: 'var(--blue-400)', margin: '0 auto 12px' }} />
            <p style={{ fontSize: '0.8125rem', fontFamily: 'monospace' }}>Synchronizing network databases...</p>
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
                <div className="dm-card p-5 space-y-4 text-left lg:col-span-1 self-start">
                  <div>
                    <h2 className="dm-h3 flex items-center">
                      <PlusCircle style={{ width: 15, height: 15, marginRight: 6, color: 'var(--blue-400)' }} />
                      <span>Issue Access Voucher</span>
                    </h2>
                    <p style={{ color: 'var(--text-low)', fontSize: '0.6875rem', marginTop: 3 }}>Authorizes physical device access by registering user's MAC address.</p>
                  </div>

                  {formError && (
                    <div className="dm-badge dm-badge-danger" style={{ width: '100%', padding: '0.6rem 0.75rem', fontSize: '0.6875rem', lineHeight: 1.5, whiteSpace: 'normal', textAlign: 'left' }}>
                      <strong>Validation Error:</strong>&nbsp;{formError}
                    </div>
                  )}

                  {formSuccess && (
                    <div className="dm-badge dm-badge-success" style={{ width: '100%', padding: '0.6rem 0.75rem', fontSize: '0.6875rem', lineHeight: 1.5, whiteSpace: 'normal', textAlign: 'left', alignItems: 'flex-start' }}>
                      <CheckCircle2 style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
                      <span>{formSuccess}</span>
                    </div>
                  )}

                  <form onSubmit={handleStartSession} className="space-y-3">
                    {/* Customer details */}
                    <div className="space-y-1">
                      <label className="dm-label" style={{ padding: 0 }}>Customer Full Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Mercy Tembo"
                        value={custName}
                        onChange={(e) => setCustName(e.target.value)}
                        className="dm-input"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="dm-label" style={{ padding: 0 }}>Phone Number</label>
                        <input
                          type="text"
                          placeholder="099xxxxxxx"
                          value={custPhone}
                          onChange={(e) => setCustPhone(e.target.value)}
                          className="dm-input"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="dm-label" style={{ padding: 0 }}>Device Model</label>
                        <input
                          type="text"
                          placeholder="e.g. iPhone 12 Pro"
                          value={deviceModel}
                          onChange={(e) => setDeviceModel(e.target.value)}
                          className="dm-input"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="dm-label flex items-center justify-between" style={{ padding: 0 }}>
                        <span>Hardware MAC Address</span>
                        <span style={{ color: 'var(--text-low)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>AA:BB:CC:DD:EE:FF</span>
                      </label>
                      <input
                        type="text"
                        placeholder="00:1A:2B:3C:4D:5E"
                        value={macAddress}
                        onChange={(e) => setMacAddress(e.target.value)}
                        className="dm-input"
                        style={{ textTransform: 'uppercase', fontFamily: 'monospace', letterSpacing: '0.05em' }}
                        required
                      />
                    </div>

                    {/* Rates Selector */}
                    <div className="space-y-1">
                      <label className="dm-label" style={{ padding: 0 }}>Rate Package Plan</label>
                      <select
                        value={selectedPackageId}
                        onChange={(e) => setSelectedPackageId(e.target.value)}
                        className="dm-select"
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
                      className="dm-btn dm-btn-primary w-full"
                      style={{ marginTop: 8 }}
                    >
                      <Play style={{ width: 14, height: 14 }} />
                      <span>{actionLoading ? 'Provisioning Switch...' : 'Authorize Hotspot Access'}</span>
                    </button>
                  </form>
                </div>

                {/* ACTIVE SESSIONS CARDS LIST */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="dm-h3 text-left flex items-center">
                        <Radio className="dm-dot-pulse" style={{ width: 16, height: 16, marginRight: 6, color: 'var(--blue-400)' }} />
                        <span>Live Bandwidth Leases ({activeSessions.length})</span>
                      </h2>
                      <p style={{ color: 'var(--text-low)', fontSize: '0.6875rem', textAlign: 'left' }}>Currently authenticated active leases streaming packets on local router.</p>
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
                    <div className="dm-card-inset text-center" style={{ padding: '3rem 1.5rem', borderStyle: 'dashed' }}>
                      <Wifi style={{ width: 40, height: 40, color: 'var(--text-low)', margin: '0 auto 12px' }} />
                      <h4 style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-mid)' }}>No Active Network Sessions</h4>
                      <p style={{ color: 'var(--text-low)', fontSize: '0.6875rem', maxWidth: 380, margin: '4px auto 0' }}>
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
                <div className="dm-card p-6 space-y-6 text-left">
                  <div className="flex items-start justify-between pb-4" style={{ borderBottom: '1px solid var(--panel-line)' }}>
                    <div>
                      <h2 className="dm-h3 flex items-center">
                        <Radio style={{ width: 16, height: 16, marginRight: 6, color: 'var(--blue-400)' }} />
                        <span>Physical Gateway Settings &amp; Rules</span>
                      </h2>
                      <p style={{ color: 'var(--text-low)', fontSize: '0.6875rem', marginTop: 3 }}>Integrates web portal database states with local physical hardware interfaces.</p>
                    </div>

                    <span className="dm-badge dm-badge-info" style={{ fontFamily: 'monospace', flexShrink: 0 }}>
                      <ShieldCheck style={{ width: 12, height: 12 }} />
                      <span>ADMIN POLICY ONLY</span>
                    </span>
                  </div>

                  {currentUser?.role !== 'ADMIN' ? (
                    <div className="dm-badge dm-badge-warning" style={{ width: '100%', padding: '0.85rem 1rem', alignItems: 'flex-start', fontSize: '0.75rem', lineHeight: 1.6, whiteSpace: 'normal', textAlign: 'left' }}>
                      <HelpCircle style={{ width: 18, height: 18, flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <strong>Read-Only Mode:</strong> Your account role (<code>{currentUser?.role || 'STAFF'}</code>) is restricted from modifying hardware credentials. Please contact an administrative user to alter Mikrotik/Cisco server integrations.
                      </div>
                    </div>
                  ) : null}

                  <form onSubmit={handleSaveRouterSettings} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="dm-label" style={{ padding: 0 }}>Gateway Router Name</label>
                        <input
                          type="text"
                          value={routerName}
                          onChange={(e) => setRouterName(e.target.value)}
                          disabled={currentUser?.role !== 'ADMIN'}
                          className="dm-input"
                          style={{ opacity: currentUser?.role !== 'ADMIN' ? 0.6 : 1 }}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="dm-label" style={{ padding: 0 }}>Router Brand</label>
                        <select
                          value={routerBrand}
                          onChange={(e) => setRouterBrand(e.target.value)}
                          disabled={currentUser?.role !== 'ADMIN'}
                          className="dm-select"
                          style={{ opacity: currentUser?.role !== 'ADMIN' ? 0.6 : 1 }}
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
                        <label className="dm-label" style={{ padding: 0 }}>Hardware Model / Board ID</label>
                        <input
                          type="text"
                          value={routerModel}
                          placeholder="e.g. hEX S RB760iGS"
                          onChange={(e) => setRouterModel(e.target.value)}
                          disabled={currentUser?.role !== 'ADMIN'}
                          className="dm-input"
                          style={{ opacity: currentUser?.role !== 'ADMIN' ? 0.6 : 1 }}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="dm-label" style={{ padding: 0 }}>Physical API Integration Type</label>
                        <select
                          value={integrationType}
                          onChange={(e) => setIntegrationType(e.target.value)}
                          disabled={currentUser?.role !== 'ADMIN'}
                          className="dm-select"
                          style={{ opacity: currentUser?.role !== 'ADMIN' ? 0.6 : 1 }}
                        >
                          <option value="REST_API">REST API (HTTP Web Sockets over SSL)</option>
                          <option value="SSH_COMMAND">Secure Shell (Encrypted SSH Commands)</option>
                          <option value="WEB_HOOK">Dynamic Webhook Endpoint Actions</option>
                        </select>
                      </div>
                    </div>

                    {/* Test handshake results output */}
                    {testResult && (
                      <div className={`dm-badge ${testResult.success ? 'dm-badge-success' : 'dm-badge-danger'}`} style={{ width: '100%', padding: '0.85rem 1rem', fontSize: '0.75rem', lineHeight: 1.6, whiteSpace: 'normal', textAlign: 'left' }}>
                        <strong>Gateway Handshake:</strong>&nbsp;{testResult.message}
                      </div>
                    )}

                    <div className="pt-4 flex flex-col sm:flex-row gap-3">
                      <button
                        type="button"
                        onClick={handleTestHandshake}
                        disabled={actionLoading}
                        className="dm-btn dm-btn-ghost flex-1"
                      >
                        <RefreshCw className={actionLoading ? 'dm-spin' : ''} style={{ width: 14, height: 14 }} />
                        <span>Test API Handshake</span>
                      </button>

                      {currentUser?.role === 'ADMIN' && (
                        <button
                          type="submit"
                          disabled={actionLoading}
                          className="dm-btn dm-btn-primary flex-1"
                        >
                          <Save style={{ width: 14, height: 14 }} />
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
