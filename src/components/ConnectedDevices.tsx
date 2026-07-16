import { useState } from 'react';
import { WifiCustomer, WifiUsageLog } from '../types';
import { Search, Cpu, Wifi, RefreshCw } from 'lucide-react';

interface ConnectedDevicesProps {
  customers: WifiCustomer[];
  usageLogs: WifiUsageLog[];
  onRefresh: () => void;
  loading: boolean;
}

export default function ConnectedDevices({ customers, usageLogs, onRefresh, loading }: ConnectedDevicesProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.mac_address.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.device_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getLatestAction = (customerId: string) => {
    const customerLogs = usageLogs.filter(l => l.customer_id === customerId);
    if (customerLogs.length === 0) return { action: 'DISCONNECTED', time: null };
    return {
      action: customerLogs[0].action,
      time: customerLogs[0].created_at
    };
  };

  const getBrandIcon = (deviceName: string) => {
    const name = deviceName.toLowerCase();
    if (name.includes('iphone') || name.includes('ipad') || name.includes('macbook') || name.includes('apple')) {
      return '🍏';
    }
    if (name.includes('samsung') || name.includes('galaxy')) {
      return '🌌';
    }
    if (name.includes('tecno') || name.includes('infinix') || name.includes('itel')) {
      return '📱';
    }
    return '💻';
  };

  return (
    <div className="dm-card p-5 space-y-4 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="dm-h3 flex items-center">
            <Cpu style={{ width: 15, height: 15, marginRight: 6, color: 'var(--blue-400)' }} />
            <span>Hardware Device Registry &amp; MACs</span>
          </h2>
          <p style={{ color: 'var(--text-low)', fontSize: '0.6875rem', marginTop: 3 }}>Physical device configurations connected to the network switches.</p>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="dm-btn dm-btn-ghost self-start sm:self-auto"
          style={{ minHeight: 36, padding: '0 0.85rem', fontSize: '0.6875rem' }}
        >
          <RefreshCw className={loading ? 'dm-spin' : ''} style={{ width: 13, height: 13 }} />
          <span style={{ fontFamily: 'monospace' }}>Sync Router</span>
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ width: 15, height: 15, color: 'var(--text-low)' }} />
        <input
          type="text"
          placeholder="Filter by name, MAC address, device model..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="dm-input"
          style={{ paddingLeft: '2.25rem' }}
        />
      </div>

      <div style={{ maxHeight: 350, overflowY: 'auto', paddingRight: 4 }}>
        {loading ? (
          <div className="py-12 text-center" style={{ color: 'var(--text-low)' }}>
            <RefreshCw className="dm-spin" style={{ width: 24, height: 24, color: 'var(--blue-400)', margin: '0 auto 8px' }} />
            <span style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>Syncing switches...</span>
          </div>
        ) : filteredCustomers.length > 0 ? (
          filteredCustomers.map((cust, i) => {
            const latest = getLatestAction(cust.id);
            const status = latest.action;

            return (
              <div
                key={cust.id}
                className="py-3.5 flex justify-between items-center"
                style={{ fontSize: '0.75rem', borderTop: i === 0 ? 'none' : '1px solid var(--panel-line)' }}
              >
                <div className="flex items-center space-x-3 pr-2 truncate">
                  <div className="dm-card-inset flex items-center justify-center flex-shrink-0" style={{ width: 32, height: 32, borderRadius: '50%' }}>
                    <span style={{ fontSize: '0.875rem' }}>{getBrandIcon(cust.device_name)}</span>
                  </div>
                  <div className="truncate">
                    <strong className="dm-truncate" style={{ color: 'var(--text-hi)', display: 'block' }}>{cust.name}</strong>
                    <div className="flex items-center space-x-1.5" style={{ marginTop: 2 }}>
                      <span style={{ fontSize: '0.625rem', color: 'var(--text-low)' }}>{cust.device_name}</span>
                      <span style={{ color: 'var(--text-low)' }}>&bull;</span>
                      <code className="dm-card-inset" style={{ fontSize: '0.5625rem', fontFamily: 'monospace', color: 'var(--text-mid)', padding: '0.1rem 0.3rem', borderRadius: 4, textTransform: 'uppercase' }}>{cust.mac_address}</code>
                    </div>
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  {status === 'CONNECTED' ? (
                    <span className="dm-badge dm-badge-success">
                      <span className="dm-dot dm-dot-success dm-dot-pulse" />
                      CONNECTED
                    </span>
                  ) : status === 'EXPIRED' ? (
                    <span className="dm-badge dm-badge-warning">
                      EXPIRED
                    </span>
                  ) : (
                    <span className="dm-badge dm-badge-neutral">
                      DISCONNECTED
                    </span>
                  )}
                  {latest.time && (
                    <span style={{ fontSize: '0.5625rem', color: 'var(--text-low)', fontFamily: 'monospace', display: 'block', marginTop: 4 }}>
                      {new Date(latest.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-12 text-center" style={{ color: 'var(--text-low)' }}>
            <Cpu style={{ width: 32, height: 32, color: 'var(--text-low)', margin: '0 auto 8px' }} />
            <p style={{ fontSize: '0.75rem' }}>No registered devices found matching "{searchTerm}"</p>
          </div>
        )}
      </div>

      {/* Isolation notice for security */}
      <div className="dm-card-inset space-y-1.5" style={{ padding: '1rem', borderStyle: 'dashed' }}>
        <span style={{ fontWeight: 700, fontSize: '0.5625rem', color: 'var(--text-low)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center' }}>
          <Wifi style={{ width: 14, height: 14, marginRight: 4, color: 'var(--text-low)' }} /> MAC Isolator Enabled
        </span>
        <p style={{ fontSize: '0.625rem', color: 'var(--text-low)', lineHeight: 1.5 }}>
          Switches isolate active MAC leases. Terminated vouchers trigger firewall queues at the gateway layer automatically.
        </p>
      </div>
    </div>
  );
}
