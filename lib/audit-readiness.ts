export const AUDIT_TYPES = [
  'iso_27001_stage_1',
  'soc_2_type_1',
  'soc_2_type_2',
] as const;

export type AuditType = (typeof AUDIT_TYPES)[number];

export const AUDIT_TYPE_LABELS: Record<AuditType, string> = {
  iso_27001_stage_1: 'ISO/IEC 27001 Stage 1',
  soc_2_type_1: 'SOC 2 Type I',
  soc_2_type_2: 'SOC 2 Type II',
};

export const AUDIT_REQUIREMENT_STATUSES = [
  'not_started',
  'in_progress',
  'blocked',
  'ready',
  'not_applicable',
] as const;

export type AuditRequirementStatus = (typeof AUDIT_REQUIREMENT_STATUSES)[number];

export const AUDIT_PROFILE_STATUSES = [
  'planning',
  'in_progress',
  'ready',
  'in_audit',
  'complete',
] as const;

export const TRUST_SERVICE_CATEGORIES = [
  'security',
  'availability',
  'processing_integrity',
  'confidentiality',
  'privacy',
] as const;

export type TrustServiceCategory = (typeof TRUST_SERVICE_CATEGORIES)[number];

export type AuditRequirementTemplate = {
  key: string;
  category: string;
  title: string;
  guidance: string;
};

const ISO_STAGE_1_REQUIREMENTS: AuditRequirementTemplate[] = [
  item('programme', 'Audit planning', 'Audit programme and contacts', 'Confirm certification body, Stage 1 dates, locations, attendees, communication route, and requested pre-audit material.'),
  item('context', 'ISMS foundation', 'Organisation context and interested parties', 'Document internal and external issues, relevant interested parties, and information-security requirements that shape the ISMS.'),
  item('scope', 'ISMS foundation', 'Approved ISMS scope', 'Approve a precise scope covering organisational units, locations, processes, technology, interfaces, dependencies, and exclusions.'),
  item('leadership', 'Governance', 'Leadership, policy, roles, and authorities', 'Provide approved information-security policy, leadership commitments, governance forums, and named ISMS responsibilities.'),
  item('risk-method', 'Risk management', 'Risk assessment methodology', 'Document risk criteria, likelihood and impact scales, risk acceptance rules, ownership, and a repeatable assessment process.'),
  item('risk-treatment', 'Risk management', 'Risk register, treatment plan, and Statement of Applicability', 'Reconcile assessed risks, treatment decisions, control selection or exclusion rationale, owners, dates, and residual-risk acceptance.'),
  item('objectives', 'Governance', 'Security objectives and delivery measures', 'Define measurable objectives with owners, delivery plans, resources, target dates, and evaluation methods.'),
  item('support', 'ISMS operation', 'Competence, awareness, communication, and resources', 'Show competence needs, training or awareness activity, internal and external communication arrangements, and ISMS resources.'),
  item('document-control', 'ISMS operation', 'Documented-information control', 'Demonstrate approval, versioning, access, retention, distribution, change control, and disposal for ISMS records.'),
  item('operations', 'ISMS operation', 'Operational control evidence', 'Provide representative records showing selected controls and planned processes operate within the stated scope.'),
  item('measurement', 'Performance evaluation', 'Monitoring and measurement plan', 'Define what is measured, methods, cadence, owners, evaluation criteria, and retained results.'),
  item('internal-audit', 'Performance evaluation', 'Completed internal audit', 'Provide the audit programme, independence evidence, scope, results, findings, and follow-up covering the ISMS.'),
  item('management-review', 'Performance evaluation', 'Completed management review', 'Provide dated inputs, decisions, actions, owners, and retained outputs from management review.'),
  item('improvement', 'Improvement', 'Nonconformity and corrective-action register', 'Show issues, causes, containment, corrective actions, owners, due dates, effectiveness checks, and closure evidence.'),
];

const SOC_2_BASE_REQUIREMENTS: AuditRequirementTemplate[] = [
  item('programme', 'Audit planning', 'Audit firm, report type, and contacts', 'Confirm practitioner, report type, target date, communication route, request list, and responsible management contacts.'),
  item('system-description', 'Scope', 'Draft system description', 'Describe services, commitments, system requirements, infrastructure, software, people, procedures, and data for the report boundary.'),
  item('boundary', 'Scope', 'System boundary and components', 'Reconcile included products, entities, locations, environments, data flows, dependencies, and material exclusions.'),
  item('categories', 'Scope', 'Trust Services Categories confirmed', 'Confirm Security plus any additional categories with management and practitioner; record why each category is in scope.'),
  item('risk-assessment', 'Governance', 'Current risk assessment', 'Map relevant risks to service commitments, system requirements, scoped criteria, controls, and accepted residual risk.'),
  item('control-matrix', 'Controls', 'Criteria-to-control matrix', 'Map tenant-supplied Trust Services Criteria to controls, owners, frequency, evidence, populations, and testing approach.'),
  item('owners', 'Controls', 'Control-owner sign-off', 'Confirm each control owner understands control wording, frequency, evidence expectations, and exception escalation.'),
  item('subservice', 'Scope', 'Subservice organisations', 'List material subservice organisations and document inclusive or carve-out treatment plus oversight controls.'),
  item('cuecs', 'Scope', 'Complementary user entity controls', 'Identify controls customers must operate for service commitments to be achieved and align them with the system description.'),
  item('policies', 'Controls', 'Approved policies and procedures', 'Confirm current approvals, owners, review dates, distribution, and alignment between written procedure and actual control operation.'),
  item('evidence-plan', 'Evidence', 'Evidence and sampling plan', 'Define authoritative evidence, source systems, populations, periods, sample owners, retention, and secure delivery method.'),
  item('population', 'Evidence', 'Population completeness checks', 'Show how report populations and exports are complete, accurate, reproducible, and tied to the audit period or as-of date.'),
  item('access-change', 'Evidence', 'Access and change-management records', 'Prepare access provisioning, termination, privileged review, change approval, testing, deployment, and emergency-change records.'),
  item('operations', 'Evidence', 'Security operations and resilience records', 'Prepare incident, vulnerability, logging, backup, recovery, availability, and continuity records applicable to selected categories.'),
  item('vendors', 'Evidence', 'Vendor oversight records', 'Provide due diligence, contracts, monitoring, review, issue follow-up, and offboarding records for material vendors.'),
  item('exceptions', 'Remediation', 'Exception and remediation register', 'Centralise control exceptions, root causes, affected periods, compensating controls, owners, due dates, and closure proof.'),
  item('management', 'Auditor delivery', 'Management assertion and representation inputs', 'Prepare responsible-party sign-off, known-event disclosures, scope confirmations, and practitioner-requested representations.'),
];

