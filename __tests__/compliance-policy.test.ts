import { describe, expect, it } from 'vitest';
import { addCalendarMonths, daysUntil, reassessmentMonthsFor } from '@/lib/compliance/policy';

describe('compliance policy helpers', () => {
  it('uses policy overrides before defaults', () => {
    expect(reassessmentMonthsFor('PROTECTED', null)).toBe(24);
    expect(reassessmentMonthsFor('PROTECTED', { reassessmentMonths: { PROTECTED: 18 } })).toBe(18);
  });

  it('adds calendar months without fixed 30-day arithmetic', () => {
    expect(addCalendarMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('calculates whole calendar-day distance', () => {
    expect(daysUntil(new Date(2026, 4, 20), new Date(2026, 4, 18))).toBe(2);
  });
});
