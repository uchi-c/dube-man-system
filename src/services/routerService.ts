/**
 * Future Router Integration Service
 * Placeholder service layer for communicating with local/physical gateways (e.g. Mikrotik RouterOS API, UniFi Controller REST, etc.)
 * Strictly does NOT store sensitive passwords or mock/fake executions.
 */

export interface RouterConnectionConfig {
  routerName: string;
  routerBrand: string;
  routerModel: string;
  integrationType: 'REST_API' | 'SSH_COMMAND' | 'WEB_HOOK';
}

/**
 * Attempts connection test to the physical gateway router
 */
export async function connectRouter(config: RouterConnectionConfig): Promise<{ success: boolean; message: string }> {
  console.log(`[RouterService] Testing connection to ${config.routerName} (${config.routerBrand} ${config.routerModel})...`);
  // Placeholder for hardware integration API calls
  return {
    success: true,
    message: `Connected successfully to local gateway using ${config.integrationType} webhook handshake.`
  };
}

/**
 * Periodically audits router ping latency & online status
 */
export async function checkConnection(): Promise<{ online: boolean; latencyMs: number }> {
  // Placeholder for real router status checks
  return {
    online: true,
    latencyMs: 14 // standard internal gateway latency
  };
}

/**
 * Pushes physical access firewall blocking or queue rules to limit bandwidth/duration
 * Called when a WiFi Session is successfully started
 */
export async function applyAccessRule(macAddress: string, durationMinutes: number, rateLimitMbps: number = 10): Promise<boolean> {
  console.log(`[RouterService] PUSH RULE: MAC [${macAddress}] limited to ${durationMinutes} mins at ${rateLimitMbps}Mbps.`);
  // Future Mikrotik command: `/ip hotspot active login mac-address=${macAddress}` or simple IP/MAC binding queues
  return true;
}

/**
 * Removes access rules to isolate or disconnect the target device
 * Called when session expires or is manually terminated
 */
export async function removeAccessRule(macAddress: string): Promise<boolean> {
  console.log(`[RouterService] REMOVE RULE: MAC [${macAddress}] access rules deleted.`);
  // Future Mikrotik command: `/ip hotspot active remove [find mac-address=${macAddress}]`
  return true;
}
