import { describe, expect, it } from 'vitest';
import { diffIsmControlRows } from '@/lib/ism/compare';

describe('ISM revision compare', () => {
  it('classifies added, removed, changed, and unchanged controls', () => {
    const diff = diffIsmControlRows({
      fromRevision: '2025-01',
      toRevision: '2025-06',
      fromRows: [
        control('ISM-0001', 'old description'),
        control('ISM-0002', 'removed'),
        control('ISM-0003', 'unchanged'),
      ],
      toRows: [
        control('ISM-0001', 'new description'),
        control('ISM-0003', 'unchanged'),
        control('ISM-0004', 'added'),
      ],
    });

    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(1);
    expect(diff.changed).toBe(1);
    expect(diff.unchanged).toBe(1);
    expect(diff.items.changed[0]).toMatchObject({
      controlId: 'ISM-0001',
      previousDescription: 'old description',
      changedFields: ['description'],
    });
  });
});

function control(controlId: string, description: string) {
  return {
    controlId,
    description,
    guidance: null,
    minClassification: 'OFFICIAL',
    essentialEightMapping: null,
  };
}
