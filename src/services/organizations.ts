/**
 * src/services/organizations.ts
 * Multi-tenancy context: resolves which organization the signed-in user is
 * currently operating in, and exposes the org membership list for account
 * switching. Every INSERT the app makes into an organization-scoped table
 * (products, sales, pharmacy records, ...) stamps `organization_id` from
 * `getCurrentOrganizationId()` so it lands in the right tenant — Postgres
 * RLS (see database/migrations/001_multi_tenancy.sql) then enforces that a
 * user can never read or write another tenant's rows even if the client
 * were compromised.
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { Organization, BusinessType, OrganizationInvite, UserRole, TenantBilling, TenantPayment, SubscriptionStatus, PlatformFinancialSummary, PlatformPayment, BillingCycle, OrgBilling, OrgPayment } from '../types';

const ORG_STORAGE_KEY = 'uruu_org_id';
const PENDING_GOOGLE_SIGNUP_KEY = 'uruu_pending_google_signup';
const PENDING_INVITE_TOKEN_KEY = 'uruu_pending_invite_token';

// Local-demo mode (no Supabase configured) has no real multi-tenancy —
// everything runs against localStorage under one implicit workspace.
const LOCAL_DEMO_ORG_ID = 'local-demo-org';

let cachedOrgId: string | null = null;
let cachedBusinessType: BusinessType | null = null;

/**
 * The organization the current session should write to. Resolution order:
 * 1. In-memory cache (this tab, this page load)
 * 2. localStorage (survives refresh)
 * 3. The user's first organization membership (fetched from Supabase)
 */
/** The current org's display name — for headers, receipts, exports. Falls back to empty string on any failure so it never blocks rendering. */
export async function getCurrentOrganizationName(): Promise<string> {
  try {
    const orgId = await getCurrentOrganizationId();
    const { data } = await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle();
    return data?.name ?? '';
  } catch {
    return '';
  }
}

export async function getCurrentOrganizationId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;

  const stored = typeof window !== 'undefined' ? localStorage.getItem(ORG_STORAGE_KEY) : null;
  if (stored) {
    cachedOrgId = stored;
    return stored;
  }

  if (!isSupabaseConfigured) {
    cachedOrgId = LOCAL_DEMO_ORG_ID;
    return cachedOrgId;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated — cannot resolve an organization.');

  const { data, error } = await supabase
    .from('user_organization_memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    throw new Error('Your account is not a member of any organization yet. Ask an admin to add you.');
  }

  const orgId: string = data.org_id;
  setActiveOrganizationId(orgId);
  return orgId;
}

/** Switch the active tenant for this browser session (multi-org users). */
export function setActiveOrganizationId(orgId: string): void {
  cachedOrgId = orgId;
  if (typeof window !== 'undefined') localStorage.setItem(ORG_STORAGE_KEY, orgId);
}

/** Call on logout so the next sign-in re-resolves membership from scratch. */
export function clearOrganizationCache(): void {
  cachedOrgId = null;
  cachedBusinessType = null;
  if (typeof window !== 'undefined') localStorage.removeItem(ORG_STORAGE_KEY);
}

/**
 * The active organization's business type — drives which nav modules App.tsx
 * shows. Defaults to 'general' (shows everything) for local demo mode and on
 * any lookup failure, so a resolution hiccup never hides a module a real
 * tenant needs.
 */
export async function getCurrentOrganizationBusinessType(): Promise<BusinessType> {
  if (cachedBusinessType) return cachedBusinessType;
  if (!isSupabaseConfigured) return 'general';

  try {
    const orgId = await getCurrentOrganizationId();
    const { data, error } = await supabase
      .from('organizations')
      .select('business_type')
      .eq('id', orgId)
      .maybeSingle();
    if (error || !data) return 'general';
    cachedBusinessType = data.business_type as BusinessType;
    return cachedBusinessType;
  } catch {
    return 'general';
  }
}

