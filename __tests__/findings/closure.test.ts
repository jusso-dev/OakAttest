import { describe, expect, it } from 'vitest';
import { assertCanCloseFinding } from '@/lib/findings/closure';

describe('finding closure controls', () => {
  it('allows observations to close without retest evidence', () => {
    expect(() =>
      assertCanCloseFinding({
        type: 'observation',
        passedRetestWithEvidenceCount: 0,
      }),
    ).not.toThrow();
  });

  it('blocks non-conformance closure without passed retest evidence', () => {
    expect(() =>
      assertCanCloseFinding({
        type: 'non_conformance',
        signedOffAt: new Date(),
        passedRetestWithEvidenceCount: 0,
      }),
    ).toThrow(/passed retest/i);
  });

  it('blocks non-conformance closure without lead sign-off', () => {
    expect(() =>
      assertCanCloseFinding({
        type: 'non_conformance',
        passedRetestWithEvidenceCount: 1,
      }),
    ).toThrow(/sign-off/i);
  });

  it('allows non-conformance closure with retest evidence and sign-off', () => {
    expect(() =>
      assertCanCloseFinding({
        type: 'non_conformance',
        signedOffAt: new Date(),
        passedRetestWithEvidenceCount: 1,
      }),
    ).not.toThrow();
  });
});
