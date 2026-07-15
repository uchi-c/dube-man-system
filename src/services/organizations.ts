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
import { Organization } from '../types';

const ORG_STORAGE_KEY = 'dubeman_org_id';

// Local-demo mode (no Supabase configured) has no real multi-tenancy —
// everything runs against localStorage under one implicit workspace.
const LOCAL_DEMO_ORG_ID = 'local-demo-org';

let cachedOrgId: string | null = null;

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
  if (typeof window !== 'undefined') localStorage.removeItem(ORG_STORAGE_KEY);
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
