import React, { useState, useEffect } from 'react';
import { Computer, CafeSession } from '../types';
import {
  fetchComputers, fetchRunningCafeSessions, fetchCompletedCafeSessions,
  startWorkstationSession, endWorkstationSession, updateComputerLockStatus,
  fetchPrintCountsByComputer, supabase, isSupabaseConfigured
} from '../services/supabase';
import {
  Monitor, Play, Square, Wrench, ShieldAlert,
  Clock, Coins, User, Check,
  Activity, RefreshCw, Server, TrendingUp, Zap
} from 'lucide-react';
import { motion } from 'motion/react';
import ComputerStatusCard from '../components/ComputerStatusCard';
import { formatCurrency } from '../utils/format';
import { elapsedMinutes, sessionCharge } from '../utils/billing';

interface CafeConsoleProps {
  userRole: string;
}

// ---- Stat card (matches Dashboard's HeroStat pattern) ---------------------

function StatCard({ icon: Icon, label, value, sub, tone = 'blue' }: {
  icon: React.ElementType; label: string; value: React.ReactNode; sub?: string;
  tone?: 'blue' | 'cyan' | 'success' | 'warning';
}) {
  const fg = tone === 'cyan' ? 'var(--cyan-300)' : tone === 'success' ? 'var(--success)' : tone === 'warning' ? 'var(--warning)' : 'var(--blue-400)';
  const bg = tone === 'cyan' ? 'var(--cyan-bg)' : tone === 'success' ? 'var(--success-bg)' : tone === 'warning' ? 'var(--warning-bg)' : 'var(--blue-bg)';
  return (
    <div className="dm-card p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center flex-shrink-0" style={{ width: 28, height: 28, borderRadius: 8, background: bg, color: fg }}>
          <Icon style={{ width: 14, height: 14 }} />
        </div>
        <span className="dm-label" style={{ padding: 0 }}>{label}</span>
      </div>
      <div className="dm-kpi dm-truncate" style={{ fontSize: '1.15rem' }}>{value}</div>
      {sub && <p className="dm-nums" style={{ fontSize: '0.6875rem', color: 'var(--text-low)' }}>{sub}</p>}
    </div>
  );
}

