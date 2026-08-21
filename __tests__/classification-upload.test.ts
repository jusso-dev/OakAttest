import { describe, expect, it } from 'vitest';
import {
  assertClassificationAllowed,
  classificationAllowed,
} from '@/lib/classification/guard';

describe('upload classification boundary', () => {
  it('allows data at or below the workspace classification', () => {
    expect(classificationAllowed('OFFICIAL', 'OFFICIAL')).toBe(true);
    expect(classificationAllowed('PROTECTED', 'OFFICIAL_SENSITIVE')).toBe(true);
    expect(classificationAllowed('PROTECTED', 'PROTECTED')).toBe(true);
  });

  it('blocks OFFICIAL: Sensitive and higher data from an OFFICIAL workspace', () => {
    for (const classification of [
      'OFFICIAL_SENSITIVE',
      'PROTECTED',
      'SECRET',
      'TOP_SECRET',
    ] as const) {
      expect(() => assertClassificationAllowed('OFFICIAL', classification)).toThrow(
        /Upload blocked.*data-handling boundary/,
      );
    }
  });
});
