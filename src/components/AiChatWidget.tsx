import { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Loader2 } from 'lucide-react';
import { sendAiChatMessage, AiChatMessage } from '../services/aiChat';

/**
 * Floating in-app AI chat, mounted globally in App.tsx for any signed-in
 * user with an org or platform-admin access. What it can actually answer
 * differs by who's asking — see ai-chat edge function's tool split — this
 * component itself doesn't know or care which, it just relays messages.
 */
export default function AiChatWidget({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setError('');
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const reply = await sendAiChatMessage(next);
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (err: any) {
      setError(err?.message || "Couldn't reach the assistant.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 300 }}>
      {open && (
        <div
          className="dm-card"
          style={{
            width: 340, height: 460, marginBottom: 12, display: 'flex', flexDirection: 'column',
            overflow: 'hidden', boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
          }}
        >
          <div className="flex items-center justify-between" style={{ padding: '0.7rem 0.9rem', borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <Bot style={{ width: 16, height: 16, color: 'var(--blue-400)' }} />
              <strong style={{ fontSize: '0.82rem', color: 'var(--text-hi)' }}>
                {isPlatformAdmin ? 'Platform Assistant' : 'Uruu Assistant'}
              </strong>
            </div>
            <button onClick={() => setOpen(false)} className="dm-icon-btn" aria-label="Close chat" style={{ width: 26, height: 26 }}>
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>

          <div ref={listRef} className="space-y-2.5" style={{ flex: 1, overflowY: 'auto', padding: '0.8rem' }}>
            {messages.length === 0 && (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-low)' }}>
                {isPlatformAdmin
                  ? "Ask about tenant billing, MRR, or which tenants have gone quiet."
                  : "Ask about today's sales, low stock, or who owes you money."}
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  maxWidth: '85%',
                  marginLeft: m.role === 'user' ? 'auto' : 0,
                  background: m.role === 'user' ? 'var(--blue-bg)' : 'var(--bg-inset)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '0.5rem 0.7rem',
                  fontSize: '0.8rem',
                  color: 'var(--text-hi)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {m.content}
              </div>
            ))}
            {sending && (
              <div className="flex items-center gap-1.5" style={{ fontSize: '0.78rem', color: 'var(--text-low)' }}>
                <Loader2 style={{ width: 13, height: 13 }} className="dm-spin" /> Thinking…
              </div>
            )}
            {error && <p style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>{error}</p>}
          </div>

          <form onSubmit={handleSend} className="flex items-center gap-1.5" style={{ padding: '0.6rem', borderTop: '1px solid var(--border)' }}>
            <input
              type="text"
              className="dm-input"
              placeholder="Ask a question…"
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={sending}
              style={{ fontSize: '0.8rem', flex: 1 }}
            />
            <button type="submit" disabled={sending || !input.trim()} className="dm-icon-btn" aria-label="Send" style={{ width: 32, height: 32 }}>
              <Send style={{ width: 15, height: 15 }} />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close assistant' : 'Open assistant'}
        style={{
          width: 52, height: 52, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'var(--blue-400)', color: '#fff', display: 'flex', alignItems: 'center',
          justifyContent: 'center', boxShadow: '0 6px 18px rgba(76,111,255,0.4)', marginLeft: 'auto',
        }}
      >
        {open ? <X style={{ width: 22, height: 22 }} /> : <Bot style={{ width: 24, height: 24 }} />}
      </button>
    </div>
  );
}
