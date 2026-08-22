// Permission matrix. Map of `action` → set of roles that may perform it.
//
// Two scopes: tenant-level roles and engagement-level roles. Actions are
// namespaced (e.g. `tenant:invite`, `engagement:create`, `evidence:upload`)
// so the independence guard (§15) can branch on prefix.
//
// IRAP independence rule: anything that constitutes remediation advice must
// be gated to client-side roles only. Those actions are prefixed
// `remediation_guidance:` and listed at the bottom; assessor-side roles are
// explicitly absent from each one.

export type TenantRole = 'tenant_owner' | 'assessor_admin';
export type EngagementRole =
  | 'lead_assessor'
  | 'assessor'
  | 'client_admin'
  | 'client_contributor'
  | 'read_only_observer';

export type Role = TenantRole | EngagementRole;

// Partner (MSP) roles. A partner sits above tenants; partner members manage many
// client tenants. `rolesForUser` maps a partner role to a standard tenant role
// (partner_owner→tenant_owner, partner_admin→assessor_admin) so this matrix and
// the IRAP independence guard apply unchanged. Partner-scoped provisioning
// actions are enforced via `requirePartnerRole` in `lib/auth/partner.ts`.
export type PartnerRole = 'partner_owner' | 'partner_admin';

// Maps a partner (MSP) role to the standard tenant role it grants over the
// partner's client tenants. Pure — exercised by unit tests and used by
// `rolesForUser`.
export function partnerRoleToTenantRole(role: PartnerRole): TenantRole {
  return role === 'partner_owner' ? 'tenant_owner' : 'assessor_admin';
}

export const ASSESSOR_ROLES: ReadonlySet<EngagementRole> = new Set([
  'lead_assessor',
  'assessor',
]);
export const CLIENT_ROLES: ReadonlySet<EngagementRole> = new Set([
  'client_admin',
  'client_contributor',
]);

// Action keys. Add new actions here so the matrix stays the single source of
// truth.
export const ACTIONS = {
  // tenant administration
  tenantManage: 'tenant:manage',
  tenantInvite: 'tenant:invite',
  tenantViewMembers: 'tenant:view_members',
  tenantManageBranding: 'tenant:manage_branding',
  tenantManageIpAllowlist: 'tenant:manage_ip_allowlist',
  tenantManageIsm: 'tenant:manage_ism',

  // client registry
  clientView: 'client:view',
  clientManage: 'client:manage',

  // engagements
  engagementCreate: 'engagement:create',
  engagementUpdate: 'engagement:update',
  engagementView: 'engagement:view',
  engagementInvite: 'engagement:invite',
  engagementLockBoundary: 'engagement:lock_boundary',

  // scope + applicability
  scopeUpdate: 'scope:update',
  applicabilityDecide: 'applicability:decide',
  implementationStatementWrite: 'implementation_statement:write',

  // evidence
  evidenceRequest: 'evidence:request',
  evidenceUpload: 'evidence:upload',
  evidenceReview: 'evidence:review',
  evidenceView: 'evidence:view',

  // findings
  findingCreate: 'finding:create',
  findingUpdate: 'finding:update',
  findingSignOff: 'finding:sign_off',
  findingView: 'finding:view',

  // engagement tasks
  taskView: 'task:view',
  taskManage: 'task:manage',

  // audit readiness
  auditReadinessView: 'audit_readiness:view',
  auditReadinessManage: 'audit_readiness:manage',

  // certification
  certificationGenerate: 'certification:generate',
  certificationSign: 'certification:sign',

  // risk, authorisation, and continuous monitoring
  assuranceLifecycleView: 'assurance_lifecycle:view',
  riskAssess: 'risk:assess',
  riskTreat: 'risk:treat',
  riskAccept: 'risk:accept',
  systemAuthorise: 'system:authorise',
  monitoringManage: 'monitoring:manage',
  monitoringEventCreate: 'monitoring_event:create',

  // public assurance publication
  trustPortalView: 'trust_portal:view',
  trustPortalManage: 'trust_portal:manage',

  // automated assurance and reusable evidence
  connectorView: 'connector:view',
  connectorManage: 'connector:manage',
  connectorRun: 'connector:run',
  commonControlManage: 'common_control:manage',
  evidenceReuseView: 'evidence_reuse:view',
  evidenceReusePropose: 'evidence_reuse:propose',
  evidenceReuseReview: 'evidence_reuse:review',

  // exports
  sspExportDelete: 'ssp_export:delete',

  // audit
  auditView: 'audit:view',
  complianceView: 'compliance:view',

  // independence-gated client-side actions
  remediationGuidanceView: 'remediation_guidance:view',
  remediationGuidanceWrite: 'remediation_guidance:write',
} as const;

