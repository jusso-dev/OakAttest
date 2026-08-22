import { describe, expect, it } from 'vitest';
import {
  assertFrameworkPackTransition,
  validateCustomFrameworkDefinition,
  validatePackDates,
} from '@/lib/frameworks/profile';

describe('custom framework validation', () => {
  it('normalises valid framework metadata', () => {
    expect(validateCustomFrameworkDefinition({
      key: ' My Control Pack ',
      label: 'My Control Pack',
      revision: '2026.1',
      description: 'A tenant-owned control pack for a defined internal assessment.',
    })).toEqual({
      key: 'my-control-pack',
      label: 'My Control Pack',
      revision: '2026.1',
      description: 'A tenant-owned control pack for a defined internal assessment.',
    });
  });

  it('rejects invalid definitions and lifecycle shortcuts', () => {
    expect(() => validateCustomFrameworkDefinition({ key: '1', label: 'x', revision: '', description: 'short' })).toThrow('key');
    expect(() => assertFrameworkPackTransition('draft', 'active')).not.toThrow();
    expect(() => assertFrameworkPackTransition('draft', 'retired')).toThrow('Invalid framework pack transition');
    expect(() => assertFrameworkPackTransition('retired', 'active')).toThrow('Invalid framework pack transition');
  });

  it('requires expiry after effective date', () => {
    expect(() => validatePackDates(new Date('2026-01-01'), new Date('2027-01-01'))).not.toThrow();
    expect(() => validatePackDates(new Date('2027-01-01'), new Date('2026-01-01'))).toThrow('after');
  });
});
