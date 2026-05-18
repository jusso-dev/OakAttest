import { describe, expect, it } from 'vitest';
import { assertEvidenceFinalised, evidenceStorageState } from '@/lib/evidence/state';

describe('evidence storage state', () => {
  it('marks unverified evidence as pending', () => {
    expect(evidenceStorageState({ storageVerifiedAt: null, quarantinedAt: null })).toBe('pending');
  });

  it('marks verified evidence as finalised', () => {
    expect(evidenceStorageState({ storageVerifiedAt: new Date(), quarantinedAt: null })).toBe('finalised');
    expect(() => assertEvidenceFinalised({ storageVerifiedAt: new Date(), quarantinedAt: null })).not.toThrow();
  });

  it('keeps quarantined evidence blocked even if verification metadata exists', () => {
    const item = { storageVerifiedAt: new Date(), quarantinedAt: new Date() };
    expect(evidenceStorageState(item)).toBe('quarantined');
    expect(() => assertEvidenceFinalised(item)).toThrow(/quarantined/i);
  });
});
