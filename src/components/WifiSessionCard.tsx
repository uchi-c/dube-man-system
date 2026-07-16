import { useState, useEffect } from 'react';
import { WifiSession } from '../types';
import { Wifi, Clock, Phone, Smartphone, Ban, CheckCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { formatCurrency } from '../utils/format';

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
      className="dm-card p-5 text-left flex flex-col justify-between space-y-4"
      style={{
        position: 'relative', overflow: 'hidden',
        borderColor: session.status === 'ACTIVE' && isCritical ? 'var(--danger)' : 'var(--panel-line)',
        boxShadow: session.status === 'ACTIVE' && isCritical ? '0 0 0 3px rgba(255,107,107,0.15)' : undefined,
        opacity: session.status === 'ACTIVE' ? 1 : 0.7,
      }}
    >
      {/* Top Banner Status Bar */}
      <div className="flex justify-between items-start">
        <div className="space-y-1 truncate" style={{ maxWidth: '65%' }}>
          <span className="dm-label" style={{ padding: 0, display: 'block' }}>WiFi Hotspot Ticket</span>
          <h3 className="dm-truncate" style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-hi)' }}>
            {session.wifi_customers?.name || 'Unknown Guest'}
          </h3>
        </div>

        {/* Dynamic status badges */}
        {session.status === 'ACTIVE' ? (
          <span className={`dm-badge ${isCritical ? 'dm-badge-danger' : 'dm-badge-success'}`}>
            <span className={`dm-dot ${isCritical ? 'dm-dot-danger' : 'dm-dot-success'} dm-dot-pulse`} />
            <span>ACTIVE</span>
          </span>
        ) : session.status === 'EXPIRED' ? (
          <span className="dm-badge dm-badge-warning">
            <Clock style={{ width: 10, height: 10 }} />
            <span>EXPIRED</span>
          </span>
        ) : session.status === 'COMPLETED' ? (
          <span className="dm-badge dm-badge-neutral">
            <CheckCircle style={{ width: 10, height: 10 }} />
            <span>RELEASED</span>
          </span>
        ) : (
          <span className="dm-badge dm-badge-neutral">
            <Ban style={{ width: 10, height: 10 }} />
            <span>CANCELLED</span>
          </span>
        )}
      </div>

      {/* Main Countdown or Duration display */}
      <div className="dm-card-inset flex items-center justify-between" style={{ padding: '1rem' }}>
        <div>
          <span className="dm-label" style={{ padding: 0, display: 'block' }}>
            {session.status === 'ACTIVE' ? 'Time Remaining' : 'Package Allocated'}
          </span>
          <span
            className="dm-nums"
            style={{
              fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', display: 'block', marginTop: 2,
              color: session.status === 'ACTIVE' ? (isCritical ? 'var(--danger)' : 'var(--text-hi)') : 'var(--text-low)',
            }}
          >
            {session.status === 'ACTIVE' ? formatTime(secondsLeft) : `${session.duration_minutes} Minutes`}
          </span>
        </div>

        <div className="text-right">
          <span className="dm-label" style={{ padding: 0, display: 'block' }}>Authorized Cost</span>
          <span className="dm-nums" style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-mid)', display: 'block', marginTop: 2 }}>
            {formatCurrency(session.amount)}
          </span>
        </div>
      </div>

      {/* Progress Bar for Active Sessions */}
      {session.status === 'ACTIVE' && (
        <div style={{ width: '100%', background: 'var(--panel-2)', height: 6, borderRadius: 'var(--r-full)', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%', borderRadius: 'var(--r-full)', transition: 'width 1s',
              width: `${getPercentageLeft()}%`,
              background: isCritical ? 'var(--danger)' : 'var(--success)',
            }}
          />
        </div>
      )}

      {/* Device & Connection metadata */}
      <div className="space-y-2" style={{ fontSize: '0.75rem', color: 'var(--text-mid)' }}>
        <div className="flex items-center truncate" style={{ fontSize: '0.6875rem' }}>
          <Smartphone style={{ width: 14, height: 14, marginRight: 8, color: 'var(--text-low)', flexShrink: 0 }} />
          <span style={{ color: 'var(--text-low)', marginRight: 4, fontFamily: 'monospace' }}>Device:</span>
          <strong className="dm-truncate" style={{ color: 'var(--text-mid)' }}>{session.wifi_customers?.device_name || 'N/A'}</strong>
        </div>

        <div className="flex items-center" style={{ fontSize: '0.6875rem' }}>
          <Wifi style={{ width: 14, height: 14, marginRight: 8, color: 'var(--text-low)', flexShrink: 0 }} />
          <span style={{ color: 'var(--text-low)', marginRight: 4, fontFamily: 'monospace' }}>MAC Address:</span>
          <code className="dm-card-inset" style={{ color: 'var(--text-mid)', padding: '0.15rem 0.4rem', borderRadius: 6, fontSize: '0.625rem', fontFamily: 'monospace', letterSpacing: '0.03em' }}>
            {session.wifi_customers?.mac_address || '00:00:00:00:00:00'}
          </code>
        </div>

        <div className="flex items-center" style={{ fontSize: '0.6875rem' }}>
          <Phone style={{ width: 14, height: 14, marginRight: 8, color: 'var(--text-low)', flexShrink: 0 }} />
          <span style={{ color: 'var(--text-low)', marginRight: 4, fontFamily: 'monospace' }}>Phone:</span>
          <span style={{ color: 'var(--text-mid)' }}>{session.wifi_customers?.phone || 'N/A'}</span>
        </div>

        <div className="flex items-center justify-between pt-1.5" style={{ fontSize: '0.625rem', color: 'var(--text-low)', fontFamily: 'monospace', borderTop: '1px solid var(--panel-line)' }}>
          <span>Start: {new Date(session.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          <span>End: {new Date(session.end_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
        </div>
      </div>

      {/* Administrative Action buttons (Gated by role) */}
      {session.status === 'ACTIVE' && (
        <div className="pt-2 flex space-x-2">
          <button
            onClick={() => onTerminate(session.id)}
            className="dm-btn dm-btn-danger w-full"
            style={{ minHeight: 36, fontSize: '0.6875rem' }}
          >
            <Ban style={{ width: 12, height: 12 }} />
            <span>Disconnect Hotspot</span>
          </button>
        </div>
      )}
    </motion.div>
  );
}
