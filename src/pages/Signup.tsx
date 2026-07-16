import React, { useState } from 'react';
import { Building2, User as UserIcon, Mail, Lock, ArrowRight, Loader2, AlertCircle, MailCheck, Pill, Coffee, Printer, ShoppingBag, LayoutGrid } from 'lucide-react';
import { motion } from 'motion/react';
import { isSupabaseConfigured, getAuthenticatedUser } from '../services/supabase';
import { signUpNewOrganization } from '../services/organizations';
import { User, BusinessType } from '../types';

const BUSINESS_TYPES: { value: BusinessType; label: string; icon: React.ElementType }[] = [
  { value: 'general',  label: 'General / Multi-service', icon: LayoutGrid },
  { value: 'pharmacy', label: 'Pharmacy',                 icon: Pill },
  { value: 'cafe',     label: 'Internet Café',             icon: Coffee },
  { value: 'printing', label: 'Printing & Branding',       icon: Printer },
  { value: 'retail',   label: 'Retail',                    icon: ShoppingBag },
];

interface SignupProps {
  onSignupSuccess: (user: User) => void;
  onSwitchToLogin: () => void;
}

// Sign-up must never hang on a dead connection — cap it and recover.
const SIGNUP_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Sign-up is taking too long. Check your connection and try again.')), ms),
    ),
  ]);
}

// ---- Product illustration (pure SVG — no external assets) -------------------

function NewBusinessIllustration() {
  return (
    <svg viewBox="0 0 480 480" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="w-full max-w-sm mx-auto">
      <defs>
        <linearGradient id="blue-grad-su" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7B93FF" />
          <stop offset="100%" stopColor="#4C6FFF" />
        </linearGradient>
      </defs>
      <circle cx="240" cy="220" r="110" fill="#4C6FFF" opacity="0.08" />
      <circle cx="240" cy="220" r="64" fill="url(#blue-grad-su)" opacity="0.9" />
      <path d="M240 190 L240 250 M210 220 L270 220" stroke="white" strokeWidth="8" strokeLinecap="round" />
      {[
        { cx: 120, cy: 150, fill: '#101A44' },
        { cx: 360, cy: 150, fill: '#101A44' },
        { cx: 110, cy: 320, fill: '#101A44' },
        { cx: 370, cy: 320, fill: '#101A44' },
      ].map((n, i) => (
        <g key={i}>
          <circle cx={n.cx} cy={n.cy} r="24" fill={n.fill} stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
          <rect x={n.cx - 10} y={n.cy - 7} width="20" height="14" rx="3" fill="rgba(76,111,255,0.25)" />
        </g>
      ))}
      <g stroke="#4C6FFF" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.35">
        <line x1="120" y1="150" x2="200" y2="200" />
        <line x1="360" y1="150" x2="280" y2="200" />
        <line x1="110" y1="320" x2="200" y2="250" />
        <line x1="370" y1="320" x2="280" y2="250" />
      </g>
      <g transform="translate(190, 360)">
        <rect width="100" height="34" rx="12" fill="#101A44" stroke="rgba(255,255,255,0.10)" />
        <circle cx="17" cy="17" r="10" fill="rgba(61,220,151,0.20)" />
        <text x="17" y="21" textAnchor="middle" fontSize="10" fill="#3DDC97">+</text>
        <text x="63" y="14" textAnchor="middle" fontSize="8" fill="#8A93BE" fontFamily="Inter,sans-serif">New tenant</text>
        <text x="63" y="25" textAnchor="middle" fontSize="9" fill="#F4F6FF" fontWeight="700" fontFamily="'Space Grotesk',Inter,sans-serif">Isolated &amp; ready</text>
      </g>
    </svg>
  );
}

// ---- Main component ---------------------------------------------------------

