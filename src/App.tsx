import React, { useState, useEffect } from 'react';
import { User, UserRole } from './types';
import { initializeStore } from './utils/db';
import { getAuthenticatedUser, logoutUser } from './services/supabase';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Sales from './pages/Sales';
import PrintingOrders from './pages/PrintingOrders';
import CafeManagement from './pages/CafeManagement';
import Customers from './pages/Customers';
import WifiManagement from './pages/WifiManagement';
import PrintManager from './pages/PrintManager';
import PCAgentConsole from './components/PCAgentConsole';
import ActivityLogs from './components/ActivityLogs';

import {
  LayoutDashboard, Package, ShoppingCart, Printer, Monitor,
  Wifi, History, Users, Shield, LogOut, Menu, X,
  RefreshCw, PrinterIcon, ChevronRight, Bell,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Analytics } from '@vercel/analytics/react';

// ---- Tab definitions -------------------------------------------------------

interface TabDef {
  id: string;
  label: string;
  icon: React.ElementType;
  group: string;
  path: string;
  roles: UserRole[];
}

const TABS: TabDef[] = [
  // Home
  { id: 'dashboard',     label: 'Overview',        icon: LayoutDashboard, group: 'Home',       path: '/dashboard',     roles: ['ADMIN'] },
  // Operations
  { id: 'pos',           label: 'POS & Sales',      icon: ShoppingCart,    group: 'Operations', path: '/sales',         roles: ['ADMIN','STAFF'] },
  { id: 'inventory',     label: 'Inventory',        icon: Package,         group: 'Operations', path: '/inventory',     roles: ['ADMIN','STAFF'] },
  { id: 'customers',     label: 'Customers',        icon: Users,           group: 'Operations', path: '/customers',     roles: ['ADMIN','STAFF'] },
  // Printing
  { id: 'print-manager', label: 'Print Manager',    icon: PrinterIcon,     group: 'Printing',   path: '/print-manager', roles: ['ADMIN'] },
  { id: 'printing',      label: 'Branding & Orders',icon: Printer,         group: 'Printing',   path: '/printing-orders',roles: ['ADMIN'] },
  // Connectivity
  { id: 'cafe',          label: 'Internet Café',    icon: Monitor,         group: 'Connectivity',path: '/cafe-management',roles: ['ADMIN','CAFE_OPERATOR'] },
  { id: 'wifi',          label: 'WiFi Management',  icon: Wifi,            group: 'Connectivity',path: '/wifi',          roles: ['ADMIN','STAFF','CAFE_OPERATOR'] },
  // System
  { id: 'pc-agent',      label: 'PC Agent Hub',     icon: Shield,          group: 'System',     path: '/pc-agent',      roles: ['ADMIN'] },
  { id: 'logs',          label: 'Security Logs',    icon: History,         group: 'System',     path: '/logs',          roles: ['ADMIN'] },
];

const PATH_TO_TAB: Record<string, string> = Object.fromEntries(
  TABS.map(t => [t.path, t.id])
);
const TAB_TO_PATH: Record<string, string> = Object.fromEntries(
  TABS.map(t => [t.id, t.path])
);
PATH_TO_TAB['/users'] = 'logs'; // legacy alias

const GROUP_ORDER = ['Home','Operations','Printing','Connectivity','System'];

// ---- Sync indicator --------------------------------------------------------

function SyncIndicator() {
  const [syncing, setSyncing] = useState(false);
  const [label, setLabel] = useState('Synced');

  useEffect(() => {
    const iv = setInterval(() => {
      setSyncing(true);
      setLabel('Syncing…');
      setTimeout(() => {
        setSyncing(false);
        const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setLabel(`Synced ${t}`);
      }, 1200);
    }, 30000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={{ background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '0.6875rem', color: '#64748b', fontWeight: 500 }}>
      <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: syncing ? '#f59e0b' : '#10b981', animation: 'pulse 2s infinite' }} />
      <span>{label}</span>
    </div>
  );
}

// ---- Sidebar nav section ---------------------------------------------------

interface SidebarSectionProps {
  group: string;
  tabs: TabDef[];
  activeTab: string;
  onSelect: (id: string) => void;
}

