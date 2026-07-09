import React, { useState } from 'react';
import { Mail, Lock, ArrowRight, Loader2, AlertCircle, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { isSupabaseConfigured, loginUser } from '../services/supabase';
import { User } from '../types';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

// ---- African business illustration (pure SVG — no external assets) ----------

function AfricanBusinessIllustration() {
  return (
    <svg
      viewBox="0 0 480 480"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="w-full max-w-sm mx-auto opacity-90"
    >
      <defs>
        <linearGradient id="bg-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#881337" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#e11d48" stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id="blue-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f43f5e" />
          <stop offset="100%" stopColor="#be123c" />
        </linearGradient>
        <linearGradient id="gold-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
        <linearGradient id="emerald-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>

      {/* Background geo pattern — subtle African-inspired diamond grid */}
      {[0,1,2,3,4].map(col => [0,1,2,3,4].map(row => (
        <rect
          key={`${col}-${row}`}
          x={col * 96 + (row % 2 === 0 ? 0 : 48)}
          y={row * 72}
          width={28}
          height={28}
          rx={4}
          fill="#e11d48"
          opacity={0.04 + (col + row) * 0.003}
          transform={`rotate(45 ${col * 96 + (row % 2 === 0 ? 0 : 48) + 14} ${row * 72 + 14})`}
        />
      )))}

      {/* Connection lines between business nodes */}
      <g stroke="#f43f5e" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.25">
        <line x1="120" y1="200" x2="240" y2="150" />
        <line x1="240" y1="150" x2="360" y2="200" />
        <line x1="120" y1="200" x2="200" y2="310" />
        <line x1="360" y1="200" x2="280" y2="310" />
        <line x1="200" y1="310" x2="240" y2="370" />
        <line x1="280" y1="310" x2="240" y2="370" />
      </g>

      {/* Central hub — Dube Man node */}
      <circle cx="240" cy="150" r="42" fill="url(#blue-grad)" opacity="0.12" />
      <circle cx="240" cy="150" r="30" fill="url(#blue-grad)" />
      <text x="240" y="153" textAnchor="middle" fill="white" fontSize="9" fontWeight="800" fontFamily="Manrope,Inter,sans-serif">DUBE</text>
      <text x="240" y="164" textAnchor="middle" fill="white" fontSize="8" fontWeight="600" fontFamily="Manrope,Inter,sans-serif" opacity="0.8">MAN</text>

      {/* Business node 1 — POS / Retail sales */}
      <circle cx="120" cy="200" r="28" fill="white" stroke="#e2e8f0" strokeWidth="1.5" />
      <rect x="108" y="192" width="24" height="16" rx="3" fill="#ffe4e6" />
      <rect x="113" y="192" width="4" height="4" rx="1" fill="#e11d48" />
      <rect x="119" y="192" width="4" height="4" rx="1" fill="#e11d48" />
      <rect x="125" y="192" width="4" height="4" rx="1" fill="#e11d48" />
      <rect x="112" y="200" width="16" height="8" rx="1" fill="#fecdd3" />

      {/* Business node 2 — Printing */}
      <circle cx="360" cy="200" r="28" fill="white" stroke="#e2e8f0" strokeWidth="1.5" />
      <rect x="348" y="192" width="24" height="14" rx="2" fill="#d1fae5" />
      <rect x="352" y="196" width="16" height="6" rx="1" fill="#ffffff" />
      <rect x="352" y="206" width="16" height="8" rx="1" fill="#a7f3d0" />

      {/* Business node 3 — Cyber café */}
      <circle cx="200" cy="310" r="28" fill="white" stroke="#e2e8f0" strokeWidth="1.5" />
      <rect x="187" y="300" width="26" height="18" rx="3" fill="#ede9fe" />
      <rect x="189" y="302" width="22" height="12" rx="1" fill="#c4b5fd" />
      <rect x="195" y="316" width="10" height="2" rx="1" fill="#7c3aed" />

      {/* Business node 4 — Inventory */}
      <circle cx="280" cy="310" r="28" fill="white" stroke="#e2e8f0" strokeWidth="1.5" />
      <rect x="269" y="299" width="22" height="16" rx="2" fill="#fef3c7" stroke="#fbbf24" strokeWidth="1" />
      <line x1="269" y1="307" x2="291" y2="307" stroke="#d97706" strokeWidth="1" />
      <line x1="280" y1="299" x2="280" y2="315" stroke="#d97706" strokeWidth="1" opacity="0.5" />

      {/* Bottom anchor — mobile device */}
      <circle cx="240" cy="370" r="28" fill="white" stroke="#e2e8f0" strokeWidth="1.5" />
      <rect x="230" y="360" width="20" height="28" rx="4" fill="#0f172a" />
      <rect x="232" y="362" width="16" height="20" rx="2" fill="#e11d48" />
      <rect x="237" y="384" width="6" height="2" rx="1" fill="#475569" />

      {/* Floating data packets (small animated dots) */}
      <circle cx="180" cy="175" r="4" fill="#fbbf24" opacity="0.8" />
      <circle cx="300" cy="175" r="3" fill="#10b981" opacity="0.8" />
      <circle cx="155" cy="255" r="3.5" fill="#f43f5e" opacity="0.7" />
      <circle cx="320" cy="255" r="3" fill="#fbbf24" opacity="0.7" />
      <circle cx="240" cy="340" r="3.5" fill="#10b981" opacity="0.8" />

      {/* Stat bubble — "Revenue Up" */}
      <g transform="translate(52, 270)">
        <rect width="88" height="32" rx="10" fill="white" filter="drop-shadow(0 2px 8px rgba(0,0,0,0.10))" />
        <circle cx="16" cy="16" r="10" fill="#d1fae5" />
        <text x="16" y="20" textAnchor="middle" fontSize="10" fill="#059669">↑</text>
        <text x="54" y="13" textAnchor="middle" fontSize="8" fill="#94a3b8" fontFamily="Inter,sans-serif">Revenue</text>
        <text x="54" y="24" textAnchor="middle" fontSize="9" fill="#0f172a" fontWeight="700" fontFamily="Manrope,Inter,sans-serif">+24%</text>
      </g>

      {/* Stat bubble — "Online" */}
      <g transform="translate(338, 270)">
        <rect width="90" height="32" rx="10" fill="white" filter="drop-shadow(0 2px 8px rgba(0,0,0,0.10))" />
        <circle cx="16" cy="16" r="10" fill="#ffe4e6" />
        <circle cx="16" cy="16" r="4" fill="#e11d48" />
        <text x="56" y="13" textAnchor="middle" fontSize="8" fill="#94a3b8" fontFamily="Inter,sans-serif">Stations</text>
        <text x="56" y="24" textAnchor="middle" fontSize="9" fill="#0f172a" fontWeight="700" fontFamily="Manrope,Inter,sans-serif">All Online</text>
      </g>
    </svg>
  );
}

// ---- Demo accounts ----------------------------------------------------------

const DEMO_ACCOUNTS = [
  {
    role: 'ADMIN',
    email: 'admin@dubeman.com',
    password: 'admin123',
    label: 'Owner — Full Access',
    color: '#e11d48',
  },
  {
    role: 'STAFF',
    email: 'staff@dubeman.com',
    password: 'admin123',
    label: 'Staff Operator',
    color: '#059669',
  },
  {
    role: 'CAFE_OPERATOR',
    email: 'cafe@dubeman.com',
    password: 'admin123',
    label: 'Café Desk',
    color: '#7c3aed',
  },
];

// ---- Main component ---------------------------------------------------------

export default function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const user = await loginUser(email.trim(), password);
      if (user) {
        onLoginSuccess(user);
      } else {
        setError('Incorrect email or password. Please try again.');
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const autofill = (acc: typeof DEMO_ACCOUNTS[number]) => {
    setEmail(acc.email);
    setPassword(acc.password);
    setError('');
  };

  return (
    <div
      className="min-h-screen flex"
      style={{ fontFamily: "'Inter','Manrope',sans-serif" }}
      id="login-page"
    >
      {/* ---- Left panel — illustration ---- */}
      <motion.div
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="hidden lg:flex flex-col justify-between w-1/2 relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #0f172a 0%, #881337 60%, #1e293b 100%)' }}
      >
        {/* Geometric background texture */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }} />

        {/* Top brand mark */}
        <div className="relative z-10 p-10">
          <div className="flex items-center space-x-3">
            {/* Logo mark */}
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #e11d48, #7c3aed)' }}
            >
              <span style={{ color: 'white', fontFamily: 'Manrope', fontWeight: 800, fontSize: '14px' }}>DM</span>
            </div>
            <div>
              <div style={{ color: 'white', fontFamily: 'Manrope', fontWeight: 800, fontSize: '18px', letterSpacing: '-0.02em' }}>
                Dube Man
              </div>
              <div style={{ color: 'rgba(148,163,184,0.8)', fontSize: '10px', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Innovation
              </div>
            </div>
          </div>
        </div>

        {/* Central illustration */}
        <div className="relative z-10 flex-1 flex items-center justify-center px-10">
          <div>
            <AfricanBusinessIllustration />
            <div className="text-center mt-6 space-y-2">
              <h2 style={{
                color: 'white',
                fontFamily: 'Manrope',
                fontWeight: 800,
                fontSize: 'clamp(1.4rem, 2.5vw, 1.9rem)',
                letterSpacing: '-0.025em',
                lineHeight: 1.2,
              }}>
                Run Your Cyber Café<br />
                <span style={{ background: 'linear-gradient(90deg, #fb7185, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  & Business Centre
                </span>
              </h2>
              <p style={{ color: 'rgba(148,163,184,0.75)', fontSize: '0.875rem', maxWidth: '320px', margin: '0 auto', lineHeight: 1.6 }}>
                One platform. Every module. Run your business from anywhere.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom trust signals */}
        <div className="relative z-10 p-10">
          <div className="flex items-center gap-6 text-xs" style={{ color: 'rgba(148,163,184,0.55)' }}>
            <span>🔒 End-to-end encrypted</span>
            <span>☁️ Real-time sync</span>
            <span>📱 Mobile-ready</span>
          </div>
        </div>

        {/* Decorative glow orbs */}
        <div className="absolute top-1/4 right-0 w-72 h-72 rounded-full blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(225,29,72,0.20) 0%, transparent 70%)' }} />
        <div className="absolute bottom-1/4 left-0 w-48 h-48 rounded-full blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.18) 0%, transparent 70%)' }} />
      </motion.div>

      {/* ---- Right panel — login form ---- */}
      <div
        className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 overflow-y-auto"
        style={{ background: '#f8fafc' }}
      >
        {/* Mobile brand (shown only when left panel is hidden) */}
        <div className="lg:hidden flex items-center space-x-3 mb-8">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #e11d48, #7c3aed)' }}
          >
            <span style={{ color: 'white', fontFamily: 'Manrope', fontWeight: 800, fontSize: '14px' }}>DM</span>
          </div>
          <span style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: '20px', color: '#0f172a' }}>Dube Man</span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="w-full max-w-[400px] space-y-6"
        >
          {/* Header */}
          <div>
            <h1 style={{
              fontFamily: 'Manrope',
              fontWeight: 800,
              fontSize: '1.75rem',
              letterSpacing: '-0.03em',
              color: '#0f172a',
              lineHeight: 1.2,
            }}>
              Welcome back
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '6px' }}>
              Sign in to your workspace.
            </p>
          </div>

          {/* Glass login card */}
          <div
            className="rounded-2xl p-6 space-y-4"
            style={{
              background: 'white',
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 24px rgba(15,23,42,0.08)',
            }}
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div className="space-y-1.5">
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#374151', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Email Address
                </label>
                <div className="relative">
                  <Mail
                    className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ width: 15, height: 15, color: '#94a3b8' }}
                  />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.625rem 0.875rem 0.625rem 2.25rem',
                      background: '#f8fafc',
                      border: '1.5px solid #e2e8f0',
                      borderRadius: '10px',
                      fontSize: '0.875rem',
                      color: '#0f172a',
                      outline: 'none',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = '#e11d48';
                      e.target.style.boxShadow = '0 0 0 3px rgba(225,29,72,0.12)';
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = '#e2e8f0';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    Password
                  </label>
                  <button
                    type="button"
                    style={{ fontSize: '0.75rem', color: '#e11d48', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock
                    className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ width: 15, height: 15, color: '#94a3b8' }}
                  />
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.625rem 0.875rem 0.625rem 2.25rem',
                      background: '#f8fafc',
                      border: '1.5px solid #e2e8f0',
                      borderRadius: '10px',
                      fontSize: '0.875rem',
                      color: '#0f172a',
                      outline: 'none',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                      fontFamily: 'monospace',
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = '#e11d48';
                      e.target.style.boxShadow = '0 0 0 3px rgba(225,29,72,0.12)';
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = '#e2e8f0';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>

              {/* Error */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center space-x-2 px-3 py-2.5 rounded-xl"
                  style={{ background: '#fff1f2', border: '1px solid #fecdd3', fontSize: '0.8125rem', color: '#be123c' }}
                >
                  <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
                  <span>{error}</span>
                </motion.div>
              )}

              {/* Sign in button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2"
                style={{
                  padding: '0.75rem',
                  background: loading ? '#fda4af' : 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: loading ? 'none' : '0 4px 16px rgba(225,29,72,0.30)',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
              >
                {loading
                  ? <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />
                  : <ArrowRight style={{ width: 16, height: 16 }} />
                }
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div style={{ flex: 1, height: '1px', background: '#f1f5f9' }} />
              <span style={{ fontSize: '0.6875rem', color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>
                DEMO ACCOUNTS
              </span>
              <div style={{ flex: 1, height: '1px', background: '#f1f5f9' }} />
            </div>

            {/* Demo quick-fill */}
            <div className="space-y-2">
              {DEMO_ACCOUNTS.map(acc => (
                <button
                  key={acc.role}
                  type="button"
                  onClick={() => autofill(acc)}
                  className="w-full flex items-center justify-between group"
                  style={{
                    padding: '0.5rem 0.75rem',
                    background: '#f8fafc',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = acc.color;
                    (e.currentTarget as HTMLButtonElement).style.background = '#ffffff';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = '#e2e8f0';
                    (e.currentTarget as HTMLButtonElement).style.background = '#f8fafc';
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: acc.color + '1a',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: acc.color }}>
                        {acc.role.charAt(0)}
                      </span>
                    </div>
                    <div className="text-left">
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0f172a' }}>{acc.label}</div>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'monospace' }}>{acc.email}</div>
                    </div>
                  </div>
                  <ChevronRight style={{ width: 14, height: 14, color: '#cbd5e1' }} />
                </button>
              ))}
            </div>
          </div>

          {/* Footer */}
          <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8' }}>
            {isSupabaseConfigured
              ? 'Connected to your Supabase workspace'
              : 'Running in local demo mode'
            }
          </p>
        </motion.div>
      </div>
    </div>
  );
}
