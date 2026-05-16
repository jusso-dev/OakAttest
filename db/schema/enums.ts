import { pgEnum } from 'drizzle-orm/pg-core';

// Classification follows the ISM. The numeric rank in `classificationRank()` is
// what we use for cumulative inclusion: a control is in scope for an engagement
// whenever `ism_controls.min_classification_rank <= engagements.classification_rank`.
export const classificationEnum = pgEnum('classification', [
  'OFFICIAL',
  'OFFICIAL_SENSITIVE',
  'PROTECTED',
  'SECRET',
  'TOP_SECRET',
]);

export type Classification = (typeof classificationEnum.enumValues)[number];

export const CLASSIFICATION_RANK: Record<Classification, number> = {
  OFFICIAL: 1,
  OFFICIAL_SENSITIVE: 2,
  PROTECTED: 3,
  SECRET: 4,
  TOP_SECRET: 5,
};

// Tenant-scope roles (assessor firm).
export const tenantRoleEnum = pgEnum('tenant_role', [
  'tenant_owner',
  'assessor_admin',
]);

// Engagement-scope roles. Mixed assessor- and client-side because both
// participate in the same engagement; permission checks branch on role.
export const engagementRoleEnum = pgEnum('engagement_role', [
  'lead_assessor',
  'assessor',
  'client_admin',
  'client_contributor',
  'read_only_observer',
]);

export const engagementPhaseEnum = pgEnum('engagement_phase', [
  'scoping',
  'evidence',
  'fieldwork',
  'findings',
  'certification',
  'maintenance',
]);

export const engagementStatusEnum = pgEnum('engagement_status', [
  'draft',
  'active',
  'on_hold',
  'completed',
  'archived',
]);

export const engagementControlStatusEnum = pgEnum('engagement_control_status', [
  'not_started',
  'in_progress',
  'evidence_pending',
  'implemented',
  'not_applicable',
  'compensating',
  'not_implemented',
]);

export const auditActorTypeEnum = pgEnum('audit_actor_type', [
  'user',
  'system',
  'integration',
]);