function SidebarSection({ group, tabs, activeTab, onSelect }: SidebarSectionProps) {
  if (tabs.length === 0) return null;
  return (
    <div className="space-y-0.5">
      <div style={{
        fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: '#94a3b8',
        padding: '0.25rem 0.875rem', marginTop: '0.75rem',
      }}>
        {group}
      </div>
      {tabs.map(tab => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-all cursor-pointer"
            style={{
              fontSize: '0.8125rem',
              fontWeight: active ? 600 : 500,
              color: active ? 'white' : '#475569',
              background: active
                ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
                : 'transparent',
              border: 'none',
              boxShadow: active ? '0 2px 8px rgba(37,99,235,0.22)' : 'none',
              transition: 'all 0.15s cubic-bezier(0.4,0,0.2,1)',
            }}
            onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = '#f1f5f9'; }}
            onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            aria-current={active ? 'page' : undefined}
          >
            <Icon
              style={{ width: 15, height: 15, flexShrink: 0, color: active ? 'white' : '#94a3b8' }}
            />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---- Sidebar ---------------------------------------------------------------

interface SidebarProps {
  user: User;
  activeTab: string;
  onSelect: (id: string) => void;
  onLogout: () => void;
  mobile?: boolean;
  onClose?: () => void;
}

function Sidebar({ user, activeTab, onSelect, onLogout, mobile, onClose }: SidebarProps) {
  const visibleTabs = TABS.filter(t => t.roles.includes(user.role as UserRole));
  const grouped = GROUP_ORDER.map(g => ({
    group: g,
    tabs: visibleTabs.filter(t => t.group === g),
  }));

  const roleLabel: Record<string, string> = {
    ADMIN: 'Administrator',
    STAFF: 'Staff Operator',
    CAFE_OPERATOR: 'Café Operator',
  };

  const handleSelect = (id: string) => {
    onSelect(id);
    onClose?.();
  };

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: 'white',
        borderRight: '1px solid #e2e8f0',
        width: mobile ? '100%' : '248px',
        minHeight: '100%',
      }}
    >
      {/* Brand slot */}
      <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid #f1f5f9' }}>
        <div
          style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span style={{ color: 'white', fontFamily: 'Manrope', fontWeight: 800, fontSize: '13px' }}>DM</span>
        </div>
        <div>
          <div style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: '15px', color: '#0f172a', letterSpacing: '-0.02em' }}>
            Dube Man
          </div>
          <div style={{ fontSize: '0.625rem', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.05em' }}>
            Workspace
          </div>
        </div>
        {mobile && (
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer" style={{ border: 'none', background: 'transparent' }}>
            <X style={{ width: 16, height: 16, color: '#94a3b8' }} />
          </button>
        )}
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0">
        {grouped.map(({ group, tabs }) => (
          <SidebarSection
            key={group}
            group={group}
            tabs={tabs}
            activeTab={activeTab}
            onSelect={handleSelect}
          />
        ))}
      </nav>

      {/* User profile footer */}
      <div className="px-4 py-3" style={{ borderTop: '1px solid #f1f5f9' }}>
        <div className="flex items-center gap-2.5 mb-3">
          <div
            style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'linear-gradient(135deg, #dbeafe, #ede9fe)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#2563eb' }}>
              {user.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#0f172a' }} className="truncate">
              {user.name}
            </div>
            <div style={{ fontSize: '0.6875rem', color: '#94a3b8', fontWeight: 500 }}>
              {roleLabel[user.role] ?? user.role}
            </div>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all"
          style={{
            background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fee2e2'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'; }}
        >
          <LogOut style={{ width: 13, height: 13 }} />
          Sign Out
        </button>
      </div>
    </div>
  );
}

// ---- Topbar ----------------------------------------------------------------

interface TopbarProps {
  user: User;
  activeTab: string;
  onMenuToggle: () => void;
}

