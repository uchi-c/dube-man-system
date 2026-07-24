import { useEffect, useState } from 'react';
import { Monitor, RefreshCw, ShieldAlert } from 'lucide-react';
import { fetchComputers, fetchRunningCafeSessions, sendComputerCommand } from '../services/supabase';
import { Computer, CafeSession } from '../types';
import ComputerStatusCard from './ComputerStatusCard';

interface PCAgentConsoleProps {
  userRole: string;
}

// Matches the RLS policy on computer_commands ("Staff manage computer
// commands" -- ADMIN/CAFE_OPERATOR only). Enforced server-side regardless;
// this just keeps the buttons from appearing to someone who can't use them.
const CAN_SEND_COMMANDS = (role: string) => role === 'ADMIN' || role === 'CAFE_OPERATOR';

export default function PCAgentConsole({ userRole }: PCAgentConsoleProps) {
  const [computers, setComputers] = useState<Computer[]>([]);
  const [sessions, setSessions] = useState<CafeSession[]>([]);
  const [loading, setLoading] = useState(true);
  // Tracks which (computer id, command) is currently in flight, so only
  // that one card's button shows a busy state.
  const [sending, setSending] = useState<{ id: string; command: 'LOCK' | 'RESTART' | 'SHUTDOWN' } | null>(null);

  const load = async () => {
    setLoading(true);
    const [comps, sess] = await Promise.all([fetchComputers(), fetchRunningCafeSessions()]);
    setComputers(comps);
    setSessions(sess);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const canSend = CAN_SEND_COMMANDS(userRole);

  const runCommand = async (computer: Computer, command: 'LOCK' | 'RESTART' | 'SHUTDOWN') => {
    if (command === 'RESTART' && !confirm(`Restart ${computer.computer_name} now? Anyone using it will lose unsaved work.`)) return;
    if (command === 'SHUTDOWN' && !confirm(`Shut down ${computer.computer_name} now? Anyone using it will lose unsaved work.`)) return;

    setSending({ id: computer.id, command });
    await sendComputerCommand(computer.computer_code, command);
    setSending(null);
  };

  return (
    <div className="space-y-6" id="pc-agent-tab">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="dm-h1">PC Agent Hub</h1>
          <p style={{ color: 'var(--text-mid)', fontSize: '0.8125rem', marginTop: 4 }}>
            Live status for every PC running the Uruu Agent. Commands take effect within one poll interval (~2s) once a PC shows Online.
          </p>
        </div>
        <button onClick={load} className="dm-btn dm-btn-ghost">
          <RefreshCw className={loading ? 'dm-spin' : ''} style={{ width: 14, height: 14 }} />
          <span>Refresh</span>
        </button>
      </div>

      {!canSend && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-2xl" style={{ background: 'var(--warning-bg)', border: '1px solid rgba(255,176,32,0.3)' }}>
          <ShieldAlert style={{ width: 16, height: 16, color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-hi)' }}>
            Your role can view PC status but can't send Lock/Restart/Shutdown commands — that needs Admin or Café Operator.
          </p>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2].map(i => <div key={i} className="dm-skeleton" style={{ height: 220 }} />)}
        </div>
      ) : computers.length === 0 ? (
        <div className="dm-card-inset flex flex-col items-center text-center" style={{ padding: '4rem 1.5rem', borderStyle: 'dashed' }}>
          <Monitor style={{ width: 40, height: 40, marginBottom: 12, color: 'var(--text-low)' }} />
          <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-mid)' }}>No PCs registered yet</p>
          <p style={{ fontSize: '0.75rem', marginTop: 4, color: 'var(--text-low)', maxWidth: 360 }}>
            Install the Uruu Agent on a PC (see pc-agent/README.md) with this organization's ID — it appears here automatically within one heartbeat.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {computers.map(computer => {
            const activeSession = sessions.find(s => s.computer_id === computer.id && s.status === 'ACTIVE');
            const busy = sending?.id === computer.id ? sending.command : null;
            return (
              <ComputerStatusCard
                key={computer.id}
                computer={computer}
                activeSession={activeSession}
                onLock={canSend ? () => runCommand(computer, 'LOCK') : undefined}
                onRestart={canSend ? () => runCommand(computer, 'RESTART') : undefined}
                onShutdown={canSend ? () => runCommand(computer, 'SHUTDOWN') : undefined}
                sendingCommand={busy}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
