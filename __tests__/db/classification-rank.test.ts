import { describe, it, expect } from 'vitest';
import { CLASSIFICATION_RANK } from '@/db/schema/enums';

describe('classification rank ordering', () => {
  it('matches the IRAP cumulative rule', () => {
    expect(CLASSIFICATION_RANK.OFFICIAL).toBe(1);
    expect(CLASSIFICATION_RANK.OFFICIAL_SENSITIVE).toBe(2);
    expect(CLASSIFICATION_RANK.PROTECTED).toBe(3);
    expect(CLASSIFICATION_RANK.SECRET).toBe(4);
    expect(CLASSIFICATION_RANK.TOP_SECRET).toBe(5);
  });

  it('higher classifications include lower ones', () => {
    // A PROTECTED engagement (rank 3) must include every control with
    // min_classification_rank <= 3: OFFICIAL, OFFICIAL_SENSITIVE, PROTECTED.
    const protectedRank = CLASSIFICATION_RANK.PROTECTED;
    expect(CLASSIFICATION_RANK.OFFICIAL).toBeLessThanOrEqual(protectedRank);
    expect(CLASSIFICATION_RANK.OFFICIAL_SENSITIVE).toBeLessThanOrEqual(protectedRank);
    expect(CLASSIFICATION_RANK.PROTECTED).toBeLessThanOrEqual(protectedRank);
    expect(CLASSIFICATION_RANK.SECRET).toBeGreaterThan(protectedRank);
    expect(CLASSIFICATION_RANK.TOP_SECRET).toBeGreaterThan(protectedRank);
  });

  it('filters PROTECTED engagement controls without SECRET or TOP_SECRET', () => {
    const protectedRank = CLASSIFICATION_RANK.PROTECTED;
    const seeded = Object.entries(CLASSIFICATION_RANK)
      .filter(([, rank]) => rank <= protectedRank)
      .map(([classification]) => classification);

    expect(seeded).toEqual(['OFFICIAL', 'OFFICIAL_SENSITIVE', 'PROTECTED']);
  });
});