/** Every organization the signed-in user belongs to (for an org switcher UI). */
export async function fetchUserOrganizations(): Promise<Organization[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('user_organization_memberships')
      .select('organizations(id, name, created_at)')
      .eq('user_id', user.id);

    if (error || !data) return [];

    return data
      .map((row: any) => row.organizations)
      .filter((org: any): org is Organization => !!org);
  } catch (err) {
    console.warn('Failed fetching organization memberships:', (err as any)?.message || err);
    return [];
  }
}

// ==========================================
// SELF-SERVICE SIGNUP
// ==========================================

/**
 * Calls the `signup_new_organization` SQL function (see
 * database/migrations/003_organization_signup.sql). Requires the caller to
 * already be authenticated (a session must exist) — it creates the
 * organization and makes the calling account its ADMIN in one transaction,
 * bypassing the normal "only an ADMIN can create an organization" RLS rule
 * because a brand-new signup is, by definition, not an ADMIN of anything
 * yet. Throws if the account already has a profile, or if the organization
 * name is already taken.
 */
export async function completeOrganizationSignup(
  orgName: string,
  ownerName?: string,
  businessType?: BusinessType,
  billingCycle?: BillingCycle
): Promise<{ organizationId: string; role: string }> {
  const { data, error } = await supabase.rpc('signup_new_organization', {
    org_name: orgName,
    owner_name: ownerName || null,
    business_type: businessType || 'general',
    billing_cycle: billingCycle || 'monthly',
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Organization signup did not return a result.');
  setActiveOrganizationId(row.organization_id);
  return { organizationId: row.organization_id, role: row.role };
}

/**
 * Full self-service signup: creates the Supabase Auth account, then
 * completes organization setup immediately if a session comes back right
 * away (email confirmation disabled/auto-confirmed). If the project
 * requires email confirmation, no session exists yet — org_name/owner_name
 * are stashed in the auth user's metadata and organization setup completes
 * automatically on their first successful login instead (see
 * fetchProfileForAuthUser in services/supabase.ts).
 */
export async function signUpNewOrganization(
  email: string,
  password: string,
  orgName: string,
  ownerName?: string,
  businessType?: BusinessType,
  billingCycle?: BillingCycle,
  captchaToken?: string
): Promise<{ needsEmailConfirmation: boolean; organizationId?: string }> {
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        org_name: orgName, owner_name: ownerName || null, business_type: businessType || 'general',
        billing_cycle: billingCycle || 'monthly',
      },
      captchaToken,
    },
  });
  if (authError) throw authError;
  if (!authData?.user) throw new Error('Sign-up did not return an account.');

  if (!authData.session) {
    // Email confirmation required — nothing more to do until they confirm
    // and log in; organization setup completes then via the stashed
    // metadata above.
    return { needsEmailConfirmation: true };
  }

  const { organizationId } = await completeOrganizationSignup(orgName, ownerName, businessType, billingCycle);
  return { needsEmailConfirmation: false, organizationId };
}

// ==========================================
// TEAM INVITES
// ==========================================

/**
 * Admin-only: invite a teammate into the caller's own organization with a
 * chosen role. Returns the shareable token — the caller builds the actual
 * link (e.g. `${origin}/#/signup?invite=${token}`).
 */
