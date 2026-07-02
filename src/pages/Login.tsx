import React, { useState } from 'react';
import { Compass, KeyRound, ShieldAlert, Mail, BadgeCheck, Loader, Info, User as UserIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { isSupabaseConfigured, loginUser } from '../services/supabase';
import { User } from '../types';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');

  const demoAccounts = [
    {
      role: 'ADMIN',
      email: 'admin@dubeman.com',
      password: 'admin123',
      label: 'Dube Man (Owner)',
      color: 'from-rose-500 to-amber-500',
      description: 'Full system management'
    },
    {
      role: 'STAFF',
      email: 'staff@dubeman.com',
      password: 'admin123',
      label: 'Sarah Phiri (Operator)',
      color: 'from-blue-500 to-indigo-500',
      description: 'POS, customers, inventory'
    },
    {
      role: 'CAFE_OPERATOR',
      email: 'cafe@dubeman.com',
      password: 'admin123',
      label: 'John Banda (Desk Operator)',
      color: 'from-emerald-500 to-teal-500',
      description: 'Café terminals & session lock only'
    }
  ];

  const handleFormLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim() || !passwordInput.trim()) {
      setErrorText('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setErrorText('');

    try {
      const user = await loginUser(emailInput.trim(), passwordInput);

      if (user) {
        onLoginSuccess(user);
      } else {
        setErrorText('Invalid credentials. Please verify your email and password.');
      }
    } catch (err: any) {
      setErrorText(err?.message || 'Failed to authenticate. Please check your network connection.');
    } finally {
      setLoading(false);
    }
  };

  const autofillAccount = (email: string, pass: string) => {
    setEmailInput(email);
    setPasswordInput(pass);
    setErrorText('');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 selection:bg-rose-500 selection:text-white" id="login-page">
      {/* Brand logo container */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-lg text-center mb-6"
      >
        <div className="inline-flex items-center justify-center p-3.5 bg-gradient-to-br from-rose-500 to-amber-500 rounded-2xl shadow-xl shadow-rose-950/40 mb-3 animate-pulse">
          <Compass className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white font-sans">
          DUBE MAN <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-amber-300">GENERAL DEALERS</span>
        </h1>
        <p className="text-xs text-rose-200/60 font-mono tracking-widest mt-1.5 uppercase">
          Enterprise Management System
        </p>
      </motion.div>

      <div className="w-full max-w-lg grid grid-cols-1 gap-6">
        {/* Core Auth Panel */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl shadow-black relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500"></div>

          <div className="mb-6 text-left">
            <h2 className="text-xl font-bold text-slate-100 font-sans">Secure Authorization</h2>
            <p className="text-xs text-slate-400 mt-1">Please authenticate with your corporate credentials to gain access.</p>
          </div>

          <form onSubmit={handleFormLoginSubmit} className="space-y-4 text-left">
            {/* USER EMAIL */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-slate-300 font-mono tracking-wider uppercase block">
                Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  placeholder="operator@dubeman.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 text-slate-100 pl-10 pr-4 py-2.5 rounded-xl outline-none text-xs transition-all"
                />
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            {/* PASSWORD */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-slate-300 font-mono tracking-wider uppercase block">
                Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 text-slate-100 pl-10 pr-4 py-2.5 rounded-xl outline-none font-mono text-xs transition-all"
                />
                <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            {/* Secure Handshake Notice */}
            <div className="bg-slate-950/60 border border-slate-850 rounded-2xl p-3 flex items-start space-x-2.5 text-[11px] text-slate-405">
              <ShieldAlert className="w-4 h-4 text-rose-550 shrink-0 mt-0.5 animate-pulse" />
              <div>
                <span className="font-semibold text-slate-200">Protected Handshake Protocol</span>
                <p className="mt-0.5 text-slate-400">Role bindings restrict active system features. Sessions are validated and cryptographically verified.</p>
              </div>
            </div>

            {/* Error text */}
            {errorText && (
              <div className="bg-rose-950/40 border border-rose-900/40 text-rose-300 text-xs p-3 rounded-xl flex items-center space-x-2 font-mono">
                <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{errorText}</span>
              </div>
            )}

            {/* Action button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-xl shadow-rose-950/30 transition-all transform active:scale-98 flex items-center justify-center space-x-2 cursor-pointer"
            >
              {loading ? (
                <Loader className="w-4 h-4 animate-spin text-white" />
              ) : (
                <BadgeCheck className="w-4 h-4 text-white" />
              )}
              <span>{loading ? 'Authenticating Credentials...' : 'Sign In'}</span>
            </button>
          </form>
        </motion.div>

        {/* Dynamic demo access selector card */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="bg-slate-900 border border-slate-800 rounded-3xl p-5 text-left"
        >
          <div className="flex items-center space-x-2 mb-3.5 text-amber-400">
            <Info className="w-4 h-4 shrink-0" />
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-200">Demo Access Accounts</h3>
          </div>
          <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
            {isSupabaseConfigured ? 'Use real Supabase Auth credentials. Demo buttons only autofill known account emails.' : <>Select one of the local simulator profiles below to autofill credentials. Local simulator mode accepts the seeded demo password (e.g. <strong>admin123</strong>).</>}
          </p>

          <div className="space-y-2.5">
            {demoAccounts.map((account) => (
              <button
                key={account.role}
                type="button"
                onClick={() => autofillAccount(account.email, account.password)}
                className="w-full bg-slate-950/85 hover:bg-slate-950 border border-slate-800/80 hover:border-slate-700/80 p-3 rounded-2xl flex items-center justify-between text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center space-x-3 truncate">
                  <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${account.color} flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm`}>
                    <UserIcon className="w-3.5 h-3.5" />
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors">{account.label}</div>
                    <div className="text-[10px] text-slate-500 font-mono truncate">{account.email}</div>
                  </div>
                </div>

                <div className="text-right shrink-0 pl-2">
                  <span className="inline-block text-[9px] font-mono font-extrabold uppercase tracking-widest px-2.5 py-1 bg-slate-900 border border-slate-800 text-slate-305 group-hover:border-slate-700 rounded-lg group-hover:text-rose-450 transition-all">
                    {account.role}
                  </span>
                  <div className="text-[9px] text-slate-500 mt-0.5 font-sans italic">{account.description}</div>
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Corporate signature */}
      <motion.p 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-[11px] text-slate-600 font-mono mt-8 text-center"
      >
        Designed & Maintained for Dube Man General Dealers &bull; 2026 Audit Certified
      </motion.p>
    </div>
  );
}

