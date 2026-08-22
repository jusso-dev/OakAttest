import type { Classification } from '@/db/schema/enums';
import { classificationAllowed } from '@/lib/classification/guard';

export type ReusableEvidenceState = {
  sourceTenantId: string;
  targetTenantId: string;
  sourceClientId: string | null;
  targetClientId: string | null;
  sourceEngagementId: string;
  targetEngagementId: string;
  evidenceClassification: Classification;
  targetClassification: Classification;
  reviewStatus: string;
  storageVerifiedAt: Date | null;
  quarantinedAt: Date | null;
  sha256: string;
  validUntil: Date;
};

export function evidenceReuseErrors(state: ReusableEvidenceState, now = new Date()): string[] {
  const errors: string[] = [];
  if (state.sourceTenantId !== state.targetTenantId) errors.push('Evidence cannot cross tenant boundaries.');
  if (!state.sourceClientId || !state.targetClientId || state.sourceClientId !== state.targetClientId) {
    errors.push('Evidence reuse is limited to assessments for the same registered client.');
  }
  if (state.sourceEngagementId === state.targetEngagementId) {
    errors.push('Link the evidence directly to another control within the same assessment.');
  }
  if (!classificationAllowed(state.targetClassification, state.evidenceClassification)) {
    errors.push('The target workspace is not approved to hold this evidence classification.');
  }
  if (state.reviewStatus !== 'accepted') errors.push('Only assessor-accepted evidence can be reused.');
  if (!state.storageVerifiedAt || state.sha256 === 'pending') errors.push('Evidence storage and checksum must be verified.');
  if (state.quarantinedAt) errors.push('Quarantined evidence cannot be reused.');
  if (state.validUntil <= now) errors.push('Evidence reuse must have a future review or expiry date.');
  return errors;
}

export function assertEvidenceReusable(state: ReusableEvidenceState, now = new Date()): void {
  const errors = evidenceReuseErrors(state, now);
  if (errors.length) throw new Error(errors.join(' '));
}