export async function createInvite(
  email: string,
  role: UserRole
): Promise<{ token: string; email: string; role: UserRole; expiresAt: string }> {
  const { data, error } = await supabase.rpc('create_organization_invite', {
    p_email: email,
    p_role: role,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Invite creation did not return a result.');
  return { token: row.token, email: row.email, role: row.role, expiresAt: row.expires_at };
}

/**
 * Admin-only: creates the teammate's account immediately with a one-time
 * temporary password (instead of a link they'd have to open and complete
 * signup on themselves) and adds them to the caller's organization with the
 * chosen role. They log in with the email + temporary password shown here,
 * then the app forces them to set their own password on that first login
 * (see must_change_password / ResetPassword's "forced" mode).
 *
 * Runs server-side in the admin-invite-user Edge Function because creating
 * an auth account with a password requires Supabase Auth's admin API
 * (service role) — not something a plain RPC can do. The function itself
 * still enforces "caller must be an ADMIN inviting into their own org" by
 * calling create_organization_invite under the caller's own JWT first.
 */
/**
 * On a non-2xx response, supabase-js's `error` carries the generic message
 * "Edge Function returned a non-2xx status code" — the actual reason (e.g.
 * "Only an organization admin can invite teammates") is in the raw
 * Response body under `error.context`, which still has to be read.
 */
async function resolveEdgeFunctionError(error: unknown, fallback: string): Promise<string> {
  let detail: string | undefined;
  try {
    const ctx = (error as any)?.context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json();
      detail = body?.error;
    }
  } catch {
    // Body wasn't JSON (or was already consumed) — fall through to the
    // generic message below.
  }
  return detail || (error as any)?.message || fallback;
}

export async function adminInviteUserWithTempPassword(
  email: string,
  role: UserRole,
  name?: string
): Promise<{ email: string; role: UserRole; tempPassword: string; orgName?: string }> {
  const { data, error } = await supabase.functions.invoke('admin-invite-user', {
    body: { email, role, name },
  });
  if (error) throw new Error(await resolveEdgeFunctionError(error, "Couldn't create that teammate's account."));
  if (data?.error) throw new Error(data.error);
  if (!data?.tempPassword) throw new Error('Account creation did not return a temporary password.');
  return { email: data.email, role: data.role, tempPassword: data.tempPassword, orgName: data.orgName };
}

/**
 * Self-service only: clears the caller's own must_change_password flag.
 * Called right after a forced password change succeeds — see
 * ResetPassword's "forced" mode.
 */
export async function clearMustChangePassword(): Promise<void> {
  const { error } = await supabase.rpc('clear_must_change_password');
  if (error) throw error;
}

// ==========================================
// PC AGENT REMOTE PROVISIONING
// ==========================================

/**
 * Admin-only: generates a short, single-use code (valid 48h) that lets
 * whoever is physically at a new PC install the agent themselves via
 * pc-agent/remote-install.ps1, without the admin needing to be there or
 * relay Supabase credentials by hand.
 */
export async function createPcProvisioningCode(
  computerCode?: string
): Promise<{ code: string; computerCode: string; expiresAt: string }> {
  const { data, error } = await supabase.rpc('create_pc_provisioning_code', {
    p_computer_code: computerCode || null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Provisioning code creation did not return a result.');
  return { code: row.code, computerCode: row.computer_code, expiresAt: row.expires_at };
}

/**
 * Admin-only: the caller's own organization's agent_secret -- the value
 * every pc-agent install needs as AGENT_SECRET / -AgentSecret. Only needed
 * for a manual install; remote-install.ps1 fetches it automatically via a
 * provisioning code and never needs this called directly.
 */
export async function getMyOrgAgentSecret(): Promise<string> {
  const { data, error } = await supabase.rpc('get_my_org_agent_secret');
  if (error) throw error;
  if (!data) throw new Error('No agent secret was returned.');
  return data as string;
}

/** Every invite (pending, accepted, or revoked) for the caller's organization. */
export async function fetchInvites(): Promise<OrganizationInvite[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from('organization_invites')
      .select('id, email, role, token, created_at, expires_at, accepted_at, revoked_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  } catch (err) {
    console.warn('Failed fetching organization invites:', (err as any)?.message || err);
    return [];
  }
}

/** Admin action: revoke a still-pending invite so its link stops working. */
export async function revokeInvite(inviteId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('organization_invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', inviteId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('Failed revoking invite:', (err as any)?.message || err);
    return false;
  }
}

/** Anon-safe preview of a still-valid invite token — org name + assigned role. */
export async function getInviteInfo(
  token: string
): Promise<{ orgName: string; role: UserRole; email: string } | null> {
  if (!isSupabaseConfigured || !token) return null;
  try {
    const { data, error } = await supabase.rpc('get_invite_info', { p_token: token });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return { orgName: row.org_name, role: row.role, email: row.email };
  } catch (err) {
    console.warn('Failed resolving invite token:', (err as any)?.message || err);
    return null;
  }
}

/**
 * Completes invite acceptance once a session exists (mirrors
 * completeOrganizationSignup's role in the plain-signup flow — see
 * fetchProfileForAuthUser in services/supabase.ts for the deferred-email-
 * confirmation and deferred-Google-redirect callers).
 */
export async function acceptInvite(
  token: string,
  name?: string
): Promise<{ organizationId: string; role: UserRole }> {
  const { data, error } = await supabase.rpc('accept_organization_invite', {
    p_token: token,
    p_name: name || null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Invite acceptance did not return a result.');
  setActiveOrganizationId(row.organization_id);
  return { organizationId: row.organization_id, role: row.role };
}

// ==========================================
// GOOGLE OAUTH SIGNUP HAND-OFF
// ==========================================
// signInWithOAuth (unlike signUp) can't attach custom user_metadata at
// account-creation time — the profile is created by the provider redirect,
// not by a call we control. So the intent the user expressed BEFORE
// leaving for Google (create a new org vs. accept an invite) is stashed in
// localStorage and consumed once on the first successful return, from
// fetchProfileForAuthUser in services/supabase.ts.
//
// Both stashes carry a timestamp and expire after PENDING_STASH_MAX_AGE_MS.
// Without that, abandoning the flow (closing the tab, cancelling at
// Google, the popup failing) leaves the entry sitting in localStorage
// forever — and it would then get silently consumed by the NEXT unrelated
// Google sign-in on that browser (e.g. someone else, or the same person
// legitimately just signing into an existing account later), creating an
// org or accepting an invite nobody asked for at that moment. An OAuth
// round trip normally completes in well under a minute, so a generous
// window still catches the real case without that risk.
const PENDING_STASH_MAX_AGE_MS = 10 * 60 * 1000;

export function stashPendingGoogleSignup(details: {
  orgName: string;
  ownerName?: string;
  businessType?: BusinessType;
  billingCycle?: BillingCycle;
}): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PENDING_GOOGLE_SIGNUP_KEY, JSON.stringify({ ...details, ts: Date.now() }));
}

export function takePendingGoogleSignup(): {
  orgName: string;
  ownerName?: string;
  businessType?: BusinessType;
  billingCycle?: BillingCycle;
} | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(PENDING_GOOGLE_SIGNUP_KEY);
  if (!raw) return null;
  localStorage.removeItem(PENDING_GOOGLE_SIGNUP_KEY);
  try {
    const { ts, ...details } = JSON.parse(raw);
    if (typeof ts !== 'number' || Date.now() - ts > PENDING_STASH_MAX_AGE_MS) return null;
    return details;
  } catch {
    return null;
  }
}

export function stashPendingInviteToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PENDING_INVITE_TOKEN_KEY, JSON.stringify({ token, ts: Date.now() }));
}