export default function Signup({ onSignupSuccess, onSwitchToLogin }: SignupProps) {
  const [orgName, setOrgName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType>('general');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmationSent, setConfirmationSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isSupabaseConfigured) {
      setError('Sign-up needs a connected Supabase project — this preview is running in local demo mode.');
      return;
    }
    if (!orgName.trim()) { setError('Enter your business or organization name.'); return; }
    if (!email.trim() || !password) { setError('Enter your email and a password.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError("Passwords don't match."); return; }

    setLoading(true);
    try {
      const result = await withTimeout(
        signUpNewOrganization(email.trim(), password, orgName.trim(), ownerName.trim() || undefined, businessType),
        SIGNUP_TIMEOUT_MS,
      );
      if (result.needsEmailConfirmation) {
        setConfirmationSent(true);
      } else {
        const user = await getAuthenticatedUser();
        if (user) {
          onSignupSuccess(user);
        } else {
          setError("Your organization was created, but we couldn't sign you in automatically. Try signing in.");
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Sign-up failed. Check your connection and try again.');
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
    <div className="dm-app-bg min-h-screen flex" style={{ fontFamily: "'Inter',sans-serif" }} id="signup-page">
      {/* ---- Left panel — brand + illustration ---- */}
      <motion.div
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="dm-glow hidden lg:flex flex-col justify-between w-1/2 relative"
      >
        <div className="dm-glow-orb" style={{ top: '18%', right: '-4%', width: 300, height: 300, background: 'rgba(76,111,255,0.28)' }} />
        <div className="dm-glow-orb" style={{ bottom: '14%', left: '-6%', width: 220, height: 220, background: 'rgba(125,211,252,0.16)' }} />

        <div className="relative z-10 p-10">
          <div className="flex items-center gap-3">
            <img src="/logo-mark.png" alt="Uruu OS" style={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }} />
            <div>
              <div style={{ color: 'var(--text-hi)', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: '18px', letterSpacing: '-0.02em' }}>Uruu</div>
              <div className="dm-label" style={{ padding: 0 }}>OS</div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex-1 flex items-center justify-center px-10">
          <div>
            <NewBusinessIllustration />
            <div className="text-center mt-6 space-y-2">
              <h2 className="dm-display" style={{ fontSize: 'clamp(1.5rem, 2.6vw, 2rem)' }}>
                Your business,<br />
                <span style={{ background: 'linear-gradient(90deg, #7B93FF, #7DD3FC)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  fully isolated
                </span>
              </h2>
              <p style={{ color: 'var(--text-mid)', fontSize: '0.9rem', maxWidth: '320px', margin: '0 auto', lineHeight: 1.6 }}>
                Every organization's data is walled off by row-level security — yours is yours, automatically.
              </p>
            </div>
          </div>
        </div>

        <div className="relative z-10 p-10">
          <div className="flex items-center gap-6 text-xs" style={{ color: 'var(--text-low)' }}>
            <span>🔒 Encrypted</span>
            <span>🏢 Multi-tenant</span>
            <span>⚡ Ready in seconds</span>
          </div>
        </div>
      </motion.div>

      {/* ---- Right panel — signup form ---- */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 overflow-y-auto">
        <div className="lg:hidden flex items-center gap-3 mb-8">
          <img src="/logo-mark.png" alt="Uruu OS" style={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }} />
          <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: '20px', color: 'var(--text-hi)' }}>Uruu OS</span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="w-full max-w-[400px] space-y-6"
        >
          {confirmationSent ? (
            <div className="dm-card-glass p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center" style={{ background: 'var(--success-bg)', border: '1px solid rgba(61,220,151,0.30)' }}>
                <MailCheck style={{ width: 22, height: 22, color: 'var(--success)' }} />
              </div>
              <h1 className="dm-h1" style={{ fontSize: '1.4rem' }}>Check your email</h1>
              <p style={{ color: 'var(--text-mid)', fontSize: '0.875rem', lineHeight: 1.6 }}>
                We sent a confirmation link to <strong style={{ color: 'var(--text-hi)' }}>{email}</strong>.
                Confirm it, then sign in — <strong style={{ color: 'var(--text-hi)' }}>{orgName}</strong> will be set up
                automatically the moment you do.
              </p>
              <button onClick={onSwitchToLogin} className="dm-btn dm-btn-ghost w-full mt-2">Back to sign in</button>
            </div>
          ) : (
            <>
              <div>
                <h1 className="dm-h1" style={{ fontSize: '1.75rem' }}>Create your workspace</h1>
                <p style={{ color: 'var(--text-mid)', fontSize: '0.9rem', marginTop: '6px' }}>
                  Set up your business and become its first admin.
                </p>
              </div>

              <div className="dm-card-glass p-6 space-y-4">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="dm-label" style={{ display: 'block', letterSpacing: '0.06em' }}>Business / organization name</label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ width: 15, height: 15, color: 'var(--text-low)' }} />
                      <input
                        type="text" required autoComplete="organization"
                        placeholder="e.g. Acme Pharmacy"
                        value={orgName}
                        onChange={e => setOrgName(e.target.value)}
                        style={inputStyle} onFocus={onFocus} onBlur={onBlur}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="dm-label" style={{ display: 'block', letterSpacing: '0.06em' }}>Business type</label>
                    <div className="grid grid-cols-3 gap-2">
                      {BUSINESS_TYPES.map(({ value, label, icon: Icon }) => {
                        const active = businessType === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setBusinessType(value)}
                            aria-pressed={active}
                            title={label}
                            className="flex flex-col items-center justify-center gap-1 text-center"
                            style={{
                              padding: '0.6rem 0.4rem',
                              borderRadius: 'var(--r-control)',
                              border: active ? '1px solid #4C6FFF' : '1px solid var(--panel-line)',
                              background: active ? 'rgba(76,111,255,0.14)' : 'var(--panel-2)',
                              color: active ? 'var(--text-hi)' : 'var(--text-mid)',
                              cursor: 'pointer',
                              transition: 'border-color 0.15s, background 0.15s',
                            }}
                          >
                            <Icon style={{ width: 16, height: 16 }} />
                            <span style={{ fontSize: '0.6875rem', lineHeight: 1.2, fontWeight: active ? 600 : 500 }}>{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="dm-label" style={{ display: 'block', letterSpacing: '0.06em' }}>Your name <span style={{ opacity: 0.6, textTransform: 'none' }}>(optional)</span></label>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ width: 15, height: 15, color: 'var(--text-low)' }} />
                      <input
                        type="text" autoComplete="name"
                        placeholder="e.g. Jane Banda"
                        value={ownerName}
                        onChange={e => setOwnerName(e.target.value)}
                        style={inputStyle} onFocus={onFocus} onBlur={onBlur}
                      />
                    </div>
                  </div>

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

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="dm-label" style={{ display: 'block', letterSpacing: '0.06em' }}>Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ width: 15, height: 15, color: 'var(--text-low)' }} />
                        <input
                          type="password" required autoComplete="new-password"
                          placeholder="••••••••"
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          style={inputStyle} onFocus={onFocus} onBlur={onBlur}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="dm-label" style={{ display: 'block', letterSpacing: '0.06em' }}>Confirm</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ width: 15, height: 15, color: 'var(--text-low)' }} />
                        <input
                          type="password" required autoComplete="new-password"
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          style={inputStyle} onFocus={onFocus} onBlur={onBlur}
                        />
                      </div>
                    </div>
                  </div>

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

                  <button type="submit" disabled={loading} className="dm-btn dm-btn-primary w-full">
                    {loading ? <Loader2 style={{ width: 16, height: 16 }} className="dm-spin" /> : <ArrowRight style={{ width: 16, height: 16 }} />}
                    {loading ? 'Creating your workspace…' : 'Create workspace'}
                  </button>
                </form>
              </div>

              <p style={{ textAlign: 'center', fontSize: '0.8125rem', color: 'var(--text-mid)' }}>
                Already have a workspace?{' '}
                <button onClick={onSwitchToLogin} type="button" style={{ color: 'var(--blue-400)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
                  Sign in
                </button>
              </p>

              <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-low)' }}>
                {isSupabaseConfigured ? 'Connected to your Supabase workspace' : 'Running in local demo mode — sign-up is disabled'}
              </p>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
