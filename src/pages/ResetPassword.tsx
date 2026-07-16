import React, { useState } from 'react';
import { Lock, ArrowRight, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase, getAuthenticatedUser } from '../services/supabase';
import { User } from '../types';

interface ResetPasswordProps {
  /** Called once the new password is saved and the session is confirmed usable. */
  onComplete: (user: User) => void;
  onCancel: () => void;
}

// Setting a new password must never hang on a dead connection — cap it and recover.
const RESET_TIMEOUT_MS = 12000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('That took too long. Check your connection and try again.')), ms),
    ),
  ]);
}

/**
 * Shown when the app detects a Supabase PASSWORD_RECOVERY auth event — the
 * user arrived via the "reset your password" link emailed from
 * Login.tsx's "Forgot password?" flow. That link already leaves them in an
 * authenticated (recovery) session, so this page only needs to set a new
 * password on the existing account, not collect an email or re-verify one.
 */
export default function ResetPassword({ onComplete, onCancel }: ResetPasswordProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError("Passwords don't match."); return; }

    setLoading(true);
    try {
      const { error: updateError } = await withTimeout(
        supabase.auth.updateUser({ password }),
        RESET_TIMEOUT_MS,
      );
      if (updateError) throw updateError;

      const user = await getAuthenticatedUser();
      if (user) {
        onComplete(user);
      } else {
        setError('Password updated, but we could not sign you in automatically. Try signing in with your new password.');
      }
    } catch (err: any) {
      setError(err?.message || "Couldn't update your password. Try again.");
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
    <div className="dm-app-bg min-h-screen flex items-center justify-center p-6" style={{ fontFamily: "'Inter',sans-serif" }} id="reset-password-page">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-[400px] space-y-6"
      >
        <div className="flex items-center gap-3 justify-center">
          <img src="/logo-mark.png" alt="Uruu OS" style={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }} />
          <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: '20px', color: 'var(--text-hi)' }}>Uruu OS</span>
        </div>

        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: 'rgba(76,111,255,0.14)', border: '1px solid rgba(76,111,255,0.28)' }}>
            <ShieldCheck style={{ width: 22, height: 22, color: 'var(--blue-400)' }} />
          </div>
          <h1 className="dm-h1" style={{ fontSize: '1.5rem' }}>Set a new password</h1>
          <p style={{ color: 'var(--text-mid)', fontSize: '0.9rem', marginTop: '6px' }}>
            Choose a new password for your account.
          </p>
        </div>

        <div className="dm-card-glass p-6 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="dm-label" style={{ display: 'block', letterSpacing: '0.06em' }}>New password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ width: 15, height: 15, color: 'var(--text-low)' }} />
                <input
                  type="password" required autoComplete="new-password" autoFocus
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={inputStyle} onFocus={onFocus} onBlur={onBlur}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="dm-label" style={{ display: 'block', letterSpacing: '0.06em' }}>Confirm password</label>
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
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: '0.8125rem', color: 'var(--text-mid)' }}>
          <button onClick={onCancel} type="button" style={{ color: 'var(--blue-400)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
            Back to sign in
          </button>
        </p>
      </motion.div>
    </div>
  );
}
