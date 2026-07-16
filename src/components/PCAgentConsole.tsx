import { useState } from 'react';
import { getComputers } from '../utils/db';
import { Terminal, ShieldCheck, RefreshCcw, KeyRound } from 'lucide-react';

export default function PCAgentConsole() {
  const computers = getComputers();
  const [activeTab, setActiveTab] = useState<'status' | 'cryptography'>('status');
  const [isSimulatingHeartbeat, setIsSimulatingHeartbeat] = useState(false);
  const [heartbeatLogs, setHeartbeatLogs] = useState<string[]>([
    "[SYSTEM] PC-Agent telemetry listener initialized successfully.",
    "[PC-01] Valid heartbeat received. HMAC Verified. Status: Busy",
    "[PC-02] Valid heartbeat received. HMAC Verified. Status: Available",
    "[PC-04] Valid heartbeat received. HMAC Verified. Status: Busy"
  ]);

  const runHeartbeatSimulation = () => {
    setIsSimulatingHeartbeat(true);
    setHeartbeatLogs(prev => [
      `[SYSTEM] Dispatched diagnostic ping request...`,
      ...prev
    ]);

    setTimeout(() => {
      const now = new Date().toLocaleTimeString();
      const randomPc = computers[Math.floor(Math.random() * computers.length)].computer_code;
      const hmacHash = Math.random().toString(16).substr(2, 16);

      setHeartbeatLogs(prev => [
        `[${randomPc}] Handshake success - Received cryptographic heartbeat at ${now}. HMAC hash: sha255-${hmacHash}`,
        ...prev
      ]);
      setIsSimulatingHeartbeat(false);
    }, 1200);
  };

  return (
    <div className="space-y-6" id="pc-agent-tab">
      {/* Overview */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="dm-h1">PC-Agent Orchestration</h1>
          <p style={{ color: 'var(--text-mid)', fontSize: '0.8125rem', marginTop: 4 }}>Supervise native computer heartbeats, authenticate security tokens, and plan secure workstation blocking.</p>
        </div>
        <button
          onClick={runHeartbeatSimulation}
          disabled={isSimulatingHeartbeat}
          className="dm-btn dm-btn-ghost"
        >
          <RefreshCcw className={isSimulatingHeartbeat ? 'dm-spin' : ''} style={{ width: 14, height: 14 }} />
          <span>Force Diagnostic Heartbeat Audit</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Heartbeat Monitor terminal logs (7 cols) */}
        <div className="lg:col-span-7">
          <div className="dm-card p-5 space-y-4">
            <div className="flex justify-between items-center pb-3" style={{ borderBottom: '1px solid var(--panel-line)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--blue-400)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'monospace', display: 'flex', alignItems: 'center' }}>
                <Terminal style={{ width: 15, height: 15, marginRight: 6 }} /> Telemetry Stream Listener
              </span>
              <span className="dm-dot dm-dot-success dm-dot-pulse" />
            </div>

            {/* Terminal logs lists */}
            <div className="dm-card-inset space-y-1.5" style={{ padding: '1rem', height: 280, overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.6875rem' }}>
              {heartbeatLogs.map((log, idx) => (
                <div key={idx} style={{ color: log.includes('success') ? 'var(--success)' : log.includes('dispatched') ? 'var(--warning)' : 'var(--text-low)' }}>
                  {log}
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center" style={{ fontSize: '0.625rem', color: 'var(--text-low)', fontFamily: 'monospace' }}>
              <span>Listener Port: Gateway (IPC Channel)</span>
              <span>HMAC Keys status: Activated</span>
            </div>
          </div>
        </div>

        {/* Cryptography and Lock Handshake schemas (5 cols) */}
        <div className="lg:col-span-5">
          <div className="dm-card p-5 space-y-4">
            <div className="flex pb-3 mb-2 space-x-4" style={{ borderBottom: '1px solid var(--panel-line)' }}>
              <button
                onClick={() => setActiveTab('status')}
                style={{
                  fontSize: '0.75rem', fontWeight: 800, paddingBottom: 4, transition: 'all 0.15s',
                  borderBottom: `2px solid ${activeTab === 'status' ? 'var(--blue-500)' : 'transparent'}`,
                  color: activeTab === 'status' ? 'var(--blue-400)' : 'var(--text-low)',
                  background: 'none', border: 'none', borderBottomWidth: 2, cursor: 'pointer',
                }}
              >
                Safe Terminal Locking
              </button>
              <button
                onClick={() => setActiveTab('cryptography')}
                style={{
                  fontSize: '0.75rem', fontWeight: 800, paddingBottom: 4, transition: 'all 0.15s',
                  borderBottom: `2px solid ${activeTab === 'cryptography' ? 'var(--blue-500)' : 'transparent'}`,
                  color: activeTab === 'cryptography' ? 'var(--blue-400)' : 'var(--text-low)',
                  background: 'none', border: 'none', borderBottomWidth: 2, cursor: 'pointer',
                }}
              >
                HMAC Verification handshake
              </button>
            </div>

            {activeTab === 'status' ? (
              <div className="space-y-3.5 text-left" style={{ fontSize: '0.75rem', color: 'var(--text-mid)' }}>
                <div className="flex items-start space-x-2.5" style={{ padding: '1rem', background: 'var(--success-bg)', border: '1px solid rgba(61,220,151,0.28)', borderRadius: 'var(--r-card)' }}>
                  <ShieldCheck style={{ width: 20, height: 20, color: 'var(--success)', marginTop: 2, flexShrink: 0, strokeWidth: 2.5 }} />
                  <div>
                    <span style={{ fontWeight: 800, color: 'var(--success)', fontSize: '0.6875rem', display: 'block', textTransform: 'uppercase' }}>Zero Remote shells policy</span>
                    <p style={{ marginTop: 2, color: 'var(--text-mid)', lineHeight: 1.4 }}>
                      To prevent any forms of remote exploit, <strong style={{ color: 'var(--text-hi)' }}>the system strictly forbids any remote code shells</strong>. The local lock screen agent operates strictly inside isolated parameters.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start space-x-2">
                    <div className="dm-card-inset flex-shrink-0" style={{ padding: '0.25rem 0.6rem', fontFamily: 'monospace', fontSize: '0.625rem', fontWeight: 700, color: 'var(--text-low)', borderRadius: 6, marginTop: 2 }}>A</div>
                    <div>
                      <strong style={{ color: 'var(--text-hi)', display: 'block' }}>Desktop Overlay</strong>
                      <span style={{ color: 'var(--text-low)' }}>Upon expiry or boot, the client agent overlays an un-bypassable modal blocking keyboard interrupts (Win + D, Alt + Tab, Ctrl+Shift+Esc).</span>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <div className="dm-card-inset flex-shrink-0" style={{ padding: '0.25rem 0.6rem', fontFamily: 'monospace', fontSize: '0.625rem', fontWeight: 700, color: 'var(--text-low)', borderRadius: 6, marginTop: 2 }}>B</div>
                    <div>
                      <strong style={{ color: 'var(--text-hi)', display: 'block' }}>Remote Lock / Unlock signals</strong>
                      <span style={{ color: 'var(--text-low)' }}>Upon operator click inside this console, a secure event triggers on the Supabase Realtime socket. The agent processes the state and unlocks.</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3" style={{ fontSize: '0.75rem', color: 'var(--text-mid)' }}>
                <p style={{ lineHeight: 1.4 }}>
                  Handshakes safeguard transactions using self-signed tokens validated via backend or per-device HMAC keys:
                </p>

                <div className="dm-card-inset space-y-1" style={{ padding: '0.85rem', fontFamily: 'monospace', fontSize: '0.625rem', color: 'var(--text-mid)', lineHeight: 1.5, textTransform: 'uppercase' }}>
                  <div>1. Dispatched packet payloads</div>
                  <div style={{ color: 'var(--blue-400)', fontWeight: 700 }}>"computer_code": "PC-01"</div>
                  <div style={{ color: 'var(--blue-400)', fontWeight: 600 }}>"timestamp": 178523945</div>
                  <div>2. Computed sha256 outputs</div>
                  <div className="dm-truncate" style={{ color: 'var(--success)', fontWeight: 700 }}>7af802cd43b12dc17abef768297fbc</div>
                </div>

                <div className="flex items-center space-x-2.5" style={{ color: 'var(--text-low)', background: 'var(--panel-2)', padding: '0.6rem 0.75rem', borderRadius: 'var(--r-control)', border: '1px dashed var(--panel-line-strong)', fontSize: '0.625rem' }}>
                  <KeyRound style={{ width: 15, height: 15, color: 'var(--text-mid)', flexShrink: 0 }} />
                  <span>Verify signature headers mismatch triggers immediate workstation block.</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
