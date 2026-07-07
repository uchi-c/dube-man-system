/**
 * src/services/organizations.ts
 * Organization and multi-tenancy management service
 */

import { supabase } from './supabase';
import {
  Organization,
  OrganizationSettings,
  CustomerFeedback,
  RoadmapItem,
  FeedbackPriority,
  FeedbackStatus,
  RoadmapPhase,
  RoadmapItemStatus,
} from '../types';

/**
 * Get current user's organizations
 */
export async function getUserOrganizations(): Promise<Organization[]> {
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
    .map((m: any) => m.organizations)
    .filter((org): org is Organization => org !== null);
}

/**
 * Get organization settings
 */
export async function getOrganizationSettings(
  organizationId: string
): Promise<OrganizationSettings | null> {
  const { data, error } = await supabase
    .from('organization_settings')
    .select('*')
    .eq('organization_id', organizationId)
    .single();

  if (error) {
    console.error('Failed to fetch organization settings:', error);
    return null;
  }

  return data;
}

/**
 * Update organization settings
 */
export async function updateOrganizationSettings(
  organizationId: string,
  updates: Partial<OrganizationSettings>
): Promise<boolean> {
  const { error } = await supabase
    .from('organization_settings')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', organizationId);

  if (error) {
    console.error('Failed to update organization settings:', error);
    return false;
  }

  return true;
}

/**
 * Get default cost per page (from organization settings)
 */
export async function getDefaultCostPerPage(
  organizationId: string,
  isColor: boolean = false
): Promise<number> {
  const settings = await getOrganizationSettings(organizationId);
  if (!settings) return isColor ? 0.015 : 0.005;

  return isColor
    ? settings.default_cost_per_page_color
    : settings.default_cost_per_page_bw;
}

/**
 * Get default revenue per page (from organization settings)
 */
export async function getDefaultRevenuePerPage(
  organizationId: string,
  isColor: boolean = false
): Promise<number> {
  const settings = await getOrganizationSettings(organizationId);
  if (!settings) return isColor ? 0.03 : 0.01;

  return isColor
    ? settings.default_revenue_per_page_color
    : settings.default_revenue_per_page_bw;
}

// ============================================================================
// CUSTOMER FEEDBACK
// ============================================================================

/**
 * Submit customer feedback
 */
export async function submitCustomerFeedback(
  organizationId: string,
  customerName: string,
  requestedFeature: string,
  problemDescription: string,
  businessType?: string,
  businessImpact?: string
): Promise<CustomerFeedback | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('customer_feedback')
    .insert({
      organization_id: organizationId,
      customer_name: customerName,
      business_type: businessType,
      requested_feature: requestedFeature,
      problem_description: problemDescription,
      business_impact: businessImpact,
      submitted_by: user?.id,
      priority: 'MEDIUM',
      status: 'NEW',
      roadmap_phase: 'COULD_HAVE',
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to submit feedback:', error);
    return null;
  }

  return data;
}

/**
 * Get all customer feedback for organization
 */
export async function getCustomerFeedback(
  organizationId: string
): Promise<CustomerFeedback[]> {
  const { data, error } = await supabase
    .from('customer_feedback')
    .select('*')
    .eq('organization_id', organizationId)
    .order('votes', { ascending: false })
    .order('submitted_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch customer feedback:', error);
    return [];
  }

  return data || [];
}

/**
 * Get feedback by status
 */
export async function getFeedbackByStatus(
  organizationId: string,
  status: FeedbackStatus
): Promise<CustomerFeedback[]> {
  const { data, error } = await supabase
    .from('customer_feedback')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('status', status)
    .order('votes', { ascending: false });

  if (error) {
    console.error('Failed to fetch feedback by status:', error);
    return [];
  }

  return data || [];
}

/**
 * Get feedback by roadmap phase
 */
export async function getFeedbackByPhase(
  organizationId: string,
  phase: RoadmapPhase
): Promise<CustomerFeedback[]> {
  const { data, error } = await supabase
    .from('customer_feedback')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('roadmap_phase', phase)
    .order('votes', { ascending: false });

  if (error) {
    console.error('Failed to fetch feedback by phase:', error);
    return [];
  }

  return data || [];
}

/**
 * Update feedback status and priority
 */
export async function updateFeedbackStatus(
  feedbackId: string,
  status: FeedbackStatus,
  priority?: FeedbackPriority,
  phase?: RoadmapPhase
): Promise<boolean> {
  const updates: any = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (priority) updates.priority = priority;
  if (phase) updates.roadmap_phase = phase;

  const { error } = await supabase
    .from('customer_feedback')
    .update(updates)
    .eq('id', feedbackId);

  if (error) {
    console.error('Failed to update feedback:', error);
    return false;
  }

  return true;
}

/**
 * Vote/upvote feedback
 */