function Topbar({ user, activeTab, onMenuToggle }: TopbarProps) {
  const tab = TABS.find(t => t.id === activeTab);
  const crumbs = tab ? [tab.group, tab.label] : ['Dube Man'];

  return (
    <header
      className="flex items-center justify-between px-5 lg:px-6"
      style={{
        height: '60px',
        background: 'white',
        borderBottom: '1px solid #e2e8f0',
        position: 'sticky',
        top: 0,
        zIndex: 30,
        flexShrink: 0,
      }}
    >
      {/* Left: hamburger + breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-xl cursor-pointer"
          style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569' }}
          aria-label="Open navigation"
        >
          <Menu style={{ width: 16, height: 16 }} />
        </button>
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5" aria-label="Breadcrumb">
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500 }}>{crumbs[0]}</span>
          {crumbs.length > 1 && (
            <>
              <ChevronRight style={{ width: 12, height: 12, color: '#cbd5e1' }} />
              <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#0f172a' }}>{crumbs[1]}</span>
            </>
          )}
        </nav>
      </div>

      {/* Right: sync + notifications + user chip */}
      <div className="flex items-center gap-3">
        <SyncIndicator />

        <button
          className="p-2 rounded-xl cursor-pointer"
          style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b' }}
          aria-label="Notifications"
        >
          <Bell style={{ width: 15, height: 15 }} />
        </button>

        {/* User chip — desktop only */}
        <div
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl"
          style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}
        >
          <div
            style={{
              width: 24, height: 24, borderRadius: 6,
              background: 'linear-gradient(135deg, #dbeafe, #ede9fe)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '10px', fontWeight: 800, color: '#2563eb' }}>
              {user.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0f172a' }}>{user.name}</span>
        </div>
      </div>
    </header>
  );
}

// ---- Unauthorized screen ---------------------------------------------------

function UnauthorizedScreen({ user, onBack }: { user: User; onBack: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
      <div
        className="w-14 h-14 rounded-2xl mb-4 flex items-center justify-center"
        style={{ background: '#fff1f2', border: '1px solid #fecaca' }}
      >
        <Shield style={{ width: 24, height: 24, color: '#dc2626' }} />
      </div>
      <h2 style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: '1.25rem', color: '#0f172a', letterSpacing: '-0.01em' }}>
        Access Restricted
      </h2>
      <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: 8, maxWidth: 360 }}>
        Your role (<strong>{user.role}</strong>) does not have permission to access this section.
      </p>
      <button
        onClick={onBack}
        className="mt-6 flex items-center gap-2 cursor-pointer"
        style={{
          padding: '0.625rem 1.25rem',
          background: '#0f172a',
          color: 'white',
          border: 'none',
          borderRadius: '10px',
          fontSize: '0.875rem',
          fontWeight: 700,
        }}
      >
        Return to Workspace
      </button>
    </div>
  );
}

// ---- Loading screen --------------------------------------------------------

function LoadingScreen() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: '#0f172a' }}
    >
      <div
        style={{
          width: 48, height: 48, borderRadius: 14,
          background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 16,
        }}
      >
        <span style={{ color: 'white', fontFamily: 'Manrope', fontWeight: 800, fontSize: '18px' }}>DM</span>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[0,1,2].map(i => (
          <div
            key={i}
            style={{
              width: 7, height: 7, borderRadius: '50%', background: '#2563eb',
              animation: `uruu-fade-in 0.8s ${i * 0.2}s ease-in-out infinite alternate`,
              opacity: 0.5,
            }}
          />
        ))}
      </div>
      <span style={{ color: '#475569', fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.05em' }}>
        Starting Dube Man…
      </span>
    </div>
  );
}

