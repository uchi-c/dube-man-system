import React, { useState, useEffect } from 'react';
import { Computer, CafeSession, CafeSessionStatus, ComputerStatus } from '../types';
import { 
  fetchComputers, fetchRunningCafeSessions, fetchCompletedCafeSessions,
  startWorkstationSession, endWorkstationSession, updateComputerLockStatus,
  supabase, isSupabaseConfigured
} from '../services/supabase';
import { 
  Monitor, Play, Square, Wrench, ShieldAlert, 
  Clock, Coins, User, Check, DollarSign, Terminal, 
  Activity, RefreshCw, BarChart3, Server, TrendingUp, Zap, HelpCircle
} from 'lucide-react';
import { motion } from 'motion/react';
import ComputerStatusCard from '../components/ComputerStatusCard';

interface CafeConsoleProps {
  userRole: string;
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
  const [tick, setTick] = useState(0);

  const pullCafeFromDb = async () => {
    setLoading(true);
    try {
      const [compData, sessData, pastSessData] = await Promise.all([
        fetchComputers(),
        fetchRunningCafeSessions(),
        fetchCompletedCafeSessions()
      ]);
      setComputers(compData);
      setRunningSessions(sessData);
      setCompletedSessions(pastSessData);
    } catch (err) {
      console.error('Error syncing Internet Cafe data:', err);
    } finally {
      setLoading(false);
    }
  };

