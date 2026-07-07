import React, { useState } from 'react';
import { getComputers } from '../utils/db';
import { Terminal, ShieldCheck, Cpu, HardDrive, RefreshCcw, Wifi, KeyRound, Play, HelpCircle, Lock } from 'lucide-react';
import { motion } from 'motion/react';

export default function PCAgentConsole() {
  const computers = getComputers();
  const [activeTab, setActiveTab] = useState<'status' | 'cryptography'>('status');
  const [selectedComp, setSelectedComp] = useState<string>(computers[0].computer_code);
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
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">PC-Agent Orchestration</h1>
          <p className="text-sm text-slate-500 mt-1">Supervise native computer heartbeats, authenticate security tokens, and plan secure workstation blocking.</p>
        </div>
        <button
          onClick={runHeartbeatSimulation}
          disabled={isSimulatingHeartbeat}
          className="px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
        >
          <RefreshCcw className={`w-3.5 h-3.5 ${isSimulatingHeartbeat ? 'animate-spin' : ''}`} />
          <span>Force Diagnostic Heartbeat Audit</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Heartbeat Monitor terminal logs (7 cols) */}
        <div className="lg:col-span-7">
          <div className="bg-slate-950 border border-slate-900 rounded-3xl p-5 shadow-inner space-y-4">
            <div className="flex justify-between items-center border-b border-slate-900 pb-3">
              <span className="text-xs text-rose-500 font-bold block uppercase tracking-wider font-mono flex items-center">
                <Terminal className="w-4 h-4 mr-1.5" /> Telemetry Stream Listener
              </span>
              <div className="flex space-x-1">
                <span className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping"></span>
                <span className="w-2.5 h-2.5 bg-rose-500 rounded-full absolute"></span>
              </div>
            </div>

            {/* Terminal logs lists */}
            <div className="bg-black/40 border border-slate-900 p-4 rounded-2xl h-[280px] overflow-y-auto font-mono text-[11px] text-zinc-400 space-y-1.5">
              {heartbeatLogs.map((log, idx) => (
                <div key={idx} className={log.includes('success') ? 'text-emerald-400' : log.includes('dispatched') ? 'text-amber-400' : 'text-zinc-500'}>
                  {log}
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
              <span>Listener Port: Gateway (IPC Channel)</span>
              <span>HMAC Keys status: Activated</span>
            </div>
          </div>
        </div>

        {/* Cryptography and Lock Handshake schemas (5 cols) */}
        <div className="lg:col-span-5">
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex border-b pb-3 mb-2 space-x-4">
              <button
                onClick={() => setActiveTab('status')}
                className={`text-xs font-extrabold pb-1 transition-all border-b-2 ${
                  activeTab === 'status' ? 'border-rose-500 text-rose-600' : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                Safe Terminal Locking
              </button>
              <button
                onClick={() => setActiveTab('cryptography')}
                className={`text-xs font-extrabold pb-1 transition-all border-b-2 ${
                  activeTab === 'cryptography' ? 'border-rose-500 text-rose-600' : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                HMAC Verification handshake
              </button>
            </div>

            {activeTab === 'status' ? (
              <div className="space-y-3.5 text-xs text-slate-500 text-left">
                <div className="bg-emerald-50/45 p-4 border border-emerald-100 rounded-2xl flex items-start space-x-2.5">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0 stroke-[2.5]" />
                  <div>
                    <span className="font-extrabold text-emerald-800 text-[11px] block uppercase">Zero Remote shells policy</span>
                    <p className="mt-0.5 text-slate-600 leading-snug">
                      To prevent any forms of remote exploit, <strong className="text-slate-800">the system strictly forbids any remote code shells</strong>. The local lock screen agent operates strictly inside isolated parameters.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start space-x-2">
                    <div className="p-1 px-2.5 bg-slate-100 font-mono text-[10px] font-bold text-slate-500 rounded-md shrink-0 mt-0.5">A</div>
                    <div>
                      <strong className="text-slate-700 block">Desktop Overlay</strong>
                      <span className="text-slate-500">Upon expiry or boot, the client agent overlays an un-bypassable modal blocking keyboard interrupts (Win + D, Alt + Tab, Ctrl+Shift+Esc).</span>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <div className="p-1 px-2.5 bg-slate-100 font-mono text-[10px] font-bold text-slate-500 rounded-md shrink-0 mt-0.5">B</div>
                    <div>
                      <strong className="text-slate-700 block">Remote Lock / Unlock signals</strong>
                      <span className="text-slate-500">Upon operator click inside this console, a secure event triggers on the Supabase Realtime socket. The agent processes the state and unlocks.</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-slate-500">
                <p className="leading-snug">
                  Handshakes safeguard transactions using self-signed tokens validated via backend or per-device HMAC keys:
                </p>

                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/60 font-mono text-[10px] text-slate-600 block leading-snug uppercase space-y-1">
                  <div>1. Dispatched packet payloads</div>
                  <div className="text-rose-500 font-bold">"computer_code": "PC-01"</div>
                  <div className="text-rose-500 font-semibold">"timestamp": 178523945</div>
                  <div>2. Computed sha256 outputs</div>
                  <div className="text-emerald-600 font-bold select-all truncate">7af802cd43b12dc17abef768297fbc</div>
                </div>

                <div className="flex items-center space-x-2.5 text-slate-400 bg-slate-50 p-2.5 px-3 rounded-xl border border-dashed border-slate-300 text-[10px]">
                  <KeyRound className="w-4 h-4 text-slate-500" />
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

