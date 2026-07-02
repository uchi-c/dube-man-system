import React, { useState, useEffect } from 'react';
import { Computer, CafeSession } from '../types';
import { 
  getComputers, getRunningSessions, startCafeSession, 
  terminateCafeSession, setComputerMaintenance, getPastSessions 
} from '../utils/db';
import { 
  Monitor, Play, Square, Wrench, ShieldAlert, 
  Clock, Coins, User, Check, DollarSign, Terminal, Activity 
} from 'lucide-react';
import { motion } from 'motion/react';

interface CafeConsoleProps {
  userRole: string;
}

export default function CafeConsole({ userRole }: CafeConsoleProps) {
  const [computers, setComputers] = useState<Computer[]>(getComputers());
  const [runningSessions, setRunningSessions] = useState<CafeSession[]>(getRunningSessions());
  const [pastSessions, setPastSessions] = useState<CafeSession[]>(getPastSessions());

  // Interactive Session states
  const [selectedComp, setSelectedComp] = useState<Computer | null>(null);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [customerFormName, setCustomerFormName] = useState('');
  const [billingConfirmation, setBillingConfirmation] = useState<any | null>(null);

  // Auto tick to render duration timer beautifully
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1);
    }, 15000); // refresh relative timers every 15s
    return () => clearInterval(timer);
  }, []);

  const refreshData = () => {
    setComputers(getComputers());
    setRunningSessions(getRunningSessions());
    setPastSessions(getPastSessions());
  };

  const handleStartSessionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedComp || !customerFormName.trim()) return;

    const success = startCafeSession(selectedComp.id, customerFormName);
    if (success) {
      refreshData();
      setIsStartingSession(false);
      setSelectedComp(null);
      setCustomerFormName('');
    }
  };

  const handleTerminateSession = (computer: Computer) => {
    const session = runningSessions.find(s => s.computer_id === computer.id && s.status === 'ACTIVE');
    if (!session) return;

    const completedSess = terminateCafeSession(session.id);
    if (completedSess) {
      refreshData();
      setBillingConfirmation(completedSess);
    }
  };

  const handleToggleMaintenance = (computer: Computer) => {
    const inMaintenance = computer.status === 'Maintenance';
    setComputerMaintenance(computer.id, !inMaintenance);
    refreshData();
  };

  // Utility to determine active elapsed time
  const getElapsedMinutes = (startTimeStr: string) => {
    const start = new Date(startTimeStr).getTime();
    const now = new Date().getTime();
    const diffMs = now - start;
    return Math.max(1, Math.round(diffMs / 60000));
  };

  return (
    <div className="space-y-6" id="cafe-tab">
      {/* Overview */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Internet Café Terminal Desk</h1>
          <p className="text-sm text-slate-500 mt-1">Allocate workstations, verify heartbeats, toggle maintenance lockdowns, and monitor user billings.</p>
        </div>
        <div className="text-slate-500 text-xs font-mono bg-slate-100 border border-slate-200 px-3.5 py-1.5 rounded-xl flex items-center">
          <Activity className="w-4 h-4 mr-1.5 text-emerald-500 animate-pulse" />
          Gateway Connection: Active IP-192.168.10.1
        </div>
      </div>

      {/* Grid of workstation nodes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {computers.map(computer => {
          const session = runningSessions.find(s => s.computer_id === computer.id && s.status === 'ACTIVE');
          const elapsed = session ? getElapsedMinutes(session.start_time) : 0;
          const liveCharge = session ? parseFloat(((elapsed / 60) * (computer.hourly_rate || 60.00)).toFixed(2)) : 0;

          return (
            <motion.div
              key={computer.id}
              whileHover={{ y: -3 }}
              className={`bg-white rounded-3xl p-5 border shadow-xs transition-all relative overflow-hidden flex flex-col justify-between min-h-[220px] ${
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
                      computer.status === 'Occupied' ? 'bg-amber-100 text-amber-700 animate-pulse' :
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
                    computer.status === 'Occupied' ? 'bg-amber-200/50 text-amber-800' :
                    computer.status === 'Maintenance' ? 'bg-rose-100/50 text-rose-850' :
                    'bg-slate-100 text-slate-500'
                  }`}>
                    {computer.status}
                  </span>
                </div>

                {/* Session telemetry if Occupied */}
                {computer.status === 'Occupied' && session ? (
                  <div className="bg-slate-900 text-slate-300 p-3.5 rounded-2xl space-y-2 mt-2 font-mono text-[11px] border border-slate-800">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Customer:</span>
                      <span className="font-semibold text-amber-400 truncate max-w-[120px]" title={session.customer_name}>
                        {session.customer_name}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 flex items-center">
                        <Clock className="w-3 h-3 mr-1" /> Duration:
                      </span>
                      <span className="font-semibold">{elapsed} mins elapsed</span>
                    </div>
                    <div className="flex justify-between items-center text-rose-300">
                      <span className="text-slate-500 flex items-center">
                        <Coins className="w-3 h-3 mr-1" /> Live Billing:
                      </span>
                      <span className="font-bold">MWK {liveCharge.toLocaleString()}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 py-4 font-mono">
                    {computer.status === 'Maintenance' ? (
                      <span className="text-rose-600 flex items-center">
                        <ShieldAlert className="w-4 h-4 mr-1 text-rose-500 animate-pulse" /> Out of service lockdown.
                      </span>
                    ) : (
                      <span>Workstation is empty. Ready for allocation.</span>
                    )}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="border-t border-slate-100 pt-3.5 mt-3.5 flex items-center justify-between gap-2">
                <div className="text-slate-400 text-[10px] font-mono">
                  Rate: MWK {computer.hourly_rate}/hr
                </div>

                <div className="flex space-x-1.5">
                  {/* Maintenance Toggle */}
                  {computer.status !== 'Occupied' && (
                    <button
                      onClick={() => handleToggleMaintenance(computer)}
                      className={`p-2 rounded-xl border transition-all ${
                        computer.status === 'Maintenance'
                          ? 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'
                          : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600'
                      }`}
                      title={computer.status === 'Maintenance' ? 'Remove Maintenance LOCK' : 'Mark as Maintenance'}
                    >
                      <Wrench className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Operational actions */}
                  {computer.status === 'Available' ? (
                    <button
                      onClick={() => {
                        setSelectedComp(computer);
                        setIsStartingSession(true);
                      }}
                      className="px-3 py-2 bg-rose-500 hover:bg-rose-600 hover:shadow-xs text-white rounded-xl text-xs font-bold flex items-center space-x-1 transition-all"
                    >
                      <Play className="w-3 h-3 fill-white" />
                      <span>Start Session</span>
                    </button>
                  ) : computer.status === 'Occupied' ? (
                    <button
                      onClick={() => handleTerminateSession(computer)}
                      className="px-3 py-2 bg-slate-900 hover:bg-rose-600 text-slate-400 hover:text-white rounded-xl text-xs font-bold flex items-center space-x-1 border border-slate-800 hover:border-rose-600 transition-all"
                    >
                      <Square className="w-3 h-3 fill-current" />
                      <span>End Task</span>
                    </button>
                  ) : null}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* START SESSION DIALOG */}
      {isStartingSession && selectedComp && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border rounded-3xl max-w-sm w-full p-6 shadow-2xl relative"
          >
            <div className="mb-4">
              <span className="text-[10px] font-bold text-rose-500 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full uppercase font-mono">
                Initiating Client allocation
              </span>
              <h3 className="text-base font-bold text-slate-800 mt-2">Start Café Session</h3>
              <p className="text-slate-400 text-xs mt-0.5">Workstation: <strong>{selectedComp.computer_name}</strong> &bull; Rate: MWK {selectedComp.hourly_rate}/hr</p>
            </div>

            <form onSubmit={handleStartSessionSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Customer identifier name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kondwani Tembo"
                  value={customerFormName}
                  onChange={(e) => setCustomerFormName(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-755 text-xs outline-none focus:border-rose-500 transition-all"
                />
              </div>

              <div className="flex space-x-2 pt-3 border-t justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsStartingSession(false);
                    setSelectedComp(null);
                    setCustomerFormName('');
                  }}
                  className="px-4 py-2 text-xs text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-500 hover:bg-rose-600 rounded-xl shadow-md"
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
            className="bg-white border rounded-3xl max-w-sm w-full p-6 shadow-2xl relative"
          >
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3 text-emerald-600">
                <Check className="w-6 h-6 stroke-[3]" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Terminal Billing Invoice</h3>
              <p className="text-slate-400 text-xs mt-0.5">Workstation: {billingConfirmation.computer_name}</p>
            </div>

            <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-2 font-mono text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Customer name:</span>
                <span className="font-bold text-slate-900">{billingConfirmation.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span>Total active time:</span>
                <span className="font-bold text-slate-900">{billingConfirmation.duration_minutes} minutes</span>
              </div>
              <div className="flex justify-between items-center text-slate-800 border-t pt-2 font-bold text-sm">
                <span>Amount Due:</span>
                <span className="text-rose-600 text-base">MWK {billingConfirmation.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
            </div>

            <button
              onClick={() => setBillingConfirmation(null)}
              className="mt-5 w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center justify-center space-x-1 transition-all"
            >
              <span>Acknowledge & Collect Cash</span>
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}