export async function voteFeedback(feedbackId: string): Promise<boolean> {
  const { data: feedback, error: fetchError } = await supabase
    .from('customer_feedback')
    .select('votes')
    .eq('id', feedbackId)
    .single();

  if (fetchError || !feedback) return false;

  const { error: updateError } = await supabase
    .from('customer_feedback')
    .update({
      votes: feedback.votes + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', feedbackId);

  if (updateError) {
    console.error('Failed to vote feedback:', updateError);
    return false;
  }

  return true;
}

// ============================================================================
// ROADMAP
// ============================================================================

/**
 * Create roadmap item
 */
export async function createRoadmapItem(
  organizationId: string,
  featureName: string,
  description: string,
  phase: RoadmapPhase,
  businessImpact?: string,
  linkedFeedbackIds?: string[]
): Promise<RoadmapItem | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('roadmap_items')
    .insert({
      organization_id: organizationId,
      feature_name: featureName,
      description,
      phase,
      business_impact: businessImpact,
      linked_feedback_ids: linkedFeedbackIds || [],
      status: 'BACKLOG',
      created_by: user?.id,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create roadmap item:', error);
    return null;
  }

  return data;
}

/**
 * Get all roadmap items for organization
 */
export async function getRoadmapItems(
  organizationId: string
): Promise<RoadmapItem[]> {
  const { data, error } = await supabase
    .from('roadmap_items')
    .select('*')
    .eq('organization_id', organizationId)
    .order('phase', { ascending: false })
    .order('status', { ascending: false });

  if (error) {
    console.error('Failed to fetch roadmap items:', error);
    return [];
  }

  return data || [];
}

/**
 * Get roadmap items by phase
 */
export async function getRoadmapItemsByPhase(
  organizationId: string,
  phase: RoadmapPhase
): Promise<RoadmapItem[]> {
  const { data, error } = await supabase
    .from('roadmap_items')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('phase', phase)
    .order('status', { ascending: false });

  if (error) {
    console.error('Failed to fetch roadmap items by phase:', error);
    return [];
  }

  return data || [];
}

/**
 * Get roadmap items by status
 */
export async function getRoadmapItemsByStatus(
  organizationId: string,
  status: RoadmapItemStatus
): Promise<RoadmapItem[]> {
  const { data, error } = await supabase
    .from('roadmap_items')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('status', status)
    .order('phase', { ascending: false });

  if (error) {
    console.error('Failed to fetch roadmap items by status:', error);
    return [];
  }

  return data || [];
}

/**
 * Update roadmap item status
 */
export async function updateRoadmapItemStatus(
  roadmapItemId: string,
  status: RoadmapItemStatus,
  actualCompletionDate?: Date
): Promise<boolean> {
  const updates: any = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (actualCompletionDate && status === 'COMPLETED') {
    updates.actual_completion_date = actualCompletionDate.toISOString();
  }

  const { error } = await supabase
    .from('roadmap_items')
    .update(updates)
    .eq('id', roadmapItemId);

  if (error) {
    console.error('Failed to update roadmap item:', error);
    return false;
  }

  return true;
}

/**
 * Get roadmap summary (count by phase)
 */
export async function getRoadmapSummary(
  organizationId: string
): Promise<{
  mustHave: number;
  shouldHave: number;
  couldHave: number;
  future: number;
  inProgress: number;
  completed: number;
}> {
  const items = await getRoadmapItems(organizationId);

  return {
    mustHave: items.filter((i) => i.phase === 'MUST_HAVE').length,
    shouldHave: items.filter((i) => i.phase === 'SHOULD_HAVE').length,
    couldHave: items.filter((i) => i.phase === 'COULD_HAVE').length,
    future: items.filter((i) => i.phase === 'FUTURE').length,
    inProgress: items.filter((i) => i.status === 'IN_PROGRESS').length,
    completed: items.filter((i) => i.status === 'COMPLETED').length,
  };
}

/**
 * Link feedback to roadmap item
 */
export async function linkFeedbackToRoadmap(
  roadmapItemId: string,
  feedbackIds: string[]
): Promise<boolean> {
  const { data: roadmapItem, error: fetchError } = await supabase
    .from('roadmap_items')
    .select('linked_feedback_ids')
    .eq('id', roadmapItemId)
    .single();

  if (fetchError || !roadmapItem) return false;

  const existingIds = roadmapItem.linked_feedback_ids || [];
  const allIds = Array.from(new Set([...existingIds, ...feedbackIds]));

  const { error: updateError } = await supabase
    .from('roadmap_items')
    .update({
      linked_feedback_ids: allIds,
      customer_count: allIds.length,
      updated_at: new Date().toISOString(),
    })
    .eq('id', roadmapItemId);

  if (updateError) {
    console.error('Failed to link feedback:', updateError);
    return false;
  }

  return true;
}
