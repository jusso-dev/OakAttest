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

  // certification
  certificationGenerate: 'certification:generate',
  certificationSign: 'certification:sign',

  // audit
  auditView: 'audit:view',

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
  [ACTIONS.engagementLockBoundary]: ['lead_assessor', 'assessor_admin'],

  // Scope & applicability
  [ACTIONS.scopeUpdate]: ['client_admin', 'client_contributor'],
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

  // Certification
  [ACTIONS.certificationGenerate]: ['lead_assessor'],
  [ACTIONS.certificationSign]: ['lead_assessor'],

  // Audit
  [ACTIONS.auditView]: ['tenant_owner', 'assessor_admin'],

  // Independence guard: remediation guidance is client-side only.
  // Note the explicit absence of any assessor or tenant role here.
  [ACTIONS.remediationGuidanceView]: ['client_admin', 'client_contributor'],
  [ACTIONS.remediationGuidanceWrite]: ['client_admin', 'client_contributor'],
};

// Belt-and-braces: programmatic check that no assessor-side role accidentally
// gets a remediation-guidance permission. Imported by the rbac test suite.
export function assertIndependenceGuard(): void {
  const offenders: Array<{ action: Action; role: Role }> = [];
  for (const action of Object.values(ACTIONS)) {
    if (!action.startsWith('remediation_guidance:')) continue;
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
