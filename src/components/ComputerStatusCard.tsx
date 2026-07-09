import React from 'react';
import { Computer, CafeSession } from '../types';
import { Monitor, Activity, Clock, User, ShieldAlert } from 'lucide-react';
import { motion } from 'motion/react';
import { formatCurrency } from '../utils/format';

interface ComputerStatusCardProps {
  key?: React.Key;
  computer: Computer;
  activeSession?: CafeSession;
}

export default function ComputerStatusCard({ computer, activeSession }: ComputerStatusCardProps) {
  const getSecondsAgo = (isoString?: string) => {
    if (!isoString) return Infinity;
    const diff = Date.now() - new Date(isoString).getTime();
    return Math.max(0, Math.floor(diff / 1000));
  };

  const secondsAgo = getSecondsAgo(computer.last_seen);
  
  // Status evaluation based on heartbeat intervals
  let agentStatus: 'ONLINE' | 'STANDBY' | 'OFFLINE' = 'OFFLINE';
  if (secondsAgo < 60) {
    agentStatus = 'ONLINE';
  } else if (secondsAgo <= 120) {
    agentStatus = 'STANDBY';
  } else {
    agentStatus = 'OFFLINE';
  }

  const formatLastSeen = (seconds: number) => {
    if (seconds === Infinity) return 'Never';
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-slate-900 border text-slate-100 rounded-2xl p-4 flex flex-col justify-between space-y-4 shadow-lg ${
        agentStatus === 'ONLINE' ? 'border-emerald-500/30 bg-gradient-to-b from-slate-900 to-emerald-950/10' :
        agentStatus === 'STANDBY' ? 'border-amber-500/30 bg-gradient-to-b from-slate-900 to-amber-950/10' :
        'border-rose-500/20 bg-gradient-to-b from-slate-900 to-rose-950/10'
      }`}
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center space-x-3">
          <div className={`p-2.5 rounded-xl flex items-center justify-center ${
            agentStatus === 'ONLINE' ? 'bg-emerald-500/10 text-emerald-400' :
            agentStatus === 'STANDBY' ? 'bg-amber-500/10 text-amber-400' :
            'bg-slate-800 text-slate-400'
          }`}>
            <Monitor className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-extrabold text-sm text-white">{computer.computer_name}</h4>
            <code className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">{computer.computer_code}</code>
          </div>
        </div>

        {/* Dynamic status badge */}
        <span className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-[9px] font-mono font-black tracking-widest uppercase ${
          agentStatus === 'ONLINE' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/20' :
          agentStatus === 'STANDBY' ? 'bg-amber-950 text-amber-400 border border-amber-500/20' :
          'bg-rose-950 text-rose-400 border border-rose-500/10'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            agentStatus === 'ONLINE' ? 'bg-emerald-400 animate-ping' :
            agentStatus === 'STANDBY' ? 'bg-amber-400 animate-pulse' :
            'bg-rose-500'
          }`} />
          <span>{agentStatus}</span>
        </span>
      </div>

      {/* Heartbeat & Session details */}
      <div className="space-y-2 bg-slate-950/50 border border-slate-800/60 rounded-xl p-3 text-[11px] font-mono tabular-nums">
        <div className="flex justify-between text-slate-400">
          <span className="flex items-center"><Activity className="w-3 h-3 mr-1 text-slate-500" /> Heartbeat:</span>
          <span className={agentStatus === 'ONLINE' ? 'text-emerald-400' : agentStatus === 'STANDBY' ? 'text-amber-400' : 'text-rose-400'}>
            {formatLastSeen(secondsAgo)}
          </span>
        </div>

        <div className="flex justify-between text-slate-400">
          <span className="flex items-center"><Clock className="w-3 h-3 mr-1 text-slate-500" /> Rate:</span>
          <span className="text-white">{formatCurrency(computer.rate_per_minute || 1.0)} / min</span>
        </div>

        <div className="border-t border-slate-800/80 pt-2 flex flex-col space-y-1">
          <span className="text-[9px] text-slate-500 uppercase tracking-wide">Session Status</span>
          {activeSession ? (
            <div className="flex items-center justify-between text-amber-400 mt-0.5">
              <span className="flex items-center font-sans font-semibold">
                <User className="w-3.5 h-3.5 mr-1" /> {activeSession.customer_name}
              </span>
              <span className="bg-amber-950 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-[9px] font-mono">
                ACTIVE
              </span>
            </div>
          ) : computer.status === 'Maintenance' ? (
            <div className="flex items-center justify-between text-rose-400 mt-0.5">
              <span className="flex items-center font-sans font-semibold">
                <ShieldAlert className="w-3.5 h-3.5 mr-1" /> Maintenance
              </span>
              <span className="bg-rose-950 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded text-[9px] font-mono">
                LOCKED
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between text-slate-400 mt-0.5">
              <span className="font-sans">No active session</span>
              <span className="bg-slate-800 text-slate-300 border border-slate-700/60 px-2 py-0.5 rounded text-[9px] font-mono">
                STANDBY
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