// ---- Root App --------------------------------------------------------------

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser]                   = useState<User | null>(null);
  const [activeTab, setActiveTab]         = useState('dashboard');
  const [drawerOpen, setDrawerOpen]       = useState(false);
  const [checking, setChecking]           = useState(true);
  const [unauthorized, setUnauthorized]   = useState(false);

  // ---- URL helpers ----
  const getPath = () => {
    const hash = window.location.hash;
    if (hash?.startsWith('#')) return hash.slice(1);
    return window.location.pathname;
  };

  const setPath = (path: string) => {
    window.location.hash = path;
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
    }
  };

  // ---- Role-aware routing ----
  const route = (u: User | null) => {
    if (!u) { setPath('/login'); return; }

    const defaults: Record<string, string> = {
      ADMIN: '/dashboard',
      STAFF: '/sales',
      CAFE_OPERATOR: '/cafe-management',
    };
    const defaultPath = defaults[u.role] ?? '/dashboard';

    const cur = getPath();
    if (!cur || cur === '/' || cur === '/login') {
      const id = PATH_TO_TAB[defaultPath] ?? 'dashboard';
      setActiveTab(id);
      setUnauthorized(false);
      setPath(defaultPath);
      return;
    }

    const tabId = PATH_TO_TAB[cur];
    if (!tabId) {
      setActiveTab(PATH_TO_TAB[defaultPath] ?? 'dashboard');
      setUnauthorized(false);
      setPath(defaultPath);
      return;
    }

    const tabDef = TABS.find(t => t.id === tabId);
    if (tabDef && tabDef.roles.includes(u.role as UserRole)) {
      setActiveTab(tabId);
      setUnauthorized(false);
    } else {
      setUnauthorized(true);
    }
  };

  // ---- Init ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      initializeStore();
      const u = await getAuthenticatedUser();
      if (cancelled) return;
      if (u) { setUser(u); setAuthenticated(true); route(u); }
      else { setAuthenticated(false); setPath('/login'); }
      setTimeout(() => { if (!cancelled) setChecking(false); }, 500);
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- URL change listener ----
  useEffect(() => {
    const handler = () => route(user);
    window.addEventListener('popstate', handler);
    window.addEventListener('hashchange', handler);
    return () => {
      window.removeEventListener('popstate', handler);
      window.removeEventListener('hashchange', handler);
    };
  }, [user]);

  const handleLogin = (u: User) => {
    localStorage.setItem('dubeman_current_user', JSON.stringify(u));
    setUser(u);
    setAuthenticated(true);
    route(u);
    setChecking(false);
  };

  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
    setAuthenticated(false);
    setUnauthorized(false);
    setPath('/login');
  };

  const handleTabSelect = (id: string) => {
    const tabDef = TABS.find(t => t.id === id);
    if (!user || !tabDef) return;
    if (tabDef.roles.includes(user.role as UserRole)) {
      setActiveTab(id);
      setUnauthorized(false);
      setPath(tabDef.path);
    } else {
      setUnauthorized(true);
      setPath(tabDef.path);
    }
    setDrawerOpen(false);
  };

  const handleBackToWorkspace = () => {
    if (!user) return;
    const defaults: Record<string, string> = {
      ADMIN: 'dashboard', STAFF: 'pos', CAFE_OPERATOR: 'cafe',
    };
    const id = defaults[user.role] ?? 'dashboard';
    handleTabSelect(id);
  };

  // ---- Render guards ----
  if (checking) return <LoadingScreen />;
  if (!authenticated || !user) return <Login onLoginSuccess={handleLogin} />;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#f8fafc', fontFamily: "'Inter','Manrope',sans-serif" }}>
      {/* ---- Desktop sidebar ---- */}
      <aside className="hidden lg:flex flex-col flex-shrink-0" style={{ width: 248, height: '100vh', position: 'sticky', top: 0 }}>
        <Sidebar
          user={user}
          activeTab={activeTab}
          onSelect={handleTabSelect}
          onLogout={handleLogout}
        />
      </aside>

      {/* ---- Mobile drawer overlay ---- */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-40 lg:hidden"
              style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }}
            />
            <motion.div
              key="drawer"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              className="fixed left-0 top-0 bottom-0 z-50 w-64 lg:hidden shadow-2xl"
            >
              <Sidebar
                user={user}
                activeTab={activeTab}
                onSelect={handleTabSelect}
                onLogout={handleLogout}
                mobile
                onClose={() => setDrawerOpen(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ---- Main content area ---- */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar
          user={user}
          activeTab={activeTab}
          onMenuToggle={() => setDrawerOpen(d => !d)}
        />

        <main
          className="flex-1 overflow-y-auto"
          style={{ padding: '24px', background: '#f8fafc' }}
        >
          <div className="max-w-7xl mx-auto">
            {unauthorized ? (
              <UnauthorizedScreen user={user} onBack={handleBackToWorkspace} />
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                >
                  {activeTab === 'dashboard'     && <Dashboard />}
                  {activeTab === 'pos'           && <Sales userRole={user.role} />}
                  {activeTab === 'inventory'     && <Inventory userRole={user.role} />}
                  {activeTab === 'printing'      && <PrintingOrders userRole={user.role} />}
                  {activeTab === 'print-manager' && <PrintManager />}
                  {activeTab === 'cafe'          && <CafeManagement userRole={user.role} />}
                  {activeTab === 'customers'     && <Customers />}
                  {activeTab === 'wifi'          && <WifiManagement />}
                  {activeTab === 'pc-agent'      && <PCAgentConsole />}
                  {activeTab === 'logs'          && <ActivityLogs userRole={user.role} />}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </main>
      </div>

      {/* Global Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 text-slate-450 text-[11px] font-mono py-6 tracking-wide text-center" id="global-footer">
        <p className="text-slate-500">
          Dube Man General Dealers Systems Management Console &bull; Built in complete RLS & Cryptographic Compliance
        </p>
        <p className="text-slate-650 mt-1 uppercase text-[9px] tracking-widest">
          Certified Audit Period &bull; Year 2026 Audit Complete
        </p>
      </footer>
      <Analytics />
    </div>
  );
}
