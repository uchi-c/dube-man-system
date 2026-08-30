import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { User, UserRole, BusinessType } from './types';
import { initializeStore } from './utils/db';
import { getAuthenticatedUser, logoutUser, supabase } from './services/supabase';
import { getCurrentOrganizationBusinessType, fetchUserOrganizations } from './services/organizations';
import ErrorBoundary from './components/ErrorBoundary';
import InstallAppButton from './components/InstallAppButton';

// LandingPage, Login, Signup and ResetPassword are needed for first paint
// (pre-auth), so keep them eager.
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ResetPassword from './pages/ResetPassword';

// Authenticated pages are code-split so they load on demand,
// keeping the initial bundle small.
const Dashboard      = lazy(() => import('./pages/Dashboard'));
const PharmacyDashboard = lazy(() => import('./pages/PharmacyDashboard'));
const Inventory      = lazy(() => import('./pages/Inventory'));
const Sales          = lazy(() => import('./pages/Sales'));
const PrintingOrders = lazy(() => import('./pages/PrintingOrders'));
const CafeManagement = lazy(() => import('./pages/CafeManagement'));
const Customers      = lazy(() => import('./pages/Customers'));
const WifiManagement = lazy(() => import('./pages/WifiManagement'));
const PrintManager   = lazy(() => import('./pages/PrintManager'));
const Pharmacy       = lazy(() => import('./pages/Pharmacy'));
const PCAgentConsole = lazy(() => import('./components/PCAgentConsole'));
const ActivityLogs   = lazy(() => import('./components/ActivityLogs'));
const Team           = lazy(() => import('./pages/Team'));
const TenantsAdmin   = lazy(() => import('./pages/TenantsAdmin'));

import {
  LayoutDashboard, Package, ShoppingCart, Printer, Monitor,
  Wifi, History, Users, Shield, LogOut, Menu, X,
  RefreshCw, PrinterIcon, ChevronRight, Bell, Pill, UserPlus, Building2,
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
  /** Ignores `roles` and business-type module gating entirely — visible
   *  and reachable only when the signed-in user is a platform admin
   *  (see User.is_platform_admin), regardless of their per-org role. */
  platformOnly?: boolean;
}

const TABS: TabDef[] = [
  // Home
  { id: 'dashboard',     label: 'Overview',        icon: LayoutDashboard, group: 'Home',       path: '/dashboard',     roles: ['ADMIN','STAFF'] },
  // Operations
  { id: 'pos',           label: 'POS & Sales',      icon: ShoppingCart,    group: 'Operations', path: '/sales',         roles: ['ADMIN','STAFF'] },
  { id: 'inventory',     label: 'Inventory',        icon: Package,         group: 'Operations', path: '/inventory',     roles: ['ADMIN','STAFF'] },
  { id: 'customers',     label: 'Customers',        icon: Users,           group: 'Operations', path: '/customers',     roles: ['ADMIN','STAFF'] },
  { id: 'pharmacy',      label: 'Pharmacy',         icon: Pill,            group: 'Operations', path: '/pharmacy',      roles: ['ADMIN','STAFF'] },
  // Printing
  { id: 'print-manager', label: 'Print Manager',    icon: PrinterIcon,     group: 'Printing',   path: '/print-manager', roles: ['ADMIN','STAFF','CAFE_OPERATOR'] },
  { id: 'printing',      label: 'Branding & Orders',icon: Printer,         group: 'Printing',   path: '/printing-orders',roles: ['ADMIN','STAFF','CAFE_OPERATOR'] },
  // Connectivity
  { id: 'cafe',          label: 'Internet Café',    icon: Monitor,         group: 'Connectivity',path: '/cafe-management',roles: ['ADMIN','CAFE_OPERATOR'] },
  { id: 'wifi',          label: 'WiFi Management',  icon: Wifi,            group: 'Connectivity',path: '/wifi',          roles: ['ADMIN','STAFF','CAFE_OPERATOR'] },
  // System
  { id: 'pc-agent',      label: 'PC Agent Hub',     icon: Shield,          group: 'System',     path: '/pc-agent',      roles: ['ADMIN'] },
  { id: 'logs',          label: 'Security Logs',    icon: History,         group: 'System',     path: '/logs',          roles: ['ADMIN'] },
  { id: 'team',          label: 'Team',             icon: UserPlus,        group: 'System',     path: '/team',          roles: ['ADMIN'] },
  // Platform (platform admins only — see TabDef.platformOnly)
  { id: 'tenants',       label: 'Tenants',          icon: Building2,       group: 'Platform',   path: '/tenants',       roles: [], platformOnly: true },
];