export type Action = (typeof ACTIONS)[keyof typeof ACTIONS];

type Allow = ReadonlyArray<Role>;

// Each row lists every role that may perform the action. Order is irrelevant.
export const PERMISSIONS: Record<Action, Allow> = {
  // Tenant admin
  [ACTIONS.tenantManage]: ['tenant_owner'],
  [ACTIONS.tenantInvite]: ['tenant_owner', 'assessor_admin'],
  [ACTIONS.tenantViewMembers]: ['tenant_owner', 'assessor_admin'],
  [ACTIONS.tenantManageBranding]: ['tenant_owner'],
  [ACTIONS.tenantManageIpAllowlist]: ['tenant_owner'],
  [ACTIONS.tenantManageIsm]: ['tenant_owner', 'assessor_admin'],

  // Client registry
  [ACTIONS.clientView]: ['tenant_owner', 'assessor_admin', 'lead_assessor', 'assessor'],
  [ACTIONS.clientManage]: ['tenant_owner', 'assessor_admin', 'lead_assessor'],

  // Engagements
  [ACTIONS.engagementCreate]: ['tenant_owner', 'assessor_admin'],
  [ACTIONS.engagementUpdate]: ['tenant_owner', 'assessor_admin', 'lead_assessor'],
  [ACTIONS.engagementView]: [
    'tenant_owner',
    'assessor_admin',
    'lead_assessor',
    'assessor',
    'client_admin',
    'client_contributor',
    'read_only_observer',
  ],
  [ACTIONS.engagementInvite]: [
    'tenant_owner',
    'assessor_admin',
    'lead_assessor',
    'client_admin',
  ],
  [ACTIONS.engagementLockBoundary]: ['tenant_owner', 'assessor_admin', 'lead_assessor'],

  // Scope & applicability
  [ACTIONS.scopeUpdate]: [
    'tenant_owner',
    'assessor_admin',
    'lead_assessor',
    'assessor',
    'client_admin',
    'client_contributor',
  ],
  [ACTIONS.applicabilityDecide]: ['lead_assessor', 'assessor'],
  [ACTIONS.implementationStatementWrite]: ['client_admin', 'client_contributor'],

  // Evidence
  [ACTIONS.evidenceRequest]: ['lead_assessor', 'assessor'],
  [ACTIONS.evidenceUpload]: ['client_admin', 'client_contributor'],
  [ACTIONS.evidenceReview]: ['lead_assessor', 'assessor'],
  [ACTIONS.evidenceView]: [
    'tenant_owner',
    'assessor_admin',
    'lead_assessor',
    'assessor',
    'client_admin',
    'client_contributor',
    'read_only_observer',
  ],

  // Findings
  [ACTIONS.findingCreate]: ['lead_assessor', 'assessor'],
  [ACTIONS.findingUpdate]: ['lead_assessor', 'assessor'],
  [ACTIONS.findingSignOff]: ['lead_assessor'],
  [ACTIONS.findingView]: [
    'tenant_owner',
    'assessor_admin',
    'lead_assessor',
    'assessor',
    'client_admin',
    'client_contributor',
    'read_only_observer',
  ],

  // Tasks
  [ACTIONS.taskView]: [
    'tenant_owner',
    'assessor_admin',
    'lead_assessor',
    'assessor',
    'client_admin',
    'client_contributor',
    'read_only_observer',
  ],
  [ACTIONS.taskManage]: [
    'tenant_owner',
    'assessor_admin',
    'lead_assessor',
    'assessor',
    'client_admin',
    'client_contributor',
  ],

  // Audit readiness
  [ACTIONS.auditReadinessView]: [
    'tenant_owner',
    'assessor_admin',
    'lead_assessor',
    'assessor',
    'client_admin',
    'client_contributor',
    'read_only_observer',
  ],
  [ACTIONS.auditReadinessManage]: [
    'tenant_owner',
    'assessor_admin',
    'lead_assessor',
    'client_admin',
  ],

  // Certification
  [ACTIONS.certificationGenerate]: ['lead_assessor'],
  [ACTIONS.certificationSign]: ['lead_assessor'],

  // Risk and authorisation lifecycle. Business-risk acceptance and system
  // authorisation remain client-accountable decisions, separate from assessors.
  [ACTIONS.assuranceLifecycleView]: [
    'tenant_owner',
    'assessor_admin',
    'lead_assessor',
    'assessor',
    'client_admin',
    'client_contributor',
    'read_only_observer',
  ],
  [ACTIONS.riskAssess]: [
    'tenant_owner',
    'assessor_admin',
    'lead_assessor',
    'assessor',
    'client_admin',
    'client_contributor',
  ],
  [ACTIONS.riskTreat]: ['client_admin', 'client_contributor'],
  [ACTIONS.riskAccept]: ['client_admin'],
  [ACTIONS.systemAuthorise]: ['client_admin'],
  [ACTIONS.monitoringManage]: ['client_admin', 'client_contributor'],
  [ACTIONS.monitoringEventCreate]: [
    'tenant_owner',
    'assessor_admin',
    'lead_assessor',
    'assessor',
    'client_admin',
    'client_contributor',
  ],
  [ACTIONS.trustPortalView]: [
    'tenant_owner',
    'assessor_admin',
    'lead_assessor',
    'assessor',
    'client_admin',
    'client_contributor',
    'read_only_observer',
  ],
  [ACTIONS.trustPortalManage]: ['client_admin'],
  [ACTIONS.connectorView]: [
    'tenant_owner',
    'assessor_admin',
    'lead_assessor',
    'assessor',
    'client_admin',
    'client_contributor',
    'read_only_observer',
  ],
  [ACTIONS.connectorManage]: ['tenant_owner', 'assessor_admin', 'lead_assessor', 'client_admin'],
  [ACTIONS.connectorRun]: ['tenant_owner', 'assessor_admin', 'lead_assessor', 'assessor', 'client_admin', 'client_contributor'],
  [ACTIONS.commonControlManage]: ['tenant_owner', 'assessor_admin', 'lead_assessor'],
  [ACTIONS.evidenceReuseView]: [
    'tenant_owner',
    'assessor_admin',
    'lead_assessor',
    'assessor',
    'client_admin',
    'client_contributor',
    'read_only_observer',
  ],
  [ACTIONS.evidenceReusePropose]: ['lead_assessor', 'assessor', 'client_admin', 'client_contributor'],
  [ACTIONS.evidenceReuseReview]: ['lead_assessor', 'assessor'],

  // Exports
  [ACTIONS.sspExportDelete]: [
    'tenant_owner',
    'assessor_admin',
    'lead_assessor',
    'client_admin',
  ],

  // Audit
  [ACTIONS.auditView]: ['tenant_owner', 'assessor_admin'],
  [ACTIONS.complianceView]: ['tenant_owner', 'assessor_admin'],

  // Independence guard: remediation guidance is client-side only.
  // Note the explicit absence of any assessor or tenant role here.
  [ACTIONS.remediationGuidanceView]: ['client_admin', 'client_contributor'],
  [ACTIONS.remediationGuidanceWrite]: ['client_admin', 'client_contributor'],
};

// Belt-and-braces: programmatic check that no assessor-side role accidentally
// gets a remediation-guidance permission. Imported by the rbac test suite.
export function assertIndependenceGuard(): void {
  const offenders: Array<{ action: Action; role: Role }> = [];
  const clientAccountabilityActions: ReadonlySet<Action> = new Set([
    ACTIONS.riskAccept,
    ACTIONS.systemAuthorise,
    ACTIONS.trustPortalManage,
  ]);
  for (const action of Object.values(ACTIONS)) {
    if (!action.startsWith('remediation_guidance:') && !clientAccountabilityActions.has(action)) continue;
    for (const role of PERMISSIONS[action]) {
      if (
        role === 'tenant_owner' ||
        role === 'assessor_admin' ||
        role === 'lead_assessor' ||
        role === 'assessor' ||
        role === 'read_only_observer'
      ) {
        offenders.push({ action, role });
      }
    }
  }
  if (offenders.length > 0) {
    throw new Error(
      `Independence guard violated: ${offenders
        .map((o) => `${o.role}=${o.action}`)
        .join(', ')}`,
    );
  }
}

export function isPermitted(action: Action, role: Role): boolean {
  return PERMISSIONS[action].includes(role);
}
