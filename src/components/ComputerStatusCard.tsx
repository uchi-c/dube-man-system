import React from 'react';
import { Computer, CafeSession } from '../types';
import { Monitor, Activity, Clock, User, ShieldAlert, Printer } from 'lucide-react';
import { motion } from 'motion/react';
import { formatCurrency } from '../utils/format';

interface ComputerStatusCardProps {
  key?: React.Key;
  computer: Computer;
  activeSession?: CafeSession;
}

// Thin usage meter for CPU / RAM / Disk (value is a 0-100 percentage).
function UsageBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= 90 ? 'var(--danger)' : pct >= 70 ? 'var(--warning)' : 'var(--success)';
  return (
    <div className="flex items-center gap-2">
      <span style={{ width: 32, fontSize: '0.5625rem', textTransform: 'uppercase', color: 'var(--text-low)' }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--panel-2)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 999, background: color, width: `${pct}%` }} />
      </div>
      <span className="dm-nums" style={{ width: 36, textAlign: 'right', fontSize: '0.625rem', color: 'var(--text-mid)' }}>{pct.toFixed(0)}%</span>
    </div>
  );
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

  const statusColor = agentStatus === 'ONLINE' ? 'var(--success)' : agentStatus === 'STANDBY' ? 'var(--warning)' : 'var(--danger)';
  const statusBg = agentStatus === 'ONLINE' ? 'var(--success-bg)' : agentStatus === 'STANDBY' ? 'var(--warning-bg)' : 'var(--danger-bg)';
  const statusBadgeClass = agentStatus === 'ONLINE' ? 'dm-badge-success' : agentStatus === 'STANDBY' ? 'dm-badge-warning' : 'dm-badge-danger';
  const statusDotClass = agentStatus === 'ONLINE' ? 'dm-dot-success' : agentStatus === 'STANDBY' ? 'dm-dot-warning' : 'dm-dot-danger';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="dm-card p-4 flex flex-col justify-between space-y-4"
      style={{ borderColor: agentStatus === 'OFFLINE' ? 'var(--panel-line)' : `${statusColor}33` }}
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center flex-shrink-0" style={{ width: 36, height: 36, borderRadius: 10, background: statusBg, color: statusColor }}>
            <Monitor style={{ width: 16, height: 16 }} />
          </div>
          <div>
            <h4 style={{ fontWeight: 800, fontSize: '0.875rem', color: 'var(--text-hi)' }}>{computer.computer_name}</h4>
            <code style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: 'var(--text-low)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{computer.computer_code}</code>
          </div>
        </div>

        {/* Dynamic status badge */}
        <span className={`dm-badge ${statusBadgeClass}`} style={{ fontFamily: 'monospace', fontWeight: 800 }}>
          <span className={`dm-dot ${statusDotClass} dm-dot-pulse`} />
          <span>{agentStatus}</span>
        </span>
      </div>

      {/* Heartbeat & Session details */}
      <div className="dm-card-inset dm-nums space-y-2" style={{ padding: '0.75rem', fontSize: '0.6875rem', fontFamily: 'monospace' }}>
        <div className="flex justify-between" style={{ color: 'var(--text-low)' }}>
          <span className="flex items-center"><Activity style={{ width: 11, height: 11, marginRight: 4 }} /> Heartbeat:</span>
          <span style={{ color: statusColor }}>
            {formatLastSeen(secondsAgo)}
          </span>
        </div>

        <div className="flex justify-between" style={{ color: 'var(--text-low)' }}>
          <span className="flex items-center"><Clock style={{ width: 11, height: 11, marginRight: 4 }} /> Rate:</span>
          <span style={{ color: 'var(--text-hi)' }}>{formatCurrency(computer.rate_per_minute || 1.0)} / min</span>
        </div>

        <div className="flex justify-between" style={{ color: 'var(--text-low)' }}>
          <span className="flex items-center"><Printer style={{ width: 11, height: 11, marginRight: 4 }} /> Prints:</span>
          <span style={{ color: 'var(--text-hi)' }}>{computer.print_count ?? 0}</span>
        </div>

        {/* Live usage metrics (reported by the PC agent) */}
        {(computer.cpu_usage != null || computer.ram_usage != null || computer.disk_usage != null) && (
          <div className="space-y-1.5 pt-2" style={{ borderTop: '1px solid var(--panel-line)' }}>
            <span style={{ fontSize: '0.5625rem', color: 'var(--text-low)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Live Usage</span>
            {computer.cpu_usage != null && <UsageBar label="CPU" value={computer.cpu_usage} />}
            {computer.ram_usage != null && <UsageBar label="RAM" value={computer.ram_usage} />}
            {computer.disk_usage != null && <UsageBar label="Disk" value={computer.disk_usage} />}
            {(computer.hostname || computer.ip_address) && (
              <div className="flex justify-between pt-0.5" style={{ fontSize: '0.5625rem', color: 'var(--text-low)' }}>
                <span className="dm-truncate">{computer.hostname || '—'}</span>
                <span>{computer.ip_address || ''}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col space-y-1 pt-2" style={{ borderTop: '1px solid var(--panel-line)' }}>
          <span style={{ fontSize: '0.5625rem', color: 'var(--text-low)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Session Status</span>
          {activeSession ? (
            <div className="flex items-center justify-between mt-0.5">
              <span className="flex items-center" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, color: 'var(--warning)' }}>
                <User style={{ width: 14, height: 14, marginRight: 4 }} /> {activeSession.customer_name}
              </span>
              <span className="dm-badge dm-badge-warning">
                ACTIVE
              </span>
            </div>
          ) : computer.status === 'Maintenance' ? (
            <div className="flex items-center justify-between mt-0.5">
              <span className="flex items-center" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, color: 'var(--danger)' }}>
                <ShieldAlert style={{ width: 14, height: 14, marginRight: 4 }} /> Maintenance
              </span>
              <span className="dm-badge dm-badge-danger">
                LOCKED
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between mt-0.5">
              <span style={{ fontFamily: "'Inter', sans-serif", color: 'var(--text-low)' }}>No active session</span>
              <span className="dm-badge dm-badge-neutral">
                STANDBY
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
