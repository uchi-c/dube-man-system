import React, { useEffect, useState } from 'react';
import { Settings2, Save, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  fetchPrintPricingSettings, upsertPrintPricingSettings
} from '../services/supabase';
import { formatCurrency } from '../utils/format';

interface PricingForm {
  bw_price_per_page:     number;
  colour_price_per_page: number;
  paper_cost_per_page:   number;
}

export default function PrintSettings() {
  const [form, setForm]       = useState<PricingForm>({
    bw_price_per_page: 1.00,
    colour_price_per_page: 5.00,
    paper_cost_per_page: 0.20,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await fetchPrintPricingSettings();
      if (data) {
        setForm({
          bw_price_per_page: data.bw_price_per_page,
          colour_price_per_page: data.colour_price_per_page,
          paper_cost_per_page: data.paper_cost_per_page,
        });
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setError(null);
    const ok = await upsertPrintPricingSettings(form);
    if (ok) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } else {
      setError('Failed to save settings. Check your permissions and try again.');
    }
    setSaving(false);
  };

  const marginBW = form.bw_price_per_page - form.paper_cost_per_page;
  const marginColour = form.colour_price_per_page - form.paper_cost_per_page;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" style={{ color: 'var(--text-low)' }}>
        <RefreshCw className="dm-spin" style={{ width: 18, height: 18, marginRight: 8 }} />
        <span style={{ fontSize: '0.8125rem', fontFamily: 'monospace' }}>Loading settings…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-lg" id="print-settings">
      <div>
        <h2 className="dm-h3 flex items-center space-x-2">
          <Settings2 style={{ width: 15, height: 15, color: 'var(--blue-400)' }} />
          <span>Print Pricing Settings</span>
        </h2>
        <p style={{ color: 'var(--text-low)', fontSize: '0.75rem', marginTop: 3 }}>
          These prices are used to calculate revenue, cost, and profit for every print job.
        </p>
      </div>

      <form onSubmit={handleSave} className="dm-card p-6 space-y-5">
        {/* BW price */}
        <div>
          <label className="dm-label" style={{ display: 'block', marginBottom: 6 }}>Black &amp; White — Price per Page (ZMW)</label>
          <input
            type="number" min="0" step="0.01" required
            className="dm-input"
            value={form.bw_price_per_page}
            onChange={e => setForm(f => ({ ...f, bw_price_per_page: Number(e.target.value) }))}
          />
        </div>

        {/* Colour price */}
        <div>
          <label className="dm-label" style={{ display: 'block', marginBottom: 6 }}>Colour — Price per Page (ZMW)</label>
          <input
            type="number" min="0" step="0.01" required
            className="dm-input"
            value={form.colour_price_per_page}
            onChange={e => setForm(f => ({ ...f, colour_price_per_page: Number(e.target.value) }))}
          />
        </div>

        {/* Paper cost */}
        <div>
          <label className="dm-label" style={{ display: 'block', marginBottom: 6 }}>Paper Cost per Page (ZMW)</label>
          <input
            type="number" min="0" step="0.001" required
            className="dm-input"
            value={form.paper_cost_per_page}
            onChange={e => setForm(f => ({ ...f, paper_cost_per_page: Number(e.target.value) }))}
          />
          <p style={{ fontSize: '0.625rem', color: 'var(--text-low)', marginTop: 4 }}>
            Used to calculate cost and profit per job. Typically: cost per ream ÷ pages per ream.
          </p>
        </div>

        {/* Margin preview */}
        <div className="dm-card-inset grid grid-cols-2 gap-4 dm-nums" style={{ padding: '1rem', fontSize: '0.75rem' }}>
          <div>
            <div className="dm-label" style={{ padding: 0, marginBottom: 4 }}>B&amp;W Margin / Page</div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: marginBW >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {formatCurrency(marginBW, { decimals: 3 })}
            </div>
          </div>
          <div>
            <div className="dm-label" style={{ padding: 0, marginBottom: 4 }}>Colour Margin / Page</div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: marginColour >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {formatCurrency(marginColour, { decimals: 3 })}
            </div>
          </div>
        </div>

        {success && (
          <div className="dm-badge dm-badge-success" style={{ width: '100%', padding: '0.65rem 1rem', whiteSpace: 'normal' }}>
            <CheckCircle2 style={{ width: 15, height: 15, flexShrink: 0 }} />
            <span>Settings saved successfully.</span>
          </div>
        )}

        {error && (
          <div className="dm-badge dm-badge-danger" style={{ width: '100%', padding: '0.65rem 1rem', whiteSpace: 'normal' }}>
            <AlertTriangle style={{ width: 15, height: 15, flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="dm-btn dm-btn-primary w-full"
        >
          {saving ? <RefreshCw className="dm-spin" style={{ width: 16, height: 16 }} /> : <Save style={{ width: 16, height: 16 }} />}
          <span>{saving ? 'Saving…' : 'Save Settings'}</span>
        </button>
      </form>

      {/* Note about printer-level overrides */}
      <div style={{ background: 'var(--blue-bg)', border: '1px solid rgba(76,111,255,0.30)', borderRadius: 'var(--r-card)', padding: '0.85rem 1rem', fontSize: '0.75rem', lineHeight: 1.6, color: 'var(--text-mid)' }}>
        <strong style={{ color: 'var(--text-hi)' }}>Note:</strong> These are organization-wide defaults. Individual printers can have their own
        BW / Colour cost-per-page values set in the Printers tab. When both are set, the pricing settings
        above take precedence for revenue calculations (they represent your sell price, while printer values
        represent your cost).
      </div>
    </div>
  );
}
