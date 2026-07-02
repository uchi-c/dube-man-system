import React, { useState, useEffect } from 'react';
import { WifiSession } from '../types';
import { Wifi, Clock, Phone, Smartphone, ShieldAlert, Ban, CheckCircle, RefreshCcw } from 'lucide-react';
import { motion } from 'motion/react';

interface WifiSessionCardProps {
  key?: any;
  session: WifiSession;
  onTerminate: (id: string) => any;
  onExpire: (id: string) => any;
}

export default function WifiSessionCard({ session, onTerminate, onExpire }: WifiSessionCardProps) {
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  useEffect(() => {
    if (session.status !== 'ACTIVE') return;

    const calcSecondsLeft = () => {
      const diff = new Date(session.end_time).getTime() - Date.now();
      return Math.max(0, Math.floor(diff / 1000));
    };

    setSecondsLeft(calcSecondsLeft());

    const interval = setInterval(() => {
      const left = calcSecondsLeft();
      setSecondsLeft(left);

      if (left <= 0) {
        clearInterval(interval);
        onExpire(session.id);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [session, onExpire]);

  const formatTime = (totalSeconds: number) => {
    if (totalSeconds <= 0) return '00:00';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (num: number) => num.toString().padStart(2, '0');
    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  };

  const getPercentageLeft = () => {
    if (session.status !== 'ACTIVE') return 0;
    const total = session.duration_minutes * 60;
    return Math.min(100, (secondsLeft / total) * 100);
  };

  const isCritical = secondsLeft > 0 && secondsLeft < 5 * 60; // Less than 5 minutes

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className={`bg-white border rounded-3xl p-5 shadow-sm transition-all text-left flex flex-col justify-between space-y-4 relative overflow-hidden ${
        session.status === 'ACTIVE' 
          ? isCritical 
            ? 'border-rose-500 ring-2 ring-rose-500/20' 
            : 'border-slate-200 hover:shadow-md'
          : 'border-slate-100 bg-slate-50/60 opacity-75'
      }`}
    >
      {/* Top Banner Status Bar */}
      <div className="flex justify-between items-start">
        <div className="space-y-1 truncate max-w-[65%]">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">WiFi Hotspot Ticket</span>
          <h3 className="font-extrabold text-sm text-slate-800 truncate flex items-center">
            {session.wifi_customers?.name || 'Unknown Guest'}
          </h3>
        </div>

        {/* Dynamic status badges */}
        {session.status === 'ACTIVE' ? (
          <span className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[9px] font-mono font-bold tracking-wider ${
            isCritical ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isCritical ? 'bg-rose-500 animate-ping' : 'bg-emerald-500 animate-pulse'}`} />
            <span>ACTIVE</span>
          </span>
        ) : session.status === 'EXPIRED' ? (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[9px] font-mono font-bold tracking-wider bg-amber-50 text-amber-600 border border-amber-200">
            <Clock className="w-2.5 h-2.5" />
            <span>EXPIRED</span>
          </span>
        ) : session.status === 'COMPLETED' ? (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[9px] font-mono font-bold tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
            <CheckCircle className="w-2.5 h-2.5" />
            <span>RELEASED</span>
          </span>
        ) : (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[9px] font-mono font-bold tracking-wider bg-slate-100 text-slate-500 border border-slate-200">
            <Ban className="w-2.5 h-2.5" />
            <span>CANCELLED</span>
          </span>
        )}
      </div>

      {/* Main Countdown or Duration display */}
      <div className="bg-slate-50/80 border border-slate-100 rounded-2xl p-4 flex items-center justify-between">
        <div>
          <span className="text-[9px] font-mono uppercase text-slate-400 block tracking-wide">
            {session.status === 'ACTIVE' ? 'Time Remaining' : 'Package Allocated'}
          </span>
          <span className={`text-xl font-extrabold font-mono tracking-tight block mt-0.5 ${
            session.status === 'ACTIVE'
              ? isCritical ? 'text-rose-600 animate-pulse' : 'text-slate-800'
              : 'text-slate-500'
          }`}>
            {session.status === 'ACTIVE' ? formatTime(secondsLeft) : `${session.duration_minutes} Minutes`}
          </span>
        </div>

        <div className="text-right">
          <span className="text-[9px] font-mono uppercase text-slate-400 block tracking-wide">Authorized Cost</span>
          <span className="text-sm font-bold text-slate-700 block mt-0.5">
            MWK {session.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Progress Bar for Active Sessions */}
      {session.status === 'ACTIVE' && (
        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-1000 rounded-full ${
              isCritical ? 'bg-rose-500' : 'bg-emerald-500'
            }`}
            style={{ width: `${getPercentageLeft()}%` }}
          />
        </div>
      )}

      {/* Device & Connection metadata */}
      <div className="space-y-2 text-xs text-slate-600">
        <div className="flex items-center text-[11px] truncate">
          <Smartphone className="w-3.5 h-3.5 mr-2 text-slate-400 shrink-0" />
          <span className="text-slate-500 mr-1 font-mono">Device:</span>
          <strong className="text-slate-700 truncate">{session.wifi_customers?.device_name || 'N/A'}</strong>
        </div>

        <div className="flex items-center text-[11px]">
          <Wifi className="w-3.5 h-3.5 mr-2 text-slate-400 shrink-0" />
          <span className="text-slate-500 mr-1 font-mono">MAC Address:</span>
          <code className="bg-slate-100 border text-slate-700 px-1.5 py-0.5 rounded text-[10px] font-mono tracking-wider">
            {session.wifi_customers?.mac_address || '00:00:00:00:00:00'}
          </code>
        </div>

        <div className="flex items-center text-[11px]">
          <Phone className="w-3.5 h-3.5 mr-2 text-slate-400 shrink-0" />
          <span className="text-slate-500 mr-1 font-mono">Phone:</span>
          <span className="text-slate-700">{session.wifi_customers?.phone || 'N/A'}</span>
        </div>

        <div className="flex items-center text-[10px] text-slate-400 font-mono pt-1.5 border-t border-slate-100 justify-between">
          <span>Start: {new Date(session.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          <span>End: {new Date(session.end_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
        </div>
      </div>

      {/* Administrative Action buttons (Gated by role) */}
      {session.status === 'ACTIVE' && (
        <div className="pt-2 flex space-x-2">
          <button
            onClick={() => onTerminate(session.id)}
            className="flex-1 py-2 bg-slate-900 hover:bg-rose-600 text-white hover:text-white rounded-xl text-[10px] font-bold transition-all flex items-center justify-center space-x-1 cursor-pointer shadow-sm"
          >
            <Ban className="w-3 h-3" />
            <span>Disconnect Hotspot</span>
          </button>
        </div>
      )}
    </motion.div>
  );
}
