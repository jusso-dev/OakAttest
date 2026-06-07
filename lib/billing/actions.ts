// Action keys that mutate engagement or tenant data. Used by `requirePermission`
// to decide whether a subscription entitlement gate should run.
//
// Independence-gated remediation actions are still client-side writes and are
// included here so they fail closed if a subscription lapses.
//
// Keep in sync with `lib/rbac/matrix.ts`. The matrix is the source of truth for
// who; this set is the source of truth for what mutates.
import { ACTIONS } from '@/lib/rbac/matrix';

export const MUTATING_ACTIONS: ReadonlySet<string> = new Set([
  ACTIONS.tenantManage,
  ACTIONS.tenantInvite,
  ACTIONS.tenantManageBranding,
  ACTIONS.tenantManageIpAllowlist,
  ACTIONS.tenantManageIsm,
  ACTIONS.engagementCreate,
  ACTIONS.engagementUpdate,
  ACTIONS.engagementInvite,
  ACTIONS.engagementLockBoundary,
  ACTIONS.scopeUpdate,
  ACTIONS.applicabilityDecide,
  ACTIONS.implementationStatementWrite,
  ACTIONS.evidenceRequest,
  ACTIONS.evidenceUpload,
  ACTIONS.evidenceReview,
  ACTIONS.findingCreate,
  ACTIONS.findingUpdate,
  ACTIONS.findingSignOff,
  ACTIONS.taskManage,
  ACTIONS.certificationGenerate,
  ACTIONS.certificationSign,
  ACTIONS.sspExportDelete,
  ACTIONS.remediationGuidanceWrite,
]);