  const pullCafeFromDbSilently = async () => {
    try {
      const [compData, sessData, pastSessData] = await Promise.all([
        fetchComputers(),
        fetchRunningCafeSessions(),
        fetchCompletedCafeSessions()
      ]);
      setComputers(compData);
      setRunningSessions(sessData);
      setCompletedSessions(pastSessData);
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
  const getElapsedMinutes = (startTimeStr: string) => {
    const start = new Date(startTimeStr).getTime();
    const now = new Date().getTime();
    const diffMs = now - start;
    return Math.max(1, Math.floor(diffMs / 60000));
  };

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
                         return sum + (mins * (s.rate_per_minute || 1.00));
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
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Dube Man Café Workspace</h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time minute billing system (<strong>K1 per minute</strong>). Activate workstation terminals, review billing, and prepare PC agent sync hooks.
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button 
            onClick={pullCafeFromDb}
            className="p-3 bg-slate-105 hover:bg-slate-200 border border-slate-200 rounded-2xl flex items-center justify-center cursor-pointer transition-all shrink-0"
            title="Reload Workstations"
          >
            <RefreshCw className={`w-4 h-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <div className="text-slate-500 text-xs font-mono bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-2xl flex items-center">
            <Activity className="w-4 h-4 mr-1.5 text-emerald-500 animate-pulse" />
            Gateway Router: Live
          </div>
        </div>
      </div>

      {/* ==========================================
          ANALYTICS REPORT PANEL
          ========================================== */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Metric 1 */}
        <div className="bg-white border border-slate-200 rounded-3xl p-4 text-left shadow-2xs">
          <div className="flex items-center space-x-2 text-rose-500 mb-1">
            <TrendingUp className="w-4 h-4" />
            <span className="text-[10px] uppercase font-bold tracking-wider font-sans text-slate-400">Today's Revenue</span>
          </div>
          <div className="text-lg font-black text-slate-800 font-mono">
            K {todayRevenue.toFixed(2)}
          </div>
          <p className="text-[9px] text-slate-400 mt-0.5">Real-time estimate</p>
        </div>

        {/* Metric 2 */}
        <div className="bg-white border border-slate-200 rounded-3xl p-4 text-left shadow-2xs">
          <div className="flex items-center space-x-2 text-blue-500 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-[10px] uppercase font-bold tracking-wider font-sans text-slate-400">Minutes Used</span>
          </div>
          <div className="text-lg font-black text-slate-800 font-mono">
            {totalMinutesUsed} <span className="text-xs font-normal">mins</span>
          </div>
          <p className="text-[9px] text-slate-400 mt-0.5">Aggregate user time</p>
        </div>

        {/* Metric 3 */}
        <div className="bg-white border border-slate-200 rounded-3xl p-4 text-left shadow-2xs">
          <div className="flex items-center space-x-2 text-indigo-500 mb-1">
            <Monitor className="w-4 h-4" />
            <span className="text-[10px] uppercase font-bold tracking-wider font-sans text-slate-400">Most Used PC</span>
          </div>
          <div className="text-xs font-bold text-slate-800 truncate" title={mostUsedComputerName}>
            {mostUsedComputerName}
          </div>
          <p className="text-[9px] text-slate-400 mt-1">Based on session count</p>
        </div>

        {/* Metric 4 */}
        <div className="bg-white border border-slate-200 rounded-3xl p-4 text-left shadow-2xs">
          <div className="flex items-center space-x-2 text-emerald-500 mb-1">
            <Zap className="w-4 h-4" />
            <span className="text-[10px] uppercase font-bold tracking-wider font-sans text-slate-400">Total Sessions</span>
          </div>
          <div className="text-lg font-black text-slate-800 font-mono">
            {totalSessionsCount}
          </div>
          <p className="text-[9px] text-slate-400 mt-0.5">{runningSessions.length} active terminal</p>
        </div>

        {/* Metric 5 */}
        <div className="bg-white border border-slate-200 rounded-3xl p-4 text-left shadow-2xs">
          <div className="flex items-center space-x-2 text-amber-500 mb-1">
            <User className="w-4 h-4" />
            <span className="text-[10px] uppercase font-bold tracking-wider font-sans text-slate-400">Avg Cust. Time</span>
          </div>
          <div className="text-lg font-black text-slate-800 font-mono">
            {averageSessionMinutes} <span className="text-xs font-normal">mins</span>
          </div>
          <p className="text-[9px] text-slate-400 mt-0.5">Per allocated session</p>
        </div>
      </div>

      {/* ==========================================
          COMPUTER MONITORING & HEARTBEAT TRACKING (PC AGENT)
          ========================================== */}
      <div className="space-y-4 text-left" id="computer-monitoring-section">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
          <div>
            <h2 className="text-base font-extrabold text-slate-800 tracking-tight flex items-center">
              <span className="flex h-2.5 w-2.5 relative mr-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span>Internet Café Computer Monitoring</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Live workstation status tracked via physical machine agents reporting heartbeats.</p>
          </div>
          <span className="self-start sm:self-auto bg-slate-900 text-slate-300 border border-slate-800 text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider">
            Realtime Listener: ACTIVE
          </span>
        </div>

        {loading && computers.length === 0 ? (
          <div className="h-[120px] bg-slate-50 border border-slate-200 border-dashed rounded-3xl flex flex-col items-center justify-center text-center text-slate-400">
            <RefreshCw className="w-5 h-5 animate-spin text-rose-500 mb-1.5" />
            <span className="text-[11px] font-mono">Listening for live hardware signals...</span>
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

      <div className="pt-4 border-t border-slate-200/60 text-left">
        <h2 className="text-base font-extrabold text-slate-800 tracking-tight">Workstation Allocations & Billing</h2>
        <p className="text-xs text-slate-500 mt-0.5">Manually start or stop sessions, manage client billing, and put machines out of service.</p>
      </div>

      {/* Grid of Workstations */}
      {loading && computers.length === 0 ? (
        <div className="h-[250px] flex flex-col items-center justify-center text-center text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin text-rose-500 mb-2" />
          <span className="text-xs font-mono">Synchronizing workstations and VLAN servers...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {computers.map(computer => {
            const session = runningSessions.find(s => s.computer_id === computer.id && s.status === 'ACTIVE');
            const elapsed = session ? getElapsedMinutes(session.start_time) : 0;
            const liveCharge = session ? (elapsed * (session.rate_per_minute || 1.00)) : 0;

            // Map UI status
            let mappedStatus = computer.status.toUpperCase();
            if (computer.status === 'Occupied') {
              mappedStatus = 'ACTIVE';
            }

            return (
              <motion.div
                key={computer.id}
                whileHover={{ y: -3 }}
                className={`bg-white rounded-3xl p-5 border shadow-xs transition-all relative overflow-hidden flex flex-col justify-between min-h-[260px] text-left ${
                  computer.status === 'Occupied' ? 'border-amber-200 bg-amber-50/5' :
                  computer.status === 'Maintenance' ? 'border-rose-100 bg-rose-50/10' :
                  'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Header block details */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center space-x-2">
                      <div className={`p-2.5 rounded-xl flex items-center justify-center ${
                        computer.status === 'Occupied' ? 'bg-amber-100 text-amber-800' :
                        computer.status === 'Maintenance' ? 'bg-rose-100 text-rose-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        <Monitor className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-sm text-slate-800 mb-0.5">{computer.computer_name}</h3>
                        <code className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">{computer.computer_code}</code>
                      </div>
                    </div>

                    {/* Status Indicator badge */}
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-wide uppercase ${
                      computer.status === 'Occupied' ? 'bg-amber-100 text-amber-805' :
                      computer.status === 'Maintenance' ? 'bg-rose-100 text-rose-855' :
                      'bg-slate-100 text-slate-500'
                    }`}>
                      {mappedStatus}
                    </span>
                  </div>

                  {/* Session telemetry if Active */}
                  {computer.status === 'Occupied' && session ? (
                    <div className={`p-3.5 rounded-2xl space-y-2 mt-2 font-mono text-[11px] border transition-all ${
                      elapsed >= 60 
                        ? 'bg-rose-950/20 border-rose-500 animate-pulse text-rose-100' 
                        : 'bg-slate-900 border-slate-800 text-slate-200'
                    }`}>
                      {elapsed >= 60 && (
                        <div className="bg-rose-600 text-white font-extrabold text-[9px] py-1 px-2 rounded-lg text-center tracking-wide animate-bounce uppercase font-sans mb-1.5 flex items-center justify-center space-x-1">
                          <span>⚠️ HEAVY USAGE: OVER 60 MINS</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-500">Customer:</span>
                        <span className="font-bold text-amber-400 truncate max-w-[120px]" title={session.customer_name}>
                          {session.customer_name}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 flex items-center">
                          <Clock className="w-3 h-3 mr-1 text-slate-400" /> Time Used:
                        </span>
                        <span className={`font-semibold ${elapsed >= 60 ? 'text-rose-400 font-bold' : 'text-slate-150'}`}>{elapsed} minutes</span>
                      </div>
                      <div className="flex justify-between items-center text-rose-300">
                        <span className="text-slate-500 flex items-center">
                          <Coins className="w-3 h-3 mr-1 text-slate-400" /> Amount:
                        </span>
                        <span className={`font-bold ${elapsed >= 60 ? 'text-rose-400 text-xs' : ''}`}>K{liveCharge.toFixed(2)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 py-4 font-mono">
                      {computer.status === 'Maintenance' ? (
                        <span className="text-rose-600 flex items-center">
                          <ShieldAlert className="w-4 h-4 mr-1 text-rose-500 animate-pulse shrink-0" /> Out of service lockdown.
                        </span>
                      ) : (
                        <span>Workstation is AVAILABLE. Ready for allocation.</span>
                      )}
                    </div>
                  )}

                  {/* ==========================================
                      PC TRACKING AGENT FOUNDATION HOOKS
                      ========================================== */}
                  <div className="mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-400 font-mono space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="flex items-center">
                        <Server className="w-3 h-3 mr-1 text-slate-350" /> PC Tracking Agent:
                      </span>
                      <span className={`font-bold ${computer.status === 'Maintenance' ? 'text-rose-400' : 'text-emerald-500'}`}>
                        {computer.status === 'Maintenance' ? 'SUSPENDED' : 'READY_TO_CONNECT'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Online heartbeat:</span>
                      <span className="text-slate-500">
                        {computer.status === 'Maintenance' ? 'Offline' : 'Ready (Active Listener)'}
                      </span>
                    </div>
                    <div className="flex justify-between truncate">
                      <span>Gateway node:</span>
                      <span className="text-slate-500">wc-hook://{computer.computer_code.toLowerCase()}.dube.net</span>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="border-t border-slate-100 pt-3.5 mt-3.5 flex items-center justify-between gap-2">
                  <div className="text-slate-400 text-[10px] font-mono">
                    Rate: K{computer.rate_per_minute || 1.00}/min
                  </div>

                  <div className="flex space-x-1.5">
                    {/* Maintenance Toggle */}
                    {computer.status !== 'Occupied' && (
                      <button
                        onClick={() => handleToggleMaintenance(computer)}
                        className={`p-2 rounded-xl border transition-all cursor-pointer ${
                          computer.status === 'Maintenance'
                            ? 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'
                            : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600'
                        }`}
                        title={computer.status === 'Maintenance' ? 'Re-enable terminal node' : 'Enter Maintenance mode'}
                      >
                        <Wrench className="w-3.5 h-3.5" />
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
                        className="px-3.5 py-2 bg-rose-500 hover:bg-rose-600 hover:shadow-xs text-white rounded-xl text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer"
                      >
                        <Play className="w-3 h-3 fill-white shrink-0" />
                        <span>START SESSION</span>
                      </button>
                    ) : computer.status === 'Occupied' ? (
                      <button
                        onClick={() => handleTerminateSession(computer)}
                        className="px-3 py-2 bg-slate-900 hover:bg-rose-600 text-slate-400 hover:text-white rounded-xl text-xs font-bold flex items-center space-x-1 border border-slate-800 hover:border-transparent transition-all cursor-pointer"
                      >
                        <Square className="w-3 h-3 fill-current shrink-0" />
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border rounded-3xl max-w-sm w-full p-6 shadow-2xl relative text-left"
          >
            <div className="mb-4">
              <span className="text-[10px] font-bold text-rose-500 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full uppercase font-mono">
                Initiating Client allocation
              </span>
              <h3 className="text-base font-bold text-slate-800 mt-2">Start Café Session</h3>
              <p className="text-slate-400 text-xs mt-0.5">Workstation: <strong>{selectedComp.computer_name}</strong> &bull; Rate: K{selectedComp.rate_per_minute || 1.00}/min</p>
            </div>

            <form onSubmit={handleStartSessionSubmit} className="space-y-4 text-xs font-sans">
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Customer reference name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John"
                  value={customerFormName}
                  onChange={(e) => setCustomerFormName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs outline-none focus:border-rose-500 transition-all"
                />
              </div>

              <div className="flex space-x-2 pt-3 border-t justify-end text-xs font-bold animate-fadeIn">
                <button
                  type="button"
                  onClick={() => {
                    setIsStartingSession(false);
                    setSelectedComp(null);
                    setCustomerFormName('');
                  }}
                  className="px-4 py-2 text-slate-500 hover:bg-slate-50 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-white bg-rose-500 hover:bg-rose-600 rounded-xl shadow-md cursor-pointer transition animate-pulse"
                >
                  Launch Terminal lock
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* BILLING CONFIRMATION MODAL */}
      {billingConfirmation && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border rounded-3xl max-w-sm w-full p-6 shadow-2xl relative text-left"
          >
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3 text-emerald-600">
                <Check className="w-6 h-6 stroke-[3]" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Terminal Billing Invoice</h3>
              <p className="text-slate-400 text-xs mt-0.5">Workstation: {billingConfirmation.computer_name}</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 font-mono text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Customer name:</span>
                <span className="font-bold text-slate-800">{billingConfirmation.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span>Total elapsed time:</span>
                <span className="font-bold text-slate-800">{billingConfirmation.duration_minutes} minutes</span>
              </div>
              <div className="flex justify-between items-center text-slate-800 border-t pt-2 font-bold text-sm">
                <span>Total billing:</span>
                <span className="text-rose-605 text-base">K {Number(billingConfirmation.amount).toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={() => setBillingConfirmation(null)}
              className="mt-5 w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center justify-center space-x-1 transition-all cursor-pointer"
            >
              <span>Acknowledge & Save Receipt</span>
            </button>
          </motion.div>
        </div>
      )}

      {/* PC Agent Connectivity Info Footer panel */}
      <div className="bg-slate-50 rounded-3xl p-5 border border-slate-200 text-left font-sans mt-8">
        <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2 flex items-center">
          <Server className="w-4 h-4 mr-1.5 text-rose-500 animate-pulse" />
          PC Agent Hook & Sync Foundation (API Ready)
        </h3>
        <p className="text-xs text-slate-500 leading-relaxed mb-4">
          This system is pre-configured with active hooks for future workstation agent connection. Workstation terminal daemons can query 
          online heartbeat status, report user activity triggers, and sync session state lockdowns via standard JSON payloads.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 font-mono text-[10px] text-slate-450 bg-white p-3.5 border border-slate-200 rounded-2xl">
          <div>
            <span className="text-slate-400 block uppercase tracking-wide mb-0.5">Heartbeat Endpoint</span>
            <code className="text-slate-700">POST /api/agent/ping</code>
          </div>
          <div>
            <span className="text-slate-400 block uppercase tracking-wide mb-0.5 font-sans">Active Lockscreen Protocol</span>
            <code className="text-slate-700">WS Gateway Hook / Ready</code>
          </div>
          <div>
            <span className="text-slate-400 block uppercase tracking-wide mb-0.5 font-sans">Supported Agent Version</span>
            <code className="text-slate-700">v1.1.0-beta</code>
          </div>
        </div>
      </div>
    </div>
  );
}