const PATH_TO_TAB: Record<string, string> = Object.fromEntries(
  TABS.map(t => [t.path, t.id])
);
PATH_TO_TAB['/users'] = 'logs'; // legacy alias

const GROUP_ORDER = ['Home','Operations','Printing','Connectivity','System','Platform'];

// Which nav modules each business type sees. 'general' shows everything
// except Pharmacy — a general dealer has no use for prescription/dispensing
// tracking, so it stays out of that nav by default the same way niche types
// hide modules irrelevant to them. Computed from TABS (rather than hardcoded)
// so any tab added later is included for 'general' automatically.
const BUSINESS_TYPE_MODULES: Record<BusinessType, string[] | null> = {
  general:  TABS.map(t => t.id).filter(id => id !== 'pharmacy'),
  pharmacy: ['dashboard', 'pos', 'inventory', 'customers', 'pharmacy', 'team'],
  cafe:     ['dashboard', 'print-manager', 'printing', 'team'],
  printing: ['dashboard', 'print-manager', 'printing', 'team'],
  retail:   ['dashboard', 'pos', 'inventory', 'customers', 'team'],
};

// Role-based landing paths.
const ROLE_DEFAULT_PATH: Record<string, string> = {
  ADMIN: '/dashboard',
  STAFF: '/sales',
  CAFE_OPERATOR: '/cafe-management',
};
// Preferred landing path per role, falling back to the first tab that's
// actually reachable for this org's business type — e.g. a 'cafe'-type org
// scoped down to printing-only no longer has '/cafe-management', so a
// CAFE_OPERATOR there lands on Print Manager instead.
// hasOrg/isPlatformAdmin: a user with zero organization memberships (so
// far, only a platform admin who's been deliberately taken off every
// tenant's staff) can't reach any of the normal per-org tabs below --
// they'd all error out fetching organization-scoped data. Route them
// straight to Tenants instead of a tab that will just show Unauthorized.
function defaultPathFor(role: string, businessType: BusinessType, hasOrg: boolean, isPlatformAdmin: boolean): string {
  if (!hasOrg) return isPlatformAdmin ? '/tenants' : '/dashboard';

  const allowedModules = BUSINESS_TYPE_MODULES[businessType];
  const reachable = (tab: TabDef) =>
    tab.roles.includes(role as UserRole) && (!allowedModules || allowedModules.includes(tab.id));

  const preferred = ROLE_DEFAULT_PATH[role];
  const preferredTab = preferred && TABS.find(t => t.path === preferred);
  if (preferredTab && reachable(preferredTab)) return preferred;

  return TABS.find(reachable)?.path ?? '/dashboard';
}

// ---- Brand mark ------------------------------------------------------------

function BrandMark({ size = 34 }: { size?: number; radius?: number; font?: number }) {
  return (
    <img
      src="/logo-mark.png"
      alt="Uruu OS"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }}
    />
  );
}

// ---- Role labels -----------------------------------------------------------

const ROLE_BADGE: Record<string, string> = {
  ADMIN: 'Owner',
  STAFF: 'Staff Operator',
  CAFE_OPERATOR: 'Café Desk',
};

