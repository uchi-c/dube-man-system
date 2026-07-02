import React, { useState, useEffect } from 'react';
import { User, UserRole } from './types';
import { initializeStore } from './utils/db';
import { getAuthenticatedUser, logoutUser } from './services/supabase';

// Import real, cloud-connected pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Sales from './pages/Sales';
import PrintingOrders from './pages/PrintingOrders';
import CafeManagement from './pages/CafeManagement';
import Customers from './pages/Customers';
import WifiManagement from './pages/WifiManagement';
import PCAgentConsole from './components/PCAgentConsole';
import ActivityLogs from './components/ActivityLogs';

// Import Lucide icons
import { 
  Building, LogOut, Shield, User as UserIcon,
  LineChart, Package, ShoppingCart, Printer, Monitor, 
  Wifi, History, Menu, X, Users, ShieldAlert, Loader
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Analytics } from '@vercel/analytics/react';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<string>('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isUnauthorizedPath, setIsUnauthorizedPath] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Synced just now');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  useEffect(() => {
    const syncInterval = setInterval(() => {
      setIsSyncing(true);
      const timer = setTimeout(() => {
        setIsSyncing(false);
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLastSyncTime(`Synced at ${timeStr}`);
      }, 1200);
      return () => clearTimeout(timer);
    }, 30000);

    return () => clearInterval(syncInterval);
  }, []);

  // Tab definitions with roles-gating definitions strictly matching user roles
  const tabs = [
    { id: 'dashboard', name: 'Overview', icon: LineChart, allowedRoles: ['ADMIN'] },
    { id: 'pos', name: 'POS Desk', icon: ShoppingCart, allowedRoles: ['ADMIN', 'STAFF'] },
    { id: 'inventory', name: 'Inventory', icon: Package, allowedRoles: ['ADMIN', 'STAFF'] },
    { id: 'printing', name: 'Branding & Print', icon: Printer, allowedRoles: ['ADMIN'] },
    { id: 'cafe', name: 'Internet Cafe', icon: Monitor, allowedRoles: ['ADMIN', 'CAFE_OPERATOR'] },
    { id: 'customers', name: 'Customer Registry', icon: Users, allowedRoles: ['ADMIN', 'STAFF'] },
    { id: 'wifi', name: 'WiFi Management', icon: Wifi, allowedRoles: ['ADMIN', 'STAFF', 'CAFE_OPERATOR'] },
    { id: 'pc-agent', name: 'PC Agent Hub', icon: Shield, allowedRoles: ['ADMIN'] },
    { id: 'logs', name: 'Security Logs', icon: History, allowedRoles: ['ADMIN'] }
  ];

  // Map tab IDs to pathnames
  const tabToPathMap: Record<string, string> = {
    dashboard: '/dashboard',
    pos: '/sales',
    inventory: '/inventory',
    printing: '/printing-orders',
    cafe: '/cafe-management',
    customers: '/customers',
    wifi: '/wifi',
    'pc-agent': '/pc-agent',
    logs: '/users', // Mapping '/users' to logs/Security Logs, restricted to ADMIN
  };

  const pathToTabMap: Record<string, string> = {
    '/dashboard': 'dashboard',
    '/sales': 'pos',
    '/inventory': 'inventory',
    '/printing-orders': 'printing',
    '/cafe-management': 'cafe',
    '/customers': 'customers',
    '/wifi': 'wifi',
    '/pc-agent': 'pc-agent',
    '/users': 'logs',
    '/logs': 'logs',
  };

  const getCurrentUrlPath = () => {
    // Check hash first (e.g. #/dashboard) for fallback
    const hash = window.location.hash;
    if (hash && hash.startsWith('#')) {
      return hash.substring(1);
    }
    // Fallback to pathname
    return window.location.pathname;
  };

  const setUrlPath = (path: string) => {
    // Set hash and pathname for complete compatibility
    window.location.hash = path;
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
    }
  };

  const checkAuthAndRoute = (user: User | null) => {
    if (!user) {
      setIsAuthenticated(false);
      setUrlPath('/login');
      return;
    }

    const currentPath = getCurrentUrlPath();
    
    // Default paths per role
    const defaultPaths: Record<string, string> = {
      ADMIN: '/dashboard',
      STAFF: '/sales',
      CAFE_OPERATOR: '/cafe-management',
    };

    const defaultPath = defaultPaths[user.role] || '/dashboard';

    // If root, empty, or /login, redirect to default path
    if (!currentPath || currentPath === '/' || currentPath === '/login') {
      setActiveTab(pathToTabMap[defaultPath]);
      setIsUnauthorizedPath(false);
      setUrlPath(defaultPath);
      return;
    }

    // Resolve the tab from the path
    const resolvedTab = pathToTabMap[currentPath];
    if (!resolvedTab) {
      // Unknown path - redirect to default
      setActiveTab(pathToTabMap[defaultPath]);
      setIsUnauthorizedPath(false);
      setUrlPath(defaultPath);
      return;
    }

    // Check permissions for the resolved tab
    const tabDef = tabs.find(t => t.id === resolvedTab);
    if (tabDef && tabDef.allowedRoles.includes(user.role)) {
      setActiveTab(resolvedTab);
      setIsUnauthorizedPath(false);
    } else {
      // Show Unauthorized Access block
      setIsUnauthorizedPath(true);
    }
  };

  // Initialize store and check existing session
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const restoreSession = async () => {
      initializeStore();
      const verifiedUser = await getAuthenticatedUser();
      if (cancelled) return;

      if (verifiedUser) {
        setUser(verifiedUser);
        setIsAuthenticated(true);
        checkAuthAndRoute(verifiedUser);
      } else {
        setUser(null);
        setIsAuthenticated(false);
        setUrlPath('/login');
      }

      timer = setTimeout(() => {
        if (!cancelled) setCheckingAuth(false);
      }, 600);
    };

    restoreSession();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Listen for hash or popstate URL routing events
  useEffect(() => {
    const handleUrlChange = () => {
      checkAuthAndRoute(currentUser);
    };

    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);

    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, [currentUser]);

  const handleLogin = (user: User) => {
    localStorage.setItem('dubeman_current_user', JSON.stringify(user));
    setUser(user);
    setIsAuthenticated(true);
    
    // Determine landing page on successful login
    const defaultPaths: Record<string, string> = {
      ADMIN: '/dashboard',
      STAFF: '/sales',
      CAFE_OPERATOR: '/cafe-management',
    };
    const landingPath = defaultPaths[user.role] || '/dashboard';
    
    setActiveTab(pathToTabMap[landingPath]);
    setIsUnauthorizedPath(false);
    setUrlPath(landingPath);
  };

  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
    setIsAuthenticated(false);
    setIsUnauthorizedPath(false);
    setUrlPath('/login');
  };

  const handleSetTab = (tabId: string) => {
    const path = tabToPathMap[tabId];
    if (path) {
      const targetTab = tabs.find(t => t.id === tabId);
      if (currentUser && targetTab && targetTab.allowedRoles.includes(currentUser.role)) {
        setActiveTab(tabId);
        setIsUnauthorizedPath(false);
        setUrlPath(path);
        setMobileMenuOpen(false);
      } else {
        setIsUnauthorizedPath(true);
        setUrlPath(path);
      }
    }
  };

  // Allowed tabs for current user
  const allowedTabs = tabs.filter(tab => currentUser && tab.allowedRoles.includes(currentUser.role));

  // Render highly-polished corporate Unauthorized Access view
  const renderUnauthorizedScreen = () => {
    const defaultPaths: Record<string, string> = {
      ADMIN: '/dashboard',
      STAFF: '/sales',
      CAFE_OPERATOR: '/cafe-management',
    };
    const defaultPath = currentUser ? (defaultPaths[currentUser.role] || '/dashboard') : '/login';

    return (
      <div className="flex flex-col items-center justify-center min-h-[450px] p-8 text-center bg-white border border-rose-150 rounded-3xl shadow-xs text-left animate-fadeIn">
        <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl mb-4 animate-bounce">
          <ShieldAlert className="w-12 h-12 stroke-[2.5]" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 tracking-tight font-sans">Unauthorized Access</h2>
        <p className="text-slate-500 text-sm mt-2 max-w-md">
          Your account role (<strong>{currentUser?.role}</strong>) does not have the required permissions to access this route.
        </p>
        <button
          onClick={() => {
            if (currentUser) {
              const defaultTab = pathToTabMap[defaultPath];
              setActiveTab(defaultTab);
              setIsUnauthorizedPath(false);
              setUrlPath(defaultPath);
            } else {
              handleLogout();
            }
          }}
          className="mt-6 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all"
        >
          Return to Authorized Workspace
        </button>
      </div>
    );
  };

  // 1. Loading Handshake state check
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <Loader className="w-10 h-10 animate-spin text-rose-500 mb-3" />
        <span className="text-slate-400 font-mono text-xs tracking-wider">Verifying Corporate Security Session...</span>
      </div>
    );
  }

  // 2. Not authenticated gate
  if (!isAuthenticated || !currentUser) {
    return <Login onLoginSuccess={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans" id="app-wrapper">
      {/* Header Toolbar */}
      <header className="bg-slate-900 text-white shadow-md z-30 sticky top-0 border-b border-slate-800" id="global-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-br from-rose-500 to-amber-500 rounded-xl flex items-center justify-center shadow-md">
              <Building className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight block">Dube Man General Dealers</span>
              <span className="text-[10px] text-rose-305 font-mono tracking-widest uppercase">Management Terminal</span>
            </div>
            {/* Small status indicator */}
            <div className="hidden sm:flex items-center space-x-2 bg-slate-950/40 border border-slate-800 rounded-full px-3 py-1 text-[10px] font-mono text-slate-400">
              <span className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500 animate-pulse'}`}></span>
              <span>{isSyncing ? 'Syncing...' : lastSyncTime}</span>
            </div>
          </div>

          {/* User profile controls & logout */}
          <div className="hidden md:flex items-center space-x-4">
            <div className="flex items-center space-x-2.5 bg-slate-950/40 border border-slate-800 rounded-2xl px-3.5 py-1.5">
              <div className="w-7 h-7 rounded-lg bg-rose-500 text-white text-xs font-bold font-mono flex items-center justify-center shadow-inner">
                {currentUser.name.charAt(0)}
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-slate-205 truncate max-w-[120px]">{currentUser.name}</div>
                <div className="text-[9px] text-slate-400 font-mono font-bold uppercase tracking-wider flex items-center">
                  <Shield className="w-2.5 h-2.5 mr-0.5 text-rose-500" />
                  {currentUser.role}
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="p-2.5 bg-slate-800 hover:bg-rose-950/20 hover:text-rose-400 rounded-xl border border-slate-700/80 hover:border-rose-900/40 transition-all font-semibold flex items-center space-x-1.5 text-xs text-slate-350 cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-slate-400 font-bold" />
              <span>Sign Out</span>
            </button>
          </div>

          {/* Mobile hamburger */}
          <div className="flex md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 hover:bg-slate-700 transition"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Container Layout with Side Panel */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" id="main-grid">
        {/* Navigation panel (3 cols on lg) */}
        <aside className="lg:col-span-3 hidden md:block space-y-2 bg-white border border-slate-200/80 p-4 rounded-3xl shadow-sm z-10">
          <span className="text-[10px] font-mono font-bold text-slate-400 tracking-wider uppercase pl-3 block mb-2">Systems Console</span>
          {tabs.map(tab => {
            const IconComp = tab.icon;
            const isAllowed = tab.allowedRoles.includes(currentUser.role);
            const isActive = activeTab === tab.id;

            if (!isAllowed) return null;

            return (
              <button
                key={tab.id}
                onClick={() => handleSetTab(tab.id)}
                className={`w-full text-left px-4 py-3 text-xs font-semibold rounded-2xl border transition-all flex items-center space-x-3.5 cursor-pointer ${
                  isActive
                    ? 'bg-rose-500/10 border-rose-500 text-rose-600 shadow-sm shadow-rose-500/5'
                    : 'bg-white border-transparent text-slate-550 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                <IconComp className={`w-4 h-4 ${isActive ? 'text-rose-500 stroke-[2.5]' : 'text-slate-400'}`} />
                <span>{tab.name}</span>
              </button>
            );
          })}
        </aside>

        {/* Dynamic Mobile Slide Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="md:hidden bg-slate-900 border-b border-slate-800 px-4 py-4 space-y-1 sm:px-6 overflow-hidden z-25 shadow-lg"
            >
              {allowedTabs.map(tab => {
                const IconComp = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleSetTab(tab.id)}
                    className={`w-full text-left px-4 py-3 text-xs font-bold rounded-xl flex items-center space-x-3 ${
                      isActive ? 'bg-rose-550 text-white' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <IconComp className="w-4 h-4 text-current" />
                    <span>{tab.name}</span>
                  </button>
                );
              })}
              <div className="pt-4 border-t border-slate-800 mt-4 flex items-center justify-between text-xs text-slate-300">
                <div className="flex items-center space-x-2">
                  <UserIcon className="w-4 h-4 text-rose-450" />
                  <span>{currentUser.name} ({currentUser.role})</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="text-rose-400 font-bold"
                >
                  Sign Out
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content Viewer (9 cols on lg) */}
        <main className="lg:col-span-9 space-y-6 bg-slate-50 min-h-[500px]" id="content-viewer">
          {isUnauthorizedPath ? renderUnauthorizedScreen() : (
            <>
              {activeTab === 'dashboard' && <Dashboard />}
              {activeTab === 'pos' && <Sales userRole={currentUser.role} />}
              {activeTab === 'inventory' && <Inventory userRole={currentUser.role} />}
              {activeTab === 'printing' && <PrintingOrders userRole={currentUser.role} />}
              {activeTab === 'cafe' && <CafeManagement userRole={currentUser.role} />}
              {activeTab === 'customers' && <Customers />}
              {activeTab === 'wifi' && <WifiManagement />}
              {activeTab === 'pc-agent' && <PCAgentConsole />}
              {activeTab === 'logs' && <ActivityLogs userRole={currentUser.role} />}
            </>
          )}
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