export function takePendingInviteToken(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(PENDING_INVITE_TOKEN_KEY);
  if (!raw) return null;
  localStorage.removeItem(PENDING_INVITE_TOKEN_KEY);
  try {
    const { token, ts } = JSON.parse(raw);
    if (typeof ts !== 'number' || Date.now() - ts > PENDING_STASH_MAX_AGE_MS) return null;
    return token || null;
  } catch {
    return null;
  }
}

/**
 * Full self-service invite acceptance: creates the Supabase Auth account,
 * then joins the invite's organization immediately if a session comes back
 * right away. If the project requires email confirmation, the invite token
 * is stashed in the auth user's metadata and acceptance completes
 * automatically on first login instead (see fetchProfileForAuthUser in
 * services/supabase.ts) — mirrors signUpNewOrganization's shape exactly.
 */
export async function acceptInviteSignup(
  email: string,
  password: string,
  token: string,
  name?: string,
  captchaToken?: string
): Promise<{ needsEmailConfirmation: boolean; organizationId?: string }> {
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { invite_token: token, owner_name: name || null },
      captchaToken,
    },
  });
  if (authError) throw authError;
  if (!authData?.user) throw new Error('Sign-up did not return an account.');

  if (!authData.session) {
    return { needsEmailConfirmation: true };
  }

  const { organizationId } = await acceptInvite(token, name);
  return { needsEmailConfirmation: false, organizationId };
}

/** Admin action: create a new tenant and add the current user as a member. */
export async function createOrganization(name: string): Promise<Organization | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert([{ name }])
      .select()
      .single();
    if (orgError) throw orgError;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('user_organization_memberships')
        .insert([{ user_id: user.id, org_id: org.id }]);
    }

    return org;
  } catch (err) {
    console.warn('Failed creating organization:', (err as any)?.message || err);
    return null;
  }
}