export default function CafeManagement({ userRole }: CafeConsoleProps) {
  const [computers, setComputers] = useState<Computer[]>([]);
  const [runningSessions, setRunningSessions] = useState<CafeSession[]>([]);
  const [completedSessions, setCompletedSessions] = useState<CafeSession[]>([]);
  const [loading, setLoading] = useState(true);

  // Interactive Session states
  const [selectedComp, setSelectedComp] = useState<Computer | null>(null);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [customerFormName, setCustomerFormName] = useState('');
  const [billingConfirmation, setBillingConfirmation] = useState<any | null>(null);

  // Tick helper to redraw active stopwatch indicators
  const [, setTick] = useState(0);

  const syncCafe = async () => {
    const [compData, sessData, pastSessData, printCounts] = await Promise.all([
      fetchComputers(),
      fetchRunningCafeSessions(),
      fetchCompletedCafeSessions(),
      fetchPrintCountsByComputer(),
    ]);
    setComputers(compData.map(c => ({ ...c, print_count: printCounts[c.id] ?? 0 })));
    setRunningSessions(sessData);
    setCompletedSessions(pastSessData);
  };

  const pullCafeFromDb = async () => {
    setLoading(true);
    try {
      await syncCafe();
    } catch (err) {
      console.error('Error syncing Internet Cafe data:', err);
    } finally {
      setLoading(false);
    }
  };

  const pullCafeFromDbSilently = async () => {
    try {
      await syncCafe();
    } catch (err) {
      console.error('Error silently syncing Internet Cafe data:', err);
    }
  };

  useEffect(() => {
    pullCafeFromDb();

    // Redraw and recalculate heartbeat timers every 5 seconds for live status precision
    const intervalId = setInterval(() => {
      setTick(t => t + 1);
    }, 5000);

    let channel: any;
    if (isSupabaseConfigured) {
      channel = supabase
        .channel('public:computers_realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'computers'
          },
          (payload) => {
            console.log('Realtime update received from PC Agent:', payload);
            pullCafeFromDbSilently();
          }
        )
        .subscribe();
    }

    return () => {
      clearInterval(intervalId);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const handleStartSessionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedComp || !customerFormName.trim()) return;

    setLoading(true);
    const success = await startWorkstationSession(selectedComp.id, customerFormName);
    if (success) {
      await pullCafeFromDb();
      setIsStartingSession(false);
      setSelectedComp(null);
      setCustomerFormName('');
    } else {
      setLoading(false);
    }
  };

  const handleTerminateSession = async (computer: Computer) => {
    const session = runningSessions.find(s => s.computer_id === computer.id && s.status === 'ACTIVE');
    if (!session) return;

    setLoading(true);
    const completedSessionReceipt = await endWorkstationSession(session.id);
    if (completedSessionReceipt) {
      await pullCafeFromDb();
      setBillingConfirmation({
        ...completedSessionReceipt,
        computer_name: computer.computer_name
      });
    } else {
      setLoading(false);
    }
  };

  const handleToggleMaintenance = async (computer: Computer) => {
    const nextInMaintenance = computer.status !== 'Maintenance';
    setLoading(true);
    const success = await updateComputerLockStatus(computer.id, nextInMaintenance);
    if (success) {
      await pullCafeFromDb();
    } else {
      setLoading(false);
    }
  };

  // Utility to determine active elapsed time in minutes
  const getElapsedMinutes = (startTimeStr: string) =>
    elapsedMinutes(new Date(startTimeStr).getTime(), Date.now());

  // ==========================================
  // REAL-TIME ANALYTICS CALCULATIONS
  // ==========================================
  const todayStr = new Date().toDateString();
  const todayCompleted = completedSessions.filter(s => s.end_time && new Date(s.end_time).toDateString() === todayStr);
  const todayRunning = runningSessions; // All active sessions represent today's utilization

  // Today's Café Revenue: Completed today + Active running sessions' current value
  const todayRevenue = todayCompleted.reduce((sum, s) => sum + (s.amount || 0), 0) +
                       todayRunning.reduce((sum, s) => {
                         const mins = getElapsedMinutes(s.start_time);
                         return sum + sessionCharge(mins, s.rate_per_minute || 1.0);
                       }, 0);

  // Total Minutes Used: Sum of duration of all past sessions + running sessions
  const totalMinutesUsed = completedSessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) +
                           runningSessions.reduce((sum, s) => sum + getElapsedMinutes(s.start_time), 0);

  // Most Used Workstation based on session frequency
  const allSessions = [...completedSessions, ...runningSessions];
  const computerUsageMap: { [key: string]: { name: string; count: number } } = {};
  allSessions.forEach(s => {
    const cid = s.computer_id;
    if (!computerUsageMap[cid]) {
      computerUsageMap[cid] = { name: s.computer_name, count: 0 };
    }
    computerUsageMap[cid].count += 1;
  });

  let mostUsedComputerName = 'N/A';
  let maxSessionsCount = 0;
  Object.values(computerUsageMap).forEach(v => {
    if (v.count > maxSessionsCount) {
      maxSessionsCount = v.count;
      mostUsedComputerName = v.name;
    }
  });

  // Total number of sessions in system logs
  const totalSessionsCount = allSessions.length;

  // Average session duration in minutes
  const averageSessionMinutes = totalSessionsCount > 0 ? Math.round(totalMinutesUsed / totalSessionsCount) : 0;

  return (
    <div className="space-y-6" id="cafe-management-tab">
      {/* Overview */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-left">
        <div>
          <h1 className="dm-h1">Café Workspace</h1>
          <p style={{ color: 'var(--text-mid)', fontSize: '0.8125rem', marginTop: 4 }}>
            Real-time minute billing system (<strong style={{ color: 'var(--text-hi)' }}>{formatCurrency(1)} per minute</strong>). Activate workstation terminals, review billing, and prepare PC agent sync hooks.
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={pullCafeFromDb}
            className="dm-icon-btn"
            title="Reload Workstations"
          >
            <RefreshCw className={loading ? 'dm-spin' : ''} style={{ width: 16, height: 16 }} />
          </button>

          <div className="dm-badge dm-badge-success" style={{ padding: '0.5rem 0.9rem', fontFamily: "'Space Grotesk', monospace" }}>
            <Activity className="dm-dot-pulse" style={{ width: 13, height: 13 }} />
            Gateway Router: Live
          </div>
        </div>
      </div>

      {/* ==========================================
          ANALYTICS REPORT PANEL
          ========================================== */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={TrendingUp} label="Today's Revenue" value={formatCurrency(todayRevenue)} sub="Real-time estimate" tone="success" />
        <StatCard icon={Clock} label="Minutes Used" value={<>{totalMinutesUsed} <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>mins</span></>} sub="Aggregate user time" tone="blue" />
        <StatCard icon={Monitor} label="Most Used PC" value={<span title={mostUsedComputerName}>{mostUsedComputerName}</span>} sub="Based on session count" tone="cyan" />
        <StatCard icon={Zap} label="Total Sessions" value={totalSessionsCount} sub={`${runningSessions.length} active terminal`} tone="blue" />
        <StatCard icon={User} label="Avg Cust. Time" value={<>{averageSessionMinutes} <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>mins</span></>} sub="Per allocated session" tone="warning" />
      </div>

      {/* ==========================================
          COMPUTER MONITORING & HEARTBEAT TRACKING (PC AGENT)
          ========================================== */}
      <div className="space-y-4 text-left" id="computer-monitoring-section">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3" style={{ borderBottom: '1px solid var(--panel-line)' }}>
          <div>
            <h2 className="dm-h2 flex items-center">
              <span className="dm-dot dm-dot-success dm-dot-pulse" style={{ marginRight: 8 }} />
              <span>Internet Café Computer Monitoring</span>
            </h2>
            <p style={{ color: 'var(--text-mid)', fontSize: '0.75rem', marginTop: 3 }}>Live workstation status tracked via physical machine agents reporting heartbeats.</p>
          </div>
          <span className="dm-badge dm-badge-neutral" style={{ fontFamily: "'Space Grotesk', monospace" }}>
            Realtime Listener: ACTIVE
          </span>
        </div>

        {loading && computers.length === 0 ? (
          <div className="dm-card-inset flex flex-col items-center justify-center text-center" style={{ height: 120, borderStyle: 'dashed' }}>
            <RefreshCw className="dm-spin" style={{ width: 20, height: 20, color: 'var(--blue-400)', marginBottom: 6 }} />
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-low)', fontFamily: 'monospace' }}>Listening for live hardware signals...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {computers.map(computer => {
              const activeSession = runningSessions.find(s => s.computer_id === computer.id && s.status === 'ACTIVE');
              return (
                <ComputerStatusCard
                  key={computer.id}
                  computer={computer}
                  activeSession={activeSession}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="pt-4 text-left" style={{ borderTop: '1px solid var(--panel-line)' }}>
        <h2 className="dm-h2">Workstation Allocations &amp; Billing</h2>
        <p style={{ color: 'var(--text-mid)', fontSize: '0.75rem', marginTop: 3 }}>Manually start or stop sessions, manage client billing, and put machines out of service.</p>
      </div>

      {/* Grid of Workstations */}
      {loading && computers.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center" style={{ height: 250 }}>
          <RefreshCw className="dm-spin" style={{ width: 28, height: 28, color: 'var(--blue-400)', marginBottom: 8 }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-low)', fontFamily: 'monospace' }}>Synchronizing workstations and VLAN servers...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {computers.map(computer => {
            const session = runningSessions.find(s => s.computer_id === computer.id && s.status === 'ACTIVE');
            const elapsed = session ? getElapsedMinutes(session.start_time) : 0;
            const liveCharge = session ? sessionCharge(elapsed, session.rate_per_minute || 1.0) : 0;

            // Map UI status
            let mappedStatus = computer.status.toUpperCase();
            if (computer.status === 'Occupied') {
              mappedStatus = 'ACTIVE';
            }

            const cardBorder = computer.status === 'Occupied' ? 'rgba(255,176,32,0.35)' :
              computer.status === 'Maintenance' ? 'rgba(255,107,107,0.30)' :
              'var(--panel-line)';

            return (
              <motion.div
                key={computer.id}
                whileHover={{ y: -3 }}
                className="dm-card p-5 flex flex-col justify-between text-left"
                style={{ minHeight: 260, borderColor: cardBorder, position: 'relative', overflow: 'hidden' }}
              >
                {/* Header block details */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center justify-center flex-shrink-0" style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: computer.status === 'Occupied' ? 'var(--warning-bg)' :
                          computer.status === 'Maintenance' ? 'var(--danger-bg)' : 'var(--panel-2)',
                        color: computer.status === 'Occupied' ? 'var(--warning)' :
                          computer.status === 'Maintenance' ? 'var(--danger)' : 'var(--text-mid)',
                      }}>
                        <Monitor style={{ width: 18, height: 18 }} />
                      </div>
                      <div>
                        <h3 style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-hi)', marginBottom: 2 }}>{computer.computer_name}</h3>
                        <code style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: 'var(--text-low)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{computer.computer_code}</code>
                      </div>
                    </div>

                    {/* Status Indicator badge */}
                    <span className={`dm-badge ${
                      computer.status === 'Occupied' ? 'dm-badge-warning' :
                      computer.status === 'Maintenance' ? 'dm-badge-danger' :
                      'dm-badge-neutral'
                    }`}>
                      {mappedStatus}
                    </span>
                  </div>

                  {/* Session telemetry if Active */}
                  {computer.status === 'Occupied' && session ? (
                    <div className="dm-card-inset" style={{
                      padding: '0.85rem', borderRadius: 12, marginTop: 8,
                      fontFamily: 'monospace', fontSize: '0.6875rem',
                      borderColor: elapsed >= 60 ? 'rgba(255,107,107,0.4)' : 'var(--panel-line)',
                    }}>
                      {elapsed >= 60 && (
                        <div className="dm-badge dm-badge-danger" style={{ width: '100%', justifyContent: 'center', marginBottom: 8, fontFamily: "'Inter', sans-serif" }}>
                          <span>⚠️ HEAVY USAGE: OVER 60 MINS</span>
                        </div>
                      )}
                      <div className="flex justify-between" style={{ marginBottom: 6 }}>
                        <span style={{ color: 'var(--text-low)' }}>Customer:</span>
                        <span className="dm-truncate" style={{ fontWeight: 700, color: 'var(--warning)', maxWidth: 120 }} title={session.customer_name}>
                          {session.customer_name}
                        </span>
                      </div>
                      <div className="flex justify-between items-center" style={{ marginBottom: 6 }}>
                        <span style={{ color: 'var(--text-low)', display: 'flex', alignItems: 'center' }}>
                          <Clock style={{ width: 11, height: 11, marginRight: 4 }} /> Time Used:
                        </span>
                        <span className="dm-nums" style={{ fontWeight: 600, color: elapsed >= 60 ? 'var(--danger)' : 'var(--text-hi)' }}>{elapsed} minutes</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span style={{ color: 'var(--text-low)', display: 'flex', alignItems: 'center' }}>
                          <Coins style={{ width: 11, height: 11, marginRight: 4 }} /> Amount:
                        </span>
                        <span className="dm-nums" style={{ fontWeight: 700, color: 'var(--danger)' }}>{formatCurrency(liveCharge)}</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-low)', padding: '1rem 0', fontFamily: 'monospace' }}>
                      {computer.status === 'Maintenance' ? (
                        <span style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center' }}>
                          <ShieldAlert style={{ width: 15, height: 15, marginRight: 4 }} className="dm-dot-pulse" /> Out of service lockdown.
                        </span>
                      ) : (
                        <span>Workstation is AVAILABLE. Ready for allocation.</span>
                      )}
                    </div>
                  )}

                  {/* ==========================================
                      PC TRACKING AGENT FOUNDATION HOOKS
                      ========================================== */}
                  <div className="pt-3 mt-3" style={{ borderTop: '1px solid var(--panel-line)', fontSize: '0.625rem', color: 'var(--text-low)', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div className="flex justify-between items-center">
                      <span style={{ display: 'flex', alignItems: 'center' }}>
                        <Server style={{ width: 11, height: 11, marginRight: 4 }} /> PC Tracking Agent:
                      </span>
                      <span style={{ fontWeight: 700, color: computer.status === 'Maintenance' ? 'var(--danger)' : 'var(--success)' }}>
                        {computer.status === 'Maintenance' ? 'SUSPENDED' : 'READY_TO_CONNECT'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Online heartbeat:</span>
                      <span style={{ color: 'var(--text-low)' }}>
                        {computer.status === 'Maintenance' ? 'Offline' : 'Ready (Active Listener)'}
                      </span>
                    </div>
                    <div className="flex justify-between dm-truncate">
                      <span>Gateway node:</span>
                      <span style={{ color: 'var(--text-low)' }}>wc-hook://{computer.computer_code.toLowerCase()}.uruu.net</span>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="pt-3.5 mt-3.5 flex items-center justify-between gap-2" style={{ borderTop: '1px solid var(--panel-line)' }}>
                  <div style={{ fontSize: '0.625rem', color: 'var(--text-low)', fontFamily: 'monospace' }}>
                    Rate: {formatCurrency(computer.rate_per_minute || 1.0)}/min
                  </div>

                  <div className="flex space-x-1.5">
                    {/* Maintenance Toggle */}
                    {computer.status !== 'Occupied' && (
                      <button
                        onClick={() => handleToggleMaintenance(computer)}
                        className="dm-icon-btn"
                        style={{
                          width: 36, height: 36,
                          ...(computer.status === 'Maintenance'
                            ? { background: 'var(--danger-bg)', borderColor: 'rgba(255,107,107,0.35)', color: 'var(--danger)' }
                            : {}),
                        }}
                        title={computer.status === 'Maintenance' ? 'Re-enable terminal node' : 'Enter Maintenance mode'}
                      >
                        <Wrench style={{ width: 14, height: 14 }} />
                      </button>
                    )}

                    {/* Operational actions */}
                    {computer.status === 'Available' ? (
                      <button
                        onClick={() => {
                          setSelectedComp(computer);
                          setCustomerFormName('');
                          setIsStartingSession(true);
                        }}
                        className="dm-btn dm-btn-primary"
                        style={{ minHeight: 36, padding: '0 0.9rem', fontSize: '0.75rem' }}
                      >
                        <Play style={{ width: 12, height: 12 }} fill="currentColor" />
                        <span>START SESSION</span>
                      </button>
                    ) : computer.status === 'Occupied' ? (
                      <button
                        onClick={() => handleTerminateSession(computer)}
                        className="dm-btn dm-btn-danger"
                        style={{ minHeight: 36, padding: '0 0.9rem', fontSize: '0.75rem' }}
                      >
                        <Square style={{ width: 12, height: 12 }} fill="currentColor" />
                        <span>END SESSION</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* START SESSION DIALOG */}
      {isStartingSession && selectedComp && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(7,11,36,0.75)', backdropFilter: 'blur(4px)' }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="dm-card-glass max-w-sm w-full p-6 relative text-left"
          >
            <div className="mb-4">
              <span className="dm-badge dm-badge-warning" style={{ fontFamily: 'monospace' }}>
                Initiating Client allocation
              </span>
              <h3 className="dm-h3" style={{ marginTop: 8, fontSize: '1rem' }}>Start Café Session</h3>
              <p style={{ color: 'var(--text-low)', fontSize: '0.75rem', marginTop: 4 }}>Workstation: <strong style={{ color: 'var(--text-mid)' }}>{selectedComp.computer_name}</strong> &bull; Rate: {formatCurrency(selectedComp.rate_per_minute || 1.0)}/min</p>
            </div>

            <form onSubmit={handleStartSessionSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="dm-label" style={{ display: 'block', padding: 0 }}>Customer reference name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John"
                  value={customerFormName}
                  onChange={(e) => setCustomerFormName(e.target.value)}
                  className="dm-input"
                />
              </div>

              <div className="flex space-x-2 pt-3 justify-end" style={{ borderTop: '1px solid var(--panel-line)' }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsStartingSession(false);
                    setSelectedComp(null);
                    setCustomerFormName('');
                  }}
                  className="dm-btn dm-btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="dm-btn dm-btn-primary"
                >
                  Launch Terminal Lock
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* BILLING CONFIRMATION MODAL */}
      {billingConfirmation && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(7,11,36,0.82)', backdropFilter: 'blur(4px)' }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="dm-card-glass max-w-sm w-full p-6 relative text-left"
          >
            <div className="text-center mb-4">
              <div className="flex items-center justify-center mx-auto mb-3" style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--success-bg)', color: 'var(--success)' }}>
                <Check style={{ width: 24, height: 24, strokeWidth: 3 }} />
              </div>
              <h3 className="dm-h1" style={{ fontSize: '1.125rem' }}>Terminal Billing Invoice</h3>
              <p style={{ color: 'var(--text-low)', fontSize: '0.75rem', marginTop: 4 }}>Workstation: {billingConfirmation.computer_name}</p>
            </div>

            <div className="dm-card-inset" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-mid)' }}>
              <div className="flex justify-between">
                <span>Customer name:</span>
                <span style={{ fontWeight: 700, color: 'var(--text-hi)' }}>{billingConfirmation.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span>Total elapsed time:</span>
                <span style={{ fontWeight: 700, color: 'var(--text-hi)' }}>{billingConfirmation.duration_minutes} minutes</span>
              </div>
              <div className="flex justify-between items-center pt-2" style={{ borderTop: '1px solid var(--panel-line)', fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-hi)' }}>
                <span>Total billing:</span>
                <span className="dm-nums" style={{ color: 'var(--success)', fontSize: '1rem' }}>{formatCurrency(billingConfirmation.amount)}</span>
              </div>
            </div>

            <button
              onClick={() => setBillingConfirmation(null)}
              className="dm-btn dm-btn-primary w-full"
              style={{ marginTop: 20 }}
            >
              <span>Acknowledge &amp; Save Receipt</span>
            </button>
          </motion.div>
        </div>
      )}

      {/* PC Agent Connectivity Info Footer panel */}
      <div className="dm-card-inset p-5 text-left mt-8">
        <h3 style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-hi)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, display: 'flex', alignItems: 'center' }}>
          <Server className="dm-dot-pulse" style={{ width: 15, height: 15, marginRight: 6, color: 'var(--blue-400)' }} />
          PC Agent Hook &amp; Sync Foundation (API Ready)
        </h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-mid)', lineHeight: 1.6, marginBottom: 16 }}>
          This system is pre-configured with active hooks for future workstation agent connection. Workstation terminal daemons can query
          online heartbeat status, report user activity triggers, and sync session state lockdowns via standard JSON payloads.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 dm-card p-3.5" style={{ fontFamily: 'monospace', fontSize: '0.625rem', color: 'var(--text-low)' }}>
          <div>
            <span style={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Heartbeat Endpoint</span>
            <code style={{ color: 'var(--text-mid)' }}>POST /api/agent/ping</code>
          </div>
          <div>
            <span style={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2, fontFamily: "'Inter', sans-serif" }}>Active Lockscreen Protocol</span>
            <code style={{ color: 'var(--text-mid)' }}>WS Gateway Hook / Ready</code>
          </div>
          <div>
            <span style={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2, fontFamily: "'Inter', sans-serif" }}>Supported Agent Version</span>
            <code style={{ color: 'var(--text-mid)' }}>v1.1.0-beta</code>
          </div>
        </div>
      </div>
    </div>
  );
}
