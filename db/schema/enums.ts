import { pgEnum } from 'drizzle-orm/pg-core';

// Classification follows the ISM. The numeric rank in `CLASSIFICATION_RANK`
// is what we use for cumulative inclusion: a control is in scope for an
// engagement whenever `ism_controls.min_classification_rank <=
// engagements.classification_rank`.
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

// ---- Evidence -----------------------------------------------------------

export const evidenceRequestStatusEnum = pgEnum('evidence_request_status', [
  'open',
  'partially_satisfied',
  'satisfied',
  'cancelled',
]);

export const evidenceReviewStatusEnum = pgEnum('evidence_review_status', [
  'pending',
  'accepted',
  'insufficient',
  'rejected',
]);

// ---- Findings -----------------------------------------------------------

export const findingTypeEnum = pgEnum('finding_type', [
  'non_conformance',
  'observation',
]);

export const findingSeverityEnum = pgEnum('finding_severity', [
  'critical',
  'high',
  'medium',
  'low',
]);

export const findingStatusEnum = pgEnum('finding_status', [
  'open',
  'in_progress',
  'awaiting_retest',
  'closed',
  'accepted_risk',
]);

export const remediationActionStatusEnum = pgEnum('remediation_action_status', [
  'open',
  'in_progress',
  'ready_for_retest',
  'closed',
]);

// ---- Essential Eight ----------------------------------------------------

export const essentialEightStrategyEnum = pgEnum('essential_eight_strategy', [
  'application_control',
  'patch_applications',
  'configure_macro_settings',
  'user_application_hardening',
  'restrict_admin_privileges',
  'patch_operating_systems',
  'multi_factor_authentication',
  'regular_backups',
]);

export const maturityLevelEnum = pgEnum('maturity_level', ['ml0', 'ml1', 'ml2', 'ml3']);

// ---- Certification ------------------------------------------------------

export const certificationStatusEnum = pgEnum('certification_status', [
  'draft',
  'signed',
  'superseded',
  'revoked',
]);

// ---- CVE scans ----------------------------------------------------------

export const cveScanSourceEnum = pgEnum('cve_scan_source', [
  'manifest',
  'sbom',
  'github',
]);

export const cveScanStatusEnum = pgEnum('cve_scan_status', [
  'pending',
  'running',
  'completed',
  'failed',
]);

export const cveSeverityEnum = pgEnum('cve_severity', [
  'critical',
  'high',
  'medium',
  'low',
  'unknown',
]);

// ---- SSP ----------------------------------------------------------------

export const sspSectionKeyEnum = pgEnum('ssp_section_key', [
  'overview',
  'classification',
  'boundary',
  'controls',
  'implementation',
  'essential_eight',
  'residual_risks',
  'annexes',
]);

// ---- Interviews ---------------------------------------------------------

export const interviewStatusEnum = pgEnum('interview_status', [
  'scheduled',
  'completed',
  'cancelled',
]);
