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
import { Organization, BusinessType, OrganizationInvite, UserRole } from '../types';

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
  businessType?: BusinessType
): Promise<{ organizationId: string; role: string }> {
  const { data, error } = await supabase.rpc('signup_new_organization', {
    org_name: orgName,
    owner_name: ownerName || null,
    business_type: businessType || 'general',
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
  businessType?: BusinessType
): Promise<{ needsEmailConfirmation: boolean; organizationId?: string }> {
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { org_name: orgName, owner_name: ownerName || null, business_type: businessType || 'general' },
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

  const { organizationId } = await completeOrganizationSignup(orgName, ownerName, businessType);
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
}): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PENDING_GOOGLE_SIGNUP_KEY, JSON.stringify({ ...details, ts: Date.now() }));
}

export function takePendingGoogleSignup(): {
  orgName: string;
  ownerName?: string;
  businessType?: BusinessType;
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
  name?: string
): Promise<{ needsEmailConfirmation: boolean; organizationId?: string }> {
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { invite_token: token, owner_name: name || null },
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