// ==========================================
// PLATFORM ADMIN — TENANTS & BILLING
// ==========================================
// Everything below is gated server-side by is_platform_admin() (see
// database/migrations/014_platform_tenants_billing.sql) — a cross-tenant
// capability distinct from a regular org ADMIN, held by almost no one.
// Billing is manual: no payment processor, just a status + a payment log
// the platform admin updates by hand.

/** Every tenant's billing summary, platform-admin only. */
export async function listTenantsBilling(): Promise<TenantBilling[]> {
  const { data, error } = await supabase.rpc('list_tenants_billing');
  if (error) throw error;
  return (data ?? []) as TenantBilling[];
}

/**
 * Creates a brand-new tenant plus its owner's account in one call (via the
 * admin-create-tenant Edge Function — creating a password-based auth
 * account needs Supabase Auth's admin API, not something a plain RPC can
 * do). The owner logs in with the email + temporary password returned
 * here and is forced to set their own password on first login, same as
 * adminInviteUserWithTempPassword. The server (create_tenant_org)
 * automatically starts a 7-day trial — next_payment_due is set 7 days out,
 * no client input needed for that.
 */
export async function createTenant(params: {
  orgName: string;
  businessType: BusinessType;
  monthlyPrice: number | null;
  currency: string;
  paymentMethod?: string;
  billingCycle?: BillingCycle;
  ownerEmail: string;
  ownerName?: string;
}): Promise<{ organizationId: string; orgName: string; email: string; tempPassword: string }> {
  const { data, error } = await supabase.functions.invoke('admin-create-tenant', { body: params });
  if (error) throw new Error(await resolveEdgeFunctionError(error, "Couldn't create that tenant."));
  if (data?.error) throw new Error(data.error);
  if (!data?.tempPassword) throw new Error('Tenant creation did not return a temporary password.');
  return {
    organizationId: data.organizationId,
    orgName: data.orgName,
    email: data.email,
    tempPassword: data.tempPassword,
  };
}

/** Edits a tenant's price/currency/status/next-due-date/notes/balance/payment method. Pass only the fields changing. */
export async function updateTenantBilling(
  organizationId: string,
  patch: {
    monthlyPrice?: number;
    currency?: string;
    subscriptionStatus?: SubscriptionStatus;
    nextPaymentDue?: string | null;
    billingNotes?: string;
    balanceDue?: number;
    paymentMethod?: string;
    billingCycle?: BillingCycle;
  }
): Promise<void> {
  const { error } = await supabase.rpc('update_tenant_billing', {
    p_org_id: organizationId,
    p_monthly_price: patch.monthlyPrice ?? null,
    p_currency: patch.currency ?? null,
    p_subscription_status: patch.subscriptionStatus ?? null,
    p_next_payment_due: patch.nextPaymentDue === null ? null : patch.nextPaymentDue ?? null,
    p_billing_notes: patch.billingNotes ?? null,
    p_clear_next_payment_due: patch.nextPaymentDue === null,
    p_balance_due: patch.balanceDue ?? null,
    p_payment_method: patch.paymentMethod ?? null,
    p_billing_cycle: patch.billingCycle ?? null,
  });
  if (error) throw error;
}

/**
 * Soft-deletes a tenant (platform admin only): locks it out immediately
 * (subscription_status -> 'cancelled') and hides it from listTenantsBilling.
 * Does not touch the tenant's underlying data (products, sales, etc.) — see
 * database/migrations/021_delete_tenant.sql for why this isn't a hard delete.
 */
export async function deleteTenant(organizationId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_tenant_org', { p_org_id: organizationId });
  if (error) throw error;
}

/** The caller's own org's plan/billing snapshot — any org member can call this, not just a platform admin. */
export async function fetchMyOrganizationBilling(organizationId?: string): Promise<OrgBilling | null> {
  const { data, error } = await supabase.rpc('get_my_organization_billing', { p_org_id: organizationId ?? null });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as OrgBilling) ?? null;
}

