import React, { useState } from 'react';
import { Mail, Lock, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { isSupabaseConfigured, loginUser } from '../services/supabase';
import { User } from '../types';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

// Sign-in must never hang on a dead connection — cap it and recover.
const LOGIN_TIMEOUT_MS = 12000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Sign-in is taking too long. Check your connection and try again.")), ms),
    ),
  ]);
}

// ---- Product illustration (pure SVG — no external assets) -------------------

function CafeNetworkIllustration() {
  return (
    <svg
      viewBox="0 0 480 480"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="w-full max-w-sm mx-auto"
    >
      <defs>
        <linearGradient id="blue-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7B93FF" />
          <stop offset="100%" stopColor="#4C6FFF" />
        </linearGradient>
      </defs>

      {/* Connection lines between nodes */}
      <g stroke="#4C6FFF" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.4">
        <line x1="120" y1="200" x2="240" y2="150" />
        <line x1="240" y1="150" x2="360" y2="200" />
        <line x1="120" y1="200" x2="200" y2="310" />
        <line x1="360" y1="200" x2="280" y2="310" />
        <line x1="200" y1="310" x2="240" y2="370" />
        <line x1="280" y1="310" x2="240" y2="370" />
      </g>

      {/* Central hub — CaféOS node */}
      <circle cx="240" cy="150" r="42" fill="#4C6FFF" opacity="0.15" />
      <circle cx="240" cy="150" r="30" fill="url(#blue-grad)" />
      <text x="240" y="153" textAnchor="middle" fill="white" fontSize="9" fontWeight="700" fontFamily="'Space Grotesk',Inter,sans-serif">CAFÉ</text>
      <text x="240" y="164" textAnchor="middle" fill="white" fontSize="8" fontWeight="500" fontFamily="'Space Grotesk',Inter,sans-serif" opacity="0.85">OS</text>

      {/* Satellite nodes */}
      {[
        { cx: 120, cy: 200, fill: '#101A44' },
        { cx: 360, cy: 200, fill: '#101A44' },
        { cx: 200, cy: 310, fill: '#101A44' },
        { cx: 280, cy: 310, fill: '#101A44' },
        { cx: 240, cy: 370, fill: '#101A44' },
      ].map((n, i) => (
        <g key={i}>
          <circle cx={n.cx} cy={n.cy} r="28" fill={n.fill} stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
          <rect x={n.cx - 12} y={n.cy - 8} width="24" height="16" rx="3" fill="rgba(76,111,255,0.25)" />
        </g>
      ))}

      {/* Floating data packets */}
      <circle cx="180" cy="175" r="4" fill="#7DD3FC" opacity="0.9" />
      <circle cx="300" cy="175" r="3" fill="#3DDC97" opacity="0.9" />
      <circle cx="155" cy="255" r="3.5" fill="#4C6FFF" opacity="0.8" />
      <circle cx="320" cy="255" r="3" fill="#7DD3FC" opacity="0.8" />
      <circle cx="240" cy="340" r="3.5" fill="#3DDC97" opacity="0.9" />

      {/* Stat bubble — revenue */}
      <g transform="translate(52, 270)">
        <rect width="90" height="34" rx="12" fill="#101A44" stroke="rgba(255,255,255,0.10)" />
        <circle cx="17" cy="17" r="10" fill="rgba(61,220,151,0.20)" />
        <text x="17" y="21" textAnchor="middle" fontSize="10" fill="#3DDC97">↑</text>
        <text x="58" y="14" textAnchor="middle" fontSize="8" fill="#8A93BE" fontFamily="Inter,sans-serif">Revenue</text>
        <text x="58" y="25" textAnchor="middle" fontSize="9" fill="#F4F6FF" fontWeight="700" fontFamily="'Space Grotesk',Inter,sans-serif">+24%</text>
      </g>

      {/* Stat bubble — stations */}
      <g transform="translate(338, 270)">
        <rect width="92" height="34" rx="12" fill="#101A44" stroke="rgba(255,255,255,0.10)" />
        <circle cx="17" cy="17" r="10" fill="rgba(76,111,255,0.22)" />
        <circle cx="17" cy="17" r="4" fill="#4C6FFF" />
        <text x="60" y="14" textAnchor="middle" fontSize="8" fill="#8A93BE" fontFamily="Inter,sans-serif">Stations</text>
        <text x="60" y="25" textAnchor="middle" fontSize="9" fill="#F4F6FF" fontWeight="700" fontFamily="'Space Grotesk',Inter,sans-serif">All online</text>
      </g>
    </svg>
  );
}

// ---- Main component ---------------------------------------------------------