const SOC_2_TYPE_2_ONLY: AuditRequirementTemplate[] = [
  item('observation-period', 'Audit period', 'Observation-period coverage', 'Confirm every scoped control operated for the full period or document start dates, gaps, changes, and compensating evidence.'),
  item('period-changes', 'Audit period', 'Material changes during the period', 'Record acquisitions, migrations, incidents, control redesigns, vendor changes, and other events affecting period coverage.'),
];

export function requirementsForAuditType(type: AuditType): AuditRequirementTemplate[] {
  if (type === 'iso_27001_stage_1') return ISO_STAGE_1_REQUIREMENTS;
  if (type === 'soc_2_type_2') return [...SOC_2_BASE_REQUIREMENTS, ...SOC_2_TYPE_2_ONLY];
  return SOC_2_BASE_REQUIREMENTS;
}

export function auditTypesForFramework(frameworkKey: string): AuditType[] {
  if (frameworkKey === 'iso-27001') return ['iso_27001_stage_1'];
  if (frameworkKey === 'soc2') return ['soc_2_type_1', 'soc_2_type_2'];
  return [];
}

export type ReadinessGate = {
  key: string;
  label: string;
  detail: string;
  ready: boolean;
  href?: string;
};

export function buildAuditReadinessGates(input: {
  engagementId: string;
  auditType: AuditType;
  scopeStatement: string;
  targetAuditAt: Date | string | null;
  periodStart: Date | string | null;
  periodEnd: Date | string | null;
  requirementStatuses: AuditRequirementStatus[];
  controlCount: number;
  acceptedEvidenceCount: number;
  coverageBlockerKeys: string[];
}): ReadinessGate[] {
  const href = (path: string) => `/engagements/${input.engagementId}/${path}`;
  const completedRequirements = input.requirementStatuses.filter(isRequirementComplete).length;
  const periodStart = toTimestamp(input.periodStart);
  const periodEnd = toTimestamp(input.periodEnd);
  const typeTwoPeriodReady =
    input.auditType !== 'soc_2_type_2' ||
    (periodStart !== null && periodEnd !== null && periodEnd > periodStart);
  const scopeBlockers = new Set(['boundary-unlocked', 'undecided-controls', 'missing-statements']);
  const evidenceBlockers = new Set([
    'missing-control-evidence',
    'pending-evidence',
    'rejected-evidence',
    'unverified-evidence',
  ]);

  return [
    {
      key: 'profile',
      label: 'Audit scope and target date',
      detail: 'Scope is explicit and audit target is scheduled.',
      ready: input.scopeStatement.trim().length >= 20 && toTimestamp(input.targetAuditAt) !== null,
    },
    {
      key: 'period',
      label: 'Observation period',
      detail: input.auditType === 'soc_2_type_2'
        ? 'Type II period has a valid start and end date.'
        : 'No operating-period gate applies to this audit type.',
      ready: typeTwoPeriodReady,
    },
    {
      key: 'controls',
      label: 'Control population and scope decisions',
      detail: `${input.controlCount} controls loaded; boundary, applicability, and implementation statements must be complete.`,
      ready:
        input.controlCount > 0 &&
        !input.coverageBlockerKeys.some((key) => scopeBlockers.has(key)),
      href: href('scope'),
    },
    {
      key: 'evidence',
      label: 'Verified audit evidence',
      detail: `${input.acceptedEvidenceCount} accepted evidence item(s); no missing, pending, rejected, or unverified evidence.`,
      ready:
        input.acceptedEvidenceCount > 0 &&
        !input.coverageBlockerKeys.some((key) => evidenceBlockers.has(key)),
      href: href('evidence'),
    },
    {
      key: 'checklist',
      label: 'Audit preparation checklist',
      detail: `${completedRequirements} of ${input.requirementStatuses.length} requirements ready or not applicable.`,
      ready:
        input.requirementStatuses.length > 0 &&
        completedRequirements === input.requirementStatuses.length,
    },
  ];
}

export function isRequirementComplete(status: AuditRequirementStatus) {
  return status === 'ready' || status === 'not_applicable';
}

export function readinessPercent(statuses: AuditRequirementStatus[]) {
  if (statuses.length === 0) return 0;
  return Math.round((statuses.filter(isRequirementComplete).length / statuses.length) * 100);
}

function item(key: string, category: string, title: string, guidance: string) {
  return { key, category, title, guidance };
}

function toTimestamp(value: Date | string | null) {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