/** The caller's own org's payment history — any org member can call this, not just a platform admin. */
export async function fetchMyOrganizationPayments(organizationId?: string, limit = 50): Promise<OrgPayment[]> {
  const { data, error } = await supabase.rpc('get_my_organization_payments', { p_org_id: organizationId ?? null, p_limit: limit });
  if (error) throw error;
  return (data ?? []) as OrgPayment[];
}

/**
 * True if the caller belongs to organizationId and it's currently
 * suspended/cancelled. Fails open (returns false) on error — this is only
 * a client-side UX gate; the real enforcement is server-side (a locked
 * org's RLS-visible rows are already empty regardless of this check).
 */
export async function isOrgLocked(organizationId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_org_locked', { p_org_id: organizationId });
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}

/** Logs a payment, rolls the tenant's due date forward a month, and draws down balance_due by the amount paid. */
export async function recordTenantPayment(organizationId: string, amount: number, note?: string): Promise<void> {
  const { error } = await supabase.rpc('record_tenant_payment', {
    p_org_id: organizationId,
    p_amount: amount,
    p_note: note || null,
  });
  if (error) throw error;
}

/** A tenant's payment history, most recent first. */
export async function listTenantPayments(organizationId: string): Promise<TenantPayment[]> {
  const { data, error } = await supabase.rpc('list_tenant_payments', { p_org_id: organizationId });
  if (error) throw error;
  return (data ?? []) as TenantPayment[];
}

/** How tenants should pay you (e.g. mobile money lines) — platform-admin only, shown on the Tenants page. */
export async function getPlatformPaymentInstructions(): Promise<string> {
  const { data, error } = await supabase.rpc('get_platform_payment_instructions');
  if (error) throw error;
  return (data as string) || '';
}

export async function updatePlatformPaymentInstructions(text: string): Promise<void> {
  const { error } = await supabase.rpc('update_platform_payment_instructions', { p_text: text });
  if (error) throw error;
}

/** The platform owner's cross-tenant revenue, one row per billing currency — MRR, outstanding, and collected totals. */
export async function fetchPlatformFinancialSummary(): Promise<PlatformFinancialSummary[]> {
  const { data, error } = await supabase.rpc('get_platform_financial_summary');
  if (error) throw error;
  return (data ?? []) as PlatformFinancialSummary[];
}

/** Most recent payments across every tenant, most recent first — for a platform-wide revenue feed. */
export async function fetchAllTenantPayments(limit = 50): Promise<PlatformPayment[]> {
  const { data, error } = await supabase.rpc('list_all_tenant_payments', { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as PlatformPayment[];
}

// ---------------------------------------------------------------------------
// Platform admin management (migration 026) — who has cross-tenant access,
// and granting/revoking/inviting it. Platform-admin-only, enforced server
// side by every RPC/edge function below, not just by hiding the nav tab.
// ---------------------------------------------------------------------------

export interface PlatformAdmin {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

export async function fetchPlatformAdmins(): Promise<PlatformAdmin[]> {
  const { data, error } = await supabase.rpc('list_platform_admins');
  if (error) throw error;
  return (data ?? []) as PlatformAdmin[];
}

export async function findUserByEmail(email: string): Promise<{ id: string; name: string; email: string; is_platform_admin: boolean } | null> {
  const { data, error } = await supabase.rpc('find_user_by_email', { p_email: email });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

export async function setPlatformAdmin(userId: string, isAdmin: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_platform_admin', { p_user_id: userId, p_is_admin: isAdmin });
  if (error) throw error;
}

/** For someone with no existing Uruu OS account at all — creates their login and grants platform admin in one step. */
export async function inviteNewPlatformAdmin(email: string, name?: string): Promise<{ email: string; tempPassword: string }> {
  const { data, error } = await supabase.functions.invoke('admin-invite-platform-admin', { body: { email, name } });
  if (error) throw new Error(await resolveEdgeFunctionError(error, "Couldn't create that account."));
  if (data?.error) throw new Error(data.error);
  if (!data?.tempPassword) throw new Error('Account creation did not return a temporary password.');
  return { email: data.email, tempPassword: data.tempPassword };
}