export default function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Enter your email and password to sign in.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const user = await withTimeout(loginUser(email.trim(), password), LOGIN_TIMEOUT_MS);
      if (user) {
        onLoginSuccess(user);
      } else {
        setError('Incorrect email or password. Try again.');
      }
    } catch (err: any) {
      setError(err?.message || 'Sign-in failed. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 44,
    padding: '0.7rem 0.9rem 0.7rem 2.4rem',
    background: 'var(--panel-2)',
    border: '1px solid var(--panel-line)',
    borderRadius: 'var(--r-control)',
    fontSize: '0.9rem',
    color: 'var(--text-hi)',
    outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  };
  const onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = '#4C6FFF';
    e.target.style.boxShadow = '0 0 0 3px rgba(76,111,255,0.16)';
  };
  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = 'var(--panel-line)';
    e.target.style.boxShadow = 'none';
  };

  return (
    <div className="dm-app-bg min-h-screen flex" style={{ fontFamily: "'Inter',sans-serif" }} id="login-page">
      {/* ---- Left panel — brand + illustration ---- */}
      <motion.div
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="dm-glow hidden lg:flex flex-col justify-between w-1/2 relative"
      >
        {/* Glow orbs */}
        <div className="dm-glow-orb" style={{ top: '18%', right: '-4%', width: 300, height: 300, background: 'rgba(76,111,255,0.28)' }} />
        <div className="dm-glow-orb" style={{ bottom: '14%', left: '-6%', width: 220, height: 220, background: 'rgba(125,211,252,0.16)' }} />

        {/* Top brand mark */}
        <div className="relative z-10 p-10">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #4C6FFF, #7DD3FC)', boxShadow: '0 8px 22px -6px rgba(76,111,255,0.7)' }}
            >
              <span style={{ color: 'white', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: '14px' }}>DM</span>
            </div>
            <div>
              <div style={{ color: 'var(--text-hi)', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: '18px', letterSpacing: '-0.02em' }}>
                Dube Man
              </div>
              <div className="dm-label" style={{ padding: 0 }}>CaféOS</div>
            </div>
          </div>
        </div>

        {/* Central illustration */}
        <div className="relative z-10 flex-1 flex items-center justify-center px-10">
          <div>
            <CafeNetworkIllustration />
            <div className="text-center mt-6 space-y-2">
              <h2 className="dm-display" style={{ fontSize: 'clamp(1.5rem, 2.6vw, 2rem)' }}>
                Run your café<br />
                <span style={{ background: 'linear-gradient(90deg, #7B93FF, #7DD3FC)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  &amp; business centre
                </span>
              </h2>
              <p style={{ color: 'var(--text-mid)', fontSize: '0.9rem', maxWidth: '320px', margin: '0 auto', lineHeight: 1.6 }}>
                One platform. Every module. Run your business from anywhere.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom trust signals */}
        <div className="relative z-10 p-10">
          <div className="flex items-center gap-6 text-xs" style={{ color: 'var(--text-low)' }}>
            <span>🔒 Encrypted</span>
            <span>☁️ Real-time sync</span>
            <span>📱 Mobile-ready</span>
          </div>
        </div>
      </motion.div>

      {/* ---- Right panel — login form ---- */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 overflow-y-auto">
        {/* Mobile brand */}
        <div className="lg:hidden flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #4C6FFF, #7DD3FC)' }}>
            <span style={{ color: 'white', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: '14px' }}>DM</span>
          </div>
          <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: '20px', color: 'var(--text-hi)' }}>Dube Man</span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="w-full max-w-[400px] space-y-6"
        >
          {/* Header */}
          <div>
            <h1 className="dm-h1" style={{ fontSize: '1.75rem' }}>Welcome back</h1>
            <p style={{ color: 'var(--text-mid)', fontSize: '0.9rem', marginTop: '6px' }}>
              Sign in to your workspace.
            </p>
          </div>

          {/* Glass login card */}
          <div className="dm-card-glass p-6 space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div className="space-y-1.5">
                <label className="dm-label" style={{ display: 'block', letterSpacing: '0.06em' }}>Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ width: 15, height: 15, color: 'var(--text-low)' }} />
                  <input
                    type="email" required autoComplete="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    style={inputStyle} onFocus={onFocus} onBlur={onBlur}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="dm-label" style={{ letterSpacing: '0.06em' }}>Password</label>
                  <button type="button" style={{ fontSize: '0.75rem', color: 'var(--blue-400)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ width: 15, height: 15, color: 'var(--text-low)' }} />
                  <input
                    type="password" required autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    style={inputStyle} onFocus={onFocus} onBlur={onBlur}
                  />
                </div>
              </div>

              {/* Inline error banner — never a stuck spinner */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                  style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,107,107,0.30)', fontSize: '0.8125rem', color: 'var(--danger)' }}
                  role="alert"
                >
                  <AlertCircle style={{ width: 15, height: 15, flexShrink: 0 }} />
                  <span>{error}</span>
                </motion.div>
              )}

              {/* Sign in button — disabled while pending */}
              <button type="submit" disabled={loading} className="dm-btn dm-btn-primary w-full">
                {loading
                  ? <Loader2 style={{ width: 16, height: 16 }} className="dm-spin" />
                  : <ArrowRight style={{ width: 16, height: 16 }} />}
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>

          {/* Footer */}
          <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-low)' }}>
            {isSupabaseConfigured ? 'Connected to your Supabase workspace' : 'Running in local demo mode'}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
