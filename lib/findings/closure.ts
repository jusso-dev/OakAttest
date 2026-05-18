export type FindingClosureInput = {
  type: 'non_conformance' | 'observation';
  signedOffAt?: Date | string | null;
  passedRetestWithEvidenceCount: number;
};

export function assertCanCloseFinding(input: FindingClosureInput): void {
  if (input.type !== 'non_conformance') return;
  if (input.passedRetestWithEvidenceCount <= 0) {
    throw new Error('Non-conformances require a passed retest with linked proof evidence before closure.');
  }
  if (!input.signedOffAt) {
    throw new Error('Non-conformances require lead assessor sign-off before closure.');
  }
}
