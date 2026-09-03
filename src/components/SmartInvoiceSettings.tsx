import { useEffect, useState } from 'react';
import { Receipt, RefreshCw, CheckCircle2, AlertTriangle, Zap } from 'lucide-react';
import {
  fetchSmartInvoiceSettings, saveSmartInvoiceSettings, initSmartInvoiceDevice, SmartInvoiceSettingsInput,
} from '../services/smartInvoice';

const EMPTY: SmartInvoiceSettingsInput = {
  environment: 'sandbox',
  tpin: '',
  branch_id: '000',
  device_serial_no: '',
  vsdc_base_url: '',
  is_enabled: false,
};

/**
 * ZRA Smart Invoice (VSDC) settings — scaffold. Lets an org admin store the
 * TPIN/branch/device credentials and VSDC server URL ZRA issues after
 * Smart Invoice Taxpayer Portal + VSDC approval (see the migration 025
 * header for why vsdc_base_url is per-org: VSDC is a local install, not a
 * shared ZRA cloud endpoint). "Initialize Device" is the first real call
 * to ZRA and only makes sense once all four fields are filled in.
 */
export default function SmartInvoiceSettings() {
  const [form, setForm] = useState<SmartInvoiceSettingsInput>(EMPTY);
  const [initialized, setInitialized] = useState(false);
  const [lastInitResult, setLastInitResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await fetchSmartInvoiceSettings();
        if (data) {
          setForm({
            environment: data.environment,
            tpin: data.tpin ?? '',
            branch_id: data.branch_id,
            device_serial_no: data.device_serial_no ?? '',
            vsdc_base_url: data.vsdc_base_url ?? '',
            is_enabled: data.is_enabled,
          });
          setInitialized(data.is_initialized);
          setLastInitResult(data.last_init_result);
        }
      } catch {
        // Non-critical on load — form just starts empty.
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setError(null);
    try {
      await saveSmartInvoiceSettings(form);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings.');
    }
    setSaving(false);
  };

  const handleInit = async () => {
    setInitializing(true);
    setError(null);
    try {
      const result = await initSmartInvoiceDevice();
      setInitialized(result.success);
      setLastInitResult(result.raw);
      if (!result.success) setError(`ZRA did not confirm initialization (result code: ${result.resultCd ?? 'unknown'}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize device with ZRA.');
    }
    setInitializing(false);
  };

  const canInit = !!(form.tpin && form.device_serial_no && form.vsdc_base_url);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" style={{ color: 'var(--text-low)' }}>
        <RefreshCw className="dm-spin" style={{ width: 18, height: 18, marginRight: 8 }} />
        <span style={{ fontSize: '0.8125rem', fontFamily: 'monospace' }}>Loading settings…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-lg" id="smart-invoice-settings">
      <div>
        <h2 className="dm-h3 flex items-center space-x-2">
          <Receipt style={{ width: 15, height: 15, color: 'var(--blue-400)' }} />
          <span>ZRA Smart Invoice</span>
        </h2>
        <p style={{ color: 'var(--text-low)', fontSize: '0.75rem', marginTop: 3 }}>
          Fiscalises sales through ZRA's Smart Invoice (VSDC) system. Requires a TPIN, VAT registration, and an
          approved VSDC device from ZRA before this will work — see the Smart Invoice Taxpayer Portal.
        </p>
      </div>

      <form onSubmit={handleSave} className="dm-card p-6 space-y-5">
        <div>
          <label className="dm-label" style={{ display: 'block', marginBottom: 6 }}>Environment</label>
          <select
            className="dm-input"
            value={form.environment}
            onChange={e => setForm(f => ({ ...f, environment: e.target.value as 'sandbox' | 'production' }))}
          >
            <option value="sandbox">Sandbox (testing)</option>
            <option value="production">Production</option>
          </select>
        </div>

        <div>
          <label className="dm-label" style={{ display: 'block', marginBottom: 6 }}>TPIN</label>
          <input
            type="text" className="dm-input"
            value={form.tpin ?? ''}
            onChange={e => setForm(f => ({ ...f, tpin: e.target.value }))}
            placeholder="Taxpayer Identification Number"
          />
        </div>

        <div>
          <label className="dm-label" style={{ display: 'block', marginBottom: 6 }}>Branch ID (bhfId)</label>
          <input
            type="text" className="dm-input"
            value={form.branch_id}
            onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))}
            placeholder="000"
          />
        </div>

        <div>
          <label className="dm-label" style={{ display: 'block', marginBottom: 6 }}>Device Serial Number</label>
          <input
            type="text" className="dm-input"
            value={form.device_serial_no ?? ''}
            onChange={e => setForm(f => ({ ...f, device_serial_no: e.target.value }))}
            placeholder="Issued by ZRA when your VSDC device is approved"
          />
        </div>

        <div>
          <label className="dm-label" style={{ display: 'block', marginBottom: 6 }}>VSDC Server URL</label>
          <input
            type="text" className="dm-input"
            value={form.vsdc_base_url ?? ''}
            onChange={e => setForm(f => ({ ...f, vsdc_base_url: e.target.value }))}
            placeholder="https://api-sandbox.zra.org.zm/vsdc-api/v1"
          />
          <p style={{ fontSize: '0.625rem', color: 'var(--text-low)', marginTop: 4 }}>
            ZRA's VSDC is a local install on your own server for production — this is ZRA's shared address only while
            testing in sandbox.
          </p>
        </div>

        <label className="flex items-center gap-2" style={{ fontSize: '0.78rem', color: 'var(--text-hi)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.is_enabled}
            onChange={e => setForm(f => ({ ...f, is_enabled: e.target.checked }))}
          />
          Enable Smart Invoice for this organization
        </label>

        <div className="flex items-center gap-2" style={{ fontSize: '0.72rem', color: initialized ? 'var(--success)' : 'var(--text-low)' }}>
          {initialized ? <CheckCircle2 style={{ width: 13, height: 13 }} /> : <AlertTriangle style={{ width: 13, height: 13 }} />}
          <span>{initialized ? 'Device initialized with ZRA' : 'Device not yet initialized'}</span>
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

        <div className="flex gap-3">
          <button type="submit" className="dm-btn dm-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
          <button
            type="button"
            className="dm-btn dm-btn-ghost"
            disabled={!canInit || initializing}
            onClick={handleInit}
            title={canInit ? 'Send device initialization request to ZRA' : 'Fill in TPIN, device serial, and VSDC URL first'}
          >
            <Zap style={{ width: 14, height: 14 }} />
            <span>{initializing ? 'Initializing…' : 'Initialize Device'}</span>
          </button>
        </div>
      </form>

      {!!lastInitResult && (
        <details className="dm-card p-4">
          <summary style={{ fontSize: '0.75rem', color: 'var(--text-low)', cursor: 'pointer' }}>Last ZRA response</summary>
          <pre style={{ fontSize: '0.65rem', color: 'var(--text-low)', marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {JSON.stringify(lastInitResult, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
