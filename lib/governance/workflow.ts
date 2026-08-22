export type PolicyStatus = 'draft' | 'in_review' | 'approved' | 'published' | 'retired';
export type PersonnelStatus = 'onboarding' | 'active' | 'suspended' | 'terminated';
export type AccessReviewStatus = 'draft' | 'in_progress' | 'in_review' | 'completed';
export type VendorStatus = 'intake' | 'assessing' | 'approved' | 'monitoring' | 'offboarding' | 'closed';
export type RiskRating = 'low' | 'medium' | 'high' | 'critical';

const policyTransitions: Record<PolicyStatus, PolicyStatus[]> = {
  draft: ['in_review'],
  in_review: ['draft', 'approved'],
  approved: ['draft', 'published'],
  published: ['retired'],
  retired: [],
};
const personnelTransitions: Record<PersonnelStatus, PersonnelStatus[]> = {
  onboarding: ['active', 'terminated'],
  active: ['suspended', 'terminated'],
  suspended: ['active', 'terminated'],
  terminated: [],
};
const accessReviewTransitions: Record<AccessReviewStatus, AccessReviewStatus[]> = {
  draft: ['in_progress'],
  in_progress: ['in_review'],
  in_review: ['in_progress', 'completed'],
  completed: [],
};
const vendorTransitions: Record<VendorStatus, VendorStatus[]> = {
  intake: ['assessing'],
  assessing: ['approved'],
  approved: ['monitoring', 'offboarding'],
  monitoring: ['assessing', 'offboarding'],
  offboarding: ['closed'],
  closed: [],
};

export function assertPolicyTransition(current: PolicyStatus, next: PolicyStatus) {
  assertTransition('policy', current, next, policyTransitions[current]);
}

export function assertPersonnelTransition(current: PersonnelStatus, next: PersonnelStatus) {
  if (current === next) return;
  assertTransition('personnel', current, next, personnelTransitions[current]);
}

export function assertAccessReviewTransition(current: AccessReviewStatus, next: AccessReviewStatus) {
  assertTransition('access review', current, next, accessReviewTransitions[current]);
}

export function assertVendorTransition(current: VendorStatus, next: VendorStatus) {
  assertTransition('vendor', current, next, vendorTransitions[current]);
}

export function accessReviewCompletionBlockers(items: Array<{
  decision: string;
  remediationStatus: string;
}>) {
  if (items.length === 0) return ['Access review has no access records.'];
  const blockers: string[] = [];
  const pending = items.filter((item) => item.decision === 'pending').length;
  const remediation = items.filter((item) =>
    (item.decision === 'modify' || item.decision === 'revoke') && item.remediationStatus !== 'complete',
  ).length;
  if (pending > 0) blockers.push(`${pending} access decision${pending === 1 ? '' : 's'} remain pending.`);
  if (remediation > 0) blockers.push(`${remediation} access remediation item${remediation === 1 ? ' remains' : 's remain'} open.`);
  return blockers;
}

export function vendorApprovalBlockers(input: {
  dueDiligenceSummary: string | null;
  residualRisk: RiskRating | null;
  nextReviewAt: Date | null;
  riskAcceptanceStatement: string | null;
}) {
  const blockers: string[] = [];
  if ((input.dueDiligenceSummary?.trim().length ?? 0) < 20) blockers.push('Due diligence summary is incomplete.');
  if (!input.residualRisk) blockers.push('Residual risk is not assessed.');
  if (!input.nextReviewAt) blockers.push('Next vendor review date is missing.');
  if (
    (input.residualRisk === 'high' || input.residualRisk === 'critical') &&
    (input.riskAcceptanceStatement?.trim().length ?? 0) < 20
  ) {
    blockers.push('High or critical residual risk needs a documented acceptance statement.');
  }
  return blockers;
}

export function parseAccessReviewItems(input: string) {
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) throw new Error('Add at least one access record.');
  if (lines.length > 500) throw new Error('Access review supports at most 500 records per campaign.');
  return lines.map((line, index) => {
    const fields = line.split('|').map((field) => field.trim());
    if (fields.length < 3 || fields.length > 4 || fields.slice(0, 3).some((field) => !field)) {
      throw new Error(`Access record ${index + 1} must be Name | System | Access level | optional email.`);
    }
    return {
      subjectName: fields[0].slice(0, 240),
      systemName: fields[1].slice(0, 240),
      accessLevel: fields[2].slice(0, 500),
      subjectEmail: fields[3]?.slice(0, 320) || null,
    };
  });
}

export type GovernanceOverdueItem = {
  kind: 'policy' | 'attestation' | 'personnel' | 'access_review' | 'vendor';
  id: string;
  label: string;
  dueAt: Date;
};

export function governanceOverdueItems({
  now,
  policies,
  attestations,
  personnel,
  accessReviews,
  vendors,
}: {
  now: Date;
  policies: Array<{ id: string; title: string; status: string; reviewDueAt: Date }>;
  attestations: Array<{ id: string; policyTitle: string; status: string; dueAt: Date }>;
  personnel: Array<{
    id: string;
    personName: string;
    employmentStatus: string;
    trainingDueAt: Date | null;
    trainingCompletedAt: Date | null;
    offboardingDueAt: Date | null;
    offboardingCompletedAt: Date | null;
  }>;
  accessReviews: Array<{ id: string; title: string; status: string; dueAt: Date }>;
  vendors: Array<{ id: string; vendorName: string; status: string; nextReviewAt: Date | null }>;
}) {
  const overdue: GovernanceOverdueItem[] = [];
  policies.forEach((policy) => {
    if (policy.status !== 'retired' && policy.reviewDueAt < now) {
      overdue.push({ kind: 'policy', id: policy.id, label: `Policy review: ${policy.title}`, dueAt: policy.reviewDueAt });
    }
  });
  attestations.forEach((attestation) => {
    if (attestation.status === 'pending' && attestation.dueAt < now) {
      overdue.push({ kind: 'attestation', id: attestation.id, label: `Policy acceptance: ${attestation.policyTitle}`, dueAt: attestation.dueAt });
    }
  });
  personnel.forEach((record) => {
    if (record.employmentStatus !== 'terminated' && record.trainingDueAt && !record.trainingCompletedAt && record.trainingDueAt < now) {
      overdue.push({ kind: 'personnel', id: record.id, label: `Training: ${record.personName}`, dueAt: record.trainingDueAt });
    }
    if (record.employmentStatus === 'terminated' && record.offboardingDueAt && !record.offboardingCompletedAt && record.offboardingDueAt < now) {
      overdue.push({ kind: 'personnel', id: record.id, label: `Offboarding: ${record.personName}`, dueAt: record.offboardingDueAt });
    }
  });
  accessReviews.forEach((review) => {
    if (review.status !== 'completed' && review.dueAt < now) {
      overdue.push({ kind: 'access_review', id: review.id, label: `Access review: ${review.title}`, dueAt: review.dueAt });
    }
  });
  vendors.forEach((vendor) => {
    if (!['offboarding', 'closed'].includes(vendor.status) && vendor.nextReviewAt && vendor.nextReviewAt < now) {
      overdue.push({ kind: 'vendor', id: vendor.id, label: `Vendor review: ${vendor.vendorName}`, dueAt: vendor.nextReviewAt });
    }
  });
  return overdue.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

function assertTransition(label: string, current: string, next: string, allowed: string[]) {
  if (!allowed.includes(next)) {
    throw new Error(`Invalid ${label} transition from ${current} to ${next}.`);
  }
}