// A platform admin's badge reflects that cross-tenant capability instead
// of their (often irrelevant, or absent-org) per-tenant role -- see
// User.is_platform_admin.
function RoleBadge({ user }: { user: User }) {
  if (user.is_platform_admin) return <span className="dm-badge dm-badge-warning">Platform Admin</span>;
  return <span className="dm-badge dm-badge-info">{ROLE_BADGE[user.role] ?? user.role}</span>;
}

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: 9,
        background: 'rgba(76,111,255,0.18)',
        border: '1px solid rgba(76,111,255,0.30)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: size * 0.4, fontWeight: 700, color: '#7B93FF', fontFamily: "'Space Grotesk',sans-serif" }}>
        {name.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

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
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={{
        background: syncing ? 'var(--warning-bg)' : 'var(--success-bg)',
        border: `1px solid ${syncing ? 'rgba(255,176,32,0.28)' : 'rgba(61,220,151,0.28)'}`,
        fontSize: '0.6875rem', fontWeight: 600,
        color: syncing ? 'var(--warning)' : 'var(--success)',
      }}
      title={syncing ? 'Sync in progress' : 'Data is up to date'}
    >
      <span className={`dm-dot ${syncing ? 'dm-dot-warning' : 'dm-dot-success dm-dot-pulse'}`} />
      <span className="dm-nums">{label}</span>
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
      <div className="dm-label" style={{ padding: '0.25rem 0.85rem', marginTop: '0.75rem' }}>
        {group}
      </div>
      {tabs.map(tab => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={`dm-nav-item ${active ? 'active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon style={{ width: 16, height: 16, flexShrink: 0, color: active ? '#7B93FF' : '#8A93BE' }} />
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
  businessType: BusinessType;
  hasOrg: boolean;
  activeTab: string;
  onSelect: (id: string) => void;
  onLogout: () => void;
  mobile?: boolean;
  onClose?: () => void;
}

function Sidebar({ user, businessType, hasOrg, activeTab, onSelect, onLogout, mobile, onClose }: SidebarProps) {
  const allowedModules = BUSINESS_TYPE_MODULES[businessType];
  const visibleTabs = TABS
    .filter(t => t.platformOnly ? !!user.is_platform_admin : hasOrg && t.roles.includes(user.role as UserRole))
    .filter(t => t.platformOnly || !allowedModules || allowedModules.includes(t.id));
  const grouped = GROUP_ORDER.map(g => ({
    group: g,
    tabs: visibleTabs.filter(t => t.group === g),
  }));

  const handleSelect = (id: string) => {
    onSelect(id);
    onClose?.();
  };

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: 'var(--bg-1)',
        borderRight: '1px solid var(--panel-line)',
        width: mobile ? '100%' : 'var(--rail-width)',
        minHeight: '100%',
      }}
    >
      {/* Brand slot */}
      <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--panel-line)' }}>
        <BrandMark />
        <div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: '15px', color: 'var(--text-hi)', letterSpacing: '-0.02em' }}>
            Uruu
          </div>
          <div className="dm-label" style={{ padding: 0 }}>OS</div>
        </div>
        {mobile && (
          <button onClick={onClose} className="dm-icon-btn ml-auto" style={{ width: 34, height: 34 }} aria-label="Close navigation">
            <X style={{ width: 16, height: 16 }} />
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
      <div className="px-4 py-3" style={{ borderTop: '1px solid var(--panel-line)' }}>
        <div className="flex items-center gap-2.5 mb-3">
          <Avatar name={user.name} />
          <div className="min-w-0">
            <div className="dm-truncate" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-hi)' }}>
              {user.name}
            </div>
            <div style={{ marginTop: 2 }}><RoleBadge user={user} /></div>
          </div>
        </div>
        <button onClick={onLogout} className="dm-btn dm-btn-danger w-full" style={{ minHeight: 40 }}>
          <LogOut style={{ width: 14, height: 14 }} />
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
  const crumbs = tab ? [tab.group, tab.label] : ['Uruu OS'];

  return (
    <header
      className="flex items-center justify-between px-5 lg:px-6"
      style={{
        height: 'var(--topbar-h)',
        background: 'rgba(12,19,56,0.75)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--panel-line)',
        position: 'sticky',
        top: 0,
        zIndex: 30,
        flexShrink: 0,
      }}
    >
      {/* Left: hamburger + breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuToggle}
          className="dm-icon-btn lg:hidden"
          style={{ width: 40, height: 40 }}
          aria-label="Open navigation"
        >
          <Menu style={{ width: 16, height: 16 }} />
        </button>
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 min-w-0" aria-label="Breadcrumb">
          <span style={{ fontSize: '0.75rem', color: 'var(--text-low)', fontWeight: 500 }}>{crumbs[0]}</span>
          {crumbs.length > 1 && (
            <>
              <ChevronRight style={{ width: 12, height: 12, color: 'var(--text-low)' }} />
              <span className="dm-truncate" style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-hi)' }}>{crumbs[1]}</span>
            </>
          )}
        </nav>
      </div>

      {/* Right: install + sync + notifications + user chip */}
      <div className="flex items-center gap-2.5">
        <InstallAppButton compact />
        <div className="hidden sm:block"><SyncIndicator /></div>

        <button className="dm-icon-btn" style={{ width: 40, height: 40 }} aria-label="Notifications">
          <Bell style={{ width: 16, height: 16 }} />
        </button>

        {/* User chip — desktop only */}
        <div
          className="hidden sm:flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--panel-line)' }}
        >
          <Avatar name={user.name} size={26} />
          <div className="flex flex-col leading-tight">
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-hi)' }}>{user.name}</span>
          </div>
          <RoleBadge user={user} />
        </div>
      </div>
    </header>
  );
}

// ---- Unauthorized screen ---------------------------------------------------

function UnauthorizedScreen({ user, onBack }: { user: User; onBack: () => void }) {
  return (
    <div className="dm-glow flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
      <div
        className="w-14 h-14 rounded-2xl mb-4 flex items-center justify-center"
        style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,107,107,0.30)' }}
      >
        <Shield style={{ width: 24, height: 24, color: 'var(--danger)' }} />
      </div>
      <h2 className="dm-h1">Access restricted</h2>
      <p style={{ color: 'var(--text-mid)', fontSize: '0.875rem', marginTop: 8, maxWidth: 360 }}>
        Your role (<strong style={{ color: 'var(--text-hi)' }}>{ROLE_BADGE[user.role] ?? user.role}</strong>) can't open this section. Head back to your workspace.
      </p>
      <button onClick={onBack} className="dm-btn dm-btn-primary mt-6">
        Return to workspace
      </button>
    </div>
  );
}

// Shown when someone opens an invite link while already signed in as a
// different session. Without this, the app's normal "authenticated? go
// straight to the dashboard" guard would silently swallow the invite and
// just show whoever is currently logged in -- indistinguishable from the
// link "just going to admin" with no explanation.
function InviteWhileSignedInScreen({ user, onSignOut, onDismiss }: { user: User; onSignOut: () => void; onDismiss: () => void }) {
  return (
    <div className="dm-glow flex flex-col items-center justify-center min-h-screen text-center p-8">
      <div
        className="w-14 h-14 rounded-2xl mb-4 flex items-center justify-center"
        style={{ background: 'var(--warning-bg)', border: '1px solid rgba(255,176,32,0.30)' }}
      >
        <UserPlus style={{ width: 24, height: 24, color: 'var(--warning)' }} />
      </div>
      <h2 className="dm-h1">You're already signed in</h2>
      <p style={{ color: 'var(--text-mid)', fontSize: '0.875rem', marginTop: 8, maxWidth: 380 }}>
        This browser is signed in as <strong style={{ color: 'var(--text-hi)' }}>{user.email}</strong>. To accept this
        invite as a different account, sign out first — otherwise you'll just keep using your current one.
      </p>
      <div className="flex gap-3 mt-6">
        <button onClick={onDismiss} className="dm-btn dm-btn-ghost">
          Stay signed in as {user.name}
        </button>
        <button onClick={onSignOut} className="dm-btn dm-btn-primary">
          <LogOut style={{ width: 15, height: 15 }} /> Sign out to accept invite
        </button>
      </div>
    </div>
  );
}

// ---- Lazy page fallback ----------------------------------------------------

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-24" style={{ color: 'var(--text-low)' }}>
      <RefreshCw className="dm-spin" style={{ width: 18, height: 18, marginRight: 8 }} />
      <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>Loading…</span>
    </div>
  );
}

// ---- Loading screen --------------------------------------------------------

function LoadingScreen() {
  return (
    <div className="dm-app-bg dm-glow min-h-screen flex flex-col items-center justify-center">
      <div style={{ marginBottom: 18 }}><BrandMark size={52} radius={16} font={20} /></div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[0, 1, 2].map(i => (
          <div
            key={i}
            style={{
              width: 7, height: 7, borderRadius: '50%', background: '#4C6FFF',
              animation: `dm-fade-up 0.8s ${i * 0.2}s ease-in-out infinite alternate`,
              opacity: 0.5,
            }}
          />
        ))}
      </div>
      <span style={{ color: 'var(--text-low)', fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.05em' }}>
        Starting Uruu OS…
      </span>
    </div>
  );
}

// ---- Page renderer ---------------------------------------------------------

function renderPage(id: string, role: string, businessType: BusinessType) {
  switch (id) {
    // Pharmacy gets its own Overview -- the generic one leads with café
    // sessions and print orders, which don't apply to a pharmacy-only org.
    case 'dashboard':     return businessType === 'pharmacy' ? <PharmacyDashboard /> : <Dashboard />;
    case 'pos':           return <Sales userRole={role} />;
    case 'inventory':     return <Inventory userRole={role} />;
    case 'printing':      return <PrintingOrders userRole={role} />;
    case 'print-manager': return <PrintManager />;
    case 'cafe':          return <CafeManagement userRole={role} />;
    case 'customers':     return <Customers />;
    case 'pharmacy':      return <Pharmacy userRole={role} />;
    case 'wifi':          return <WifiManagement />;
    case 'pc-agent':      return <PCAgentConsole userRole={role} />;
    case 'logs':          return <ActivityLogs userRole={role} />;
    case 'team':          return <Team />;
    case 'tenants':       return <TenantsAdmin />;
    default:              return null;
  }
}

// ---- Per-route frame: role guard + animation + lazy boundary ---------------

function RouteFrame({ tab, user, businessType, hasOrg }: { tab: TabDef; user: User; businessType: BusinessType; hasOrg: boolean }) {
  const navigate = useNavigate();
  const allowedModules = BUSINESS_TYPE_MODULES[businessType];
  const allowed = tab.platformOnly
    ? !!user.is_platform_admin
    : hasOrg && tab.roles.includes(user.role as UserRole) && (!allowedModules || allowedModules.includes(tab.id));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18 }}
    >
      {allowed ? (
        <ErrorBoundary section={tab.label}>
          <Suspense fallback={<PageFallback />}>
            {renderPage(tab.id, user.role, businessType)}
          </Suspense>
        </ErrorBoundary>
      ) : (
        <UnauthorizedScreen user={user} onBack={() => navigate(defaultPathFor(user.role, businessType, hasOrg, !!user.is_platform_admin))} />
      )}
    </motion.div>
  );
}

// ---- Root App --------------------------------------------------------------

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser]                   = useState<User | null>(null);
  const [businessType, setBusinessType]   = useState<BusinessType>('general');
  // Defaults true so normal users (the overwhelming majority, who always
  // belong to at least one org) never see a nav flash/gap while this
  // resolves -- only flips false for someone with zero memberships.
  const [hasOrg, setHasOrg]               = useState(true);
  const [drawerOpen, setDrawerOpen]       = useState(false);
  const [checking, setChecking]           = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  // Reported live: an invite link opened by someone not already signed in
  // just showed the sign-in screen, silently dropping the ?invite= token.
  // Root cause -- authView always defaulted to 'login' with no regard for
  // the URL, so a fresh, unauthenticated page load at #/signup?invite=...
  // never rendered Signup at all. Deriving the initial view from the URL
  // (evaluated once, at mount, which is exactly when a link like this is
  // opened) fixes the common case; the effect below also catches an invite
  // link reached via in-app hash navigation without a full reload.
  //
  // 'landing' is the default for everyone else -- this system is internal
  // only, with no public self-service signup, so the bare domain shows a
  // front page instead of dropping straight into a login form. 'signup'
  // stays reachable ONLY via a token-bearing invite link, never as a
  // general destination anyone can navigate to.
  const [authView, setAuthView] = useState<'landing' | 'login' | 'signup'>(() =>
    location.pathname === '/signup' || new URLSearchParams(location.search).get('invite')
      ? 'signup'
      : 'landing'
  );
  useEffect(() => {
    if (!authenticated && new URLSearchParams(location.search).get('invite')) {
      setAuthView('signup');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, location.search]);

  // The URL is the source of truth; derive the active tab from the path.
  const activeTab = PATH_TO_TAB[location.pathname] ?? '';

  // ---- Init: restore session ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      initializeStore();
      const u = await getAuthenticatedUser();
      if (cancelled) return;
      if (u) {
        setUser(u);
        setAuthenticated(true);
        setMustChangePassword(!!u.must_change_password);
        getCurrentOrganizationBusinessType().then(bt => { if (!cancelled) setBusinessType(bt); });
        fetchUserOrganizations().then(orgs => { if (!cancelled) setHasOrg(orgs.length > 0); });
      } else {
        setAuthenticated(false);
      }
      setTimeout(() => { if (!cancelled) setChecking(false); }, 500);
    })();
    return () => { cancelled = true; };
  }, []);

  // The "reset your password" link emailed from Login's "Forgot password?"
  // establishes a real session so supabase.auth.updateUser() can act on it —
  // which means the bootstrap effect above would otherwise treat that as a
  // normal sign-in and drop the visitor straight into the app instead of
  // letting them set a new password. Listening for PASSWORD_RECOVERY
  // intercepts that and the render guards below check it first.
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleLogin = (u: User) => {
    localStorage.setItem('dubeman_current_user', JSON.stringify(u));
    setUser(u);
    setAuthenticated(true);
    setChecking(false);
    setMustChangePassword(!!u.must_change_password);
    Promise.all([getCurrentOrganizationBusinessType(), fetchUserOrganizations()]).then(([bt, orgs]) => {
      setBusinessType(bt);
      const orgMembership = orgs.length > 0;
      setHasOrg(orgMembership);
      navigate(defaultPathFor(u.role, bt, orgMembership, !!u.is_platform_admin), { replace: true });
    });
  };

  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
    setAuthenticated(false);
    setBusinessType('general');
    setHasOrg(true);
    setMustChangePassword(false);
    navigate('/login', { replace: true });
  };

  const handleTabSelect = (id: string) => {
    const tabDef = TABS.find(t => t.id === id);
    if (tabDef) navigate(tabDef.path);
    setDrawerOpen(false);
  };

  // ---- Render guards ----
  // Checked before `checking`/`authenticated` — a recovery-link visit
  // already carries a valid session, so those would otherwise short-circuit
  // straight past this screen into the main app.
  if (passwordRecovery) {
    return (
      <ResetPassword
        onComplete={u => { setPasswordRecovery(false); handleLogin(u); }}
        onCancel={() => setPasswordRecovery(false)}
      />
    );
  }
  if (checking) return <LoadingScreen />;
  if (!authenticated || !user) {
    if (authView === 'signup') {
      return <Signup onSignupSuccess={handleLogin} onSwitchToLogin={() => setAuthView('login')} />;
    }
    if (authView === 'login') {
      return <Login onLoginSuccess={handleLogin} />;
    }
    return <LandingPage onSignIn={() => setAuthView('login')} />;
  }
  if (mustChangePassword) {
    return (
      <ResetPassword
        mode="forced"
        onComplete={u => { setUser(u); setMustChangePassword(false); }}
        onCancel={handleLogout}
      />
    );
  }
  if (new URLSearchParams(location.search).get('invite')) {
    return (
      <InviteWhileSignedInScreen
        user={user}
        onSignOut={handleLogout}
        onDismiss={() => navigate(location.pathname, { replace: true })}
      />
    );
  }

  const homePath = defaultPathFor(user.role, businessType, hasOrg, !!user.is_platform_admin);

  return (
    <div className="dm-app-bg flex h-screen overflow-hidden" style={{ fontFamily: "'Inter',sans-serif" }}>
      {/* ---- Desktop sidebar ---- */}
      <aside className="hidden lg:flex flex-col flex-shrink-0" style={{ width: 248, height: '100vh', position: 'sticky', top: 0 }}>
        <Sidebar
          user={user}
          businessType={businessType}
          hasOrg={hasOrg}
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
                businessType={businessType}
                hasOrg={hasOrg}
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
          style={{ padding: '24px' }}
        >
          <div className="max-w-7xl mx-auto">
            <AnimatePresence mode="wait">
              <Routes location={location} key={location.pathname}>
                {TABS.map(tab => (
                  <Route key={tab.id} path={tab.path} element={<RouteFrame tab={tab} user={user} businessType={businessType} hasOrg={hasOrg} />} />
                ))}
                {/* Legacy alias + default landings */}
                <Route path="/users" element={<Navigate to="/logs" replace />} />
                <Route path="/login" element={<Navigate to={homePath} replace />} />
                <Route path="/" element={<Navigate to={homePath} replace />} />
                <Route path="*" element={<Navigate to={homePath} replace />} />
              </Routes>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <Analytics />
    </div>
  );
}
