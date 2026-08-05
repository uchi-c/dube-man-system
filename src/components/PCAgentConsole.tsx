import React, { useEffect, useState } from 'react';
import { Monitor, RefreshCw, ShieldAlert, UserPlus, X, Check, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchComputers, fetchRunningCafeSessions, sendComputerCommand } from '../services/supabase';
import { createPcProvisioningCode } from '../services/organizations';
import { Computer, CafeSession } from '../types';
import ComputerStatusCard from './ComputerStatusCard';

interface PCAgentConsoleProps {
  userRole: string;
}

// Matches the RLS policy on computer_commands ("Staff manage computer
// commands" -- ADMIN/CAFE_OPERATOR only). Enforced server-side regardless;
// this just keeps the buttons from appearing to someone who can't use them.
const CAN_SEND_COMMANDS = (role: string) => role === 'ADMIN' || role === 'CAFE_OPERATOR';

const REMOTE_INSTALL_URL = 'https://raw.githubusercontent.com/uchi-c/dube-man-system/main/pc-agent/remote-install.ps1';

function remoteInstallCommand(code: string): string {
  return `$env:URUU_CODE = "${code}"; irm ${REMOTE_INSTALL_URL} | iex`;
}

export default function PCAgentConsole({ userRole }: PCAgentConsoleProps) {
  const [computers, setComputers] = useState<Computer[]>([]);
  const [sessions, setSessions] = useState<CafeSession[]>([]);
  const [loading, setLoading] = useState(true);
  // Tracks which (computer id, command) is currently in flight, so only
  // that one card's button shows a busy state.
  const [sending, setSending] = useState<{ id: string; command: 'LOCK' | 'RESTART' | 'SHUTDOWN' } | null>(null);

  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionName, setProvisionName] = useState('');
  const [provisionResult, setProvisionResult] = useState<{ code: string; computerCode: string } | null>(null);
  const [provisionError, setProvisionError] = useState('');
  const [provisionSubmitting, setProvisionSubmitting] = useState(false);
  const [copied, setCopied] = useState<'code' | 'command' | null>(null);

  const load = async () => {
    setLoading(true);
    const [comps, sess] = await Promise.all([fetchComputers(), fetchRunningCafeSessions()]);
    setComputers(comps);
    setSessions(sess);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const canSend = CAN_SEND_COMMANDS(userRole);
  const isAdmin = userRole === 'ADMIN';

  const runCommand = async (computer: Computer, command: 'LOCK' | 'RESTART' | 'SHUTDOWN') => {
    if (command === 'RESTART' && !confirm(`Restart ${computer.computer_name} now? Anyone using it will lose unsaved work.`)) return;
    if (command === 'SHUTDOWN' && !confirm(`Shut down ${computer.computer_name} now? Anyone using it will lose unsaved work.`)) return;

    setSending({ id: computer.id, command });
    await sendComputerCommand(computer.computer_code, command);
    setSending(null);
  };

  const openProvisionForm = () => {
    setProvisionName(''); setProvisionError(''); setProvisionResult(null); setCopied(null);
    setIsProvisioning(true);
  };

  const handleProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvisionError('');
    setProvisionSubmitting(true);
    try {
      const { code, computerCode } = await createPcProvisioningCode(provisionName.trim() || undefined);
      setProvisionResult({ code, computerCode });
    } catch (err: any) {
      setProvisionError(err?.message || "Couldn't generate a code. Try again.");
    } finally {
      setProvisionSubmitting(false);
    }
  };

  const handleCopy = async (text: string, which: 'code' | 'command') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      // Clipboard API unavailable — the text is still on-screen to copy manually.
    }
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
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button onClick={openProvisionForm} className="dm-btn dm-btn-primary">
              <UserPlus style={{ width: 14, height: 14 }} />
              <span>Add a PC</span>
            </button>
          )}
          <button onClick={load} className="dm-btn dm-btn-ghost">
            <RefreshCw className={loading ? 'dm-spin' : ''} style={{ width: 14, height: 14 }} />
            <span>Refresh</span>
          </button>
        </div>
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
            {isAdmin
              ? 'Click "Add a PC" above for a one-line command you can send to whoever is at that computer — no need to be there yourself.'
              : "Ask an admin to add one from PC Agent Hub — it appears here automatically within one heartbeat once it's installed."}
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

      {/* ---- Add-a-PC slide-over ---- */}
      <AnimatePresence>
        {isProvisioning && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsProvisioning(false)}
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(7,11,36,0.6)', backdropFilter: 'blur(4px)' }}
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
              className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-sm p-6 overflow-y-auto"
              style={{ background: 'var(--bg-1)', borderLeft: '1px solid var(--panel-line)', boxShadow: 'var(--shadow-modal)' }}
              role="dialog" aria-label="Add a PC"
            >
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h3 className="dm-h2">Add a PC</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-mid)', marginTop: 2 }}>
                    Generates a one-time code + command that whoever is at the PC can run themselves.
                  </p>
                </div>
                <button onClick={() => setIsProvisioning(false)} className="dm-icon-btn" aria-label="Close">
                  <X style={{ width: 16, height: 16 }} />
                </button>
              </div>

              {provisionResult ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--success-bg)', border: '1px solid rgba(61,220,151,0.3)', fontSize: '0.78rem', color: 'var(--success)' }}>
                    <Check style={{ width: 15, height: 15, flexShrink: 0 }} strokeWidth={3} />
                    <span>Code generated for {provisionResult.computerCode}. Valid 48 hours, one-time use.</span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="dm-label" style={{ padding: 0 }}>Command to send them</label>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-low)' }}>
                      They open PowerShell as Administrator (right-click Start → Terminal (Admin)), paste this, and press Enter.
                    </p>
                    <div className="flex items-start gap-2">
                      <textarea
                        readOnly
                        className="dm-input dm-nums"
                        style={{ fontSize: '0.68rem', minHeight: 64, resize: 'none' }}
                        value={remoteInstallCommand(provisionResult.code)}
                        onFocus={e => e.target.select()}
                      />
                      <button onClick={() => handleCopy(remoteInstallCommand(provisionResult.code), 'command')} className="dm-icon-btn" aria-label="Copy command" title="Copy command">
                        {copied === 'command' ? <Check style={{ width: 15, height: 15, color: 'var(--success)' }} /> : <Copy style={{ width: 15, height: 15 }} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="dm-label" style={{ padding: 0 }}>Or just the code</label>
                    <div className="flex items-center gap-2">
                      <input type="text" readOnly className="dm-input dm-nums" style={{ fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.08em' }} value={provisionResult.code} onFocus={e => e.target.select()} />
                      <button onClick={() => handleCopy(provisionResult.code, 'code')} className="dm-icon-btn" aria-label="Copy code" title="Copy code">
                        {copied === 'code' ? <Check style={{ width: 15, height: 15, color: 'var(--success)' }} /> : <Copy style={{ width: 15, height: 15 }} />}
                      </button>
                    </div>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-low)' }}>
                      They'll be prompted for this if they just run the plain install command without the code baked in.
                    </p>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button type="button" onClick={openProvisionForm} className="dm-btn dm-btn-ghost flex-1">Add another</button>
                    <button type="button" onClick={() => setIsProvisioning(false)} className="dm-btn dm-btn-primary flex-1">Done</button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleProvision} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="dm-label" style={{ padding: 0 }}>Computer name <span style={{ opacity: 0.6, textTransform: 'none' }}>(optional — auto-numbered if left blank)</span></label>
                    <input type="text" className="dm-input" placeholder="e.g. PC-06 — leave blank to auto-number" value={provisionName} onChange={e => setProvisionName(e.target.value)} />
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-low)' }}>
                      Every PC needs a unique name — a name already in use (or with a pending code) is rejected here, not later at install time.
                    </p>
                  </div>

                  {provisionError && (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,107,107,0.3)', fontSize: '0.78rem', color: 'var(--danger)' }} role="alert">
                      <ShieldAlert style={{ width: 15, height: 15, flexShrink: 0 }} />
                      <span>{provisionError}</span>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button type="button" onClick={() => setIsProvisioning(false)} className="dm-btn dm-btn-ghost flex-1">Cancel</button>
                    <button type="submit" disabled={provisionSubmitting} className="dm-btn dm-btn-primary flex-1">{provisionSubmitting ? 'Generating…' : 'Generate code'}</button>
                  </div>
                </form>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
