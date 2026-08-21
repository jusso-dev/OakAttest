import { describe, expect, it } from 'vitest';
import {
  formatDateInput,
  formatDateTime,
  formatTimeZoneOffset,
  isValidTimeZone,
  zonedDateEndToUtc,
  zonedDateTimeToUtc,
} from '@/lib/timezone';

describe('user timezones', () => {
  it('converts a Sydney wall-clock time to the correct UTC instant in daylight saving time', () => {
    expect(zonedDateTimeToUtc('2026-01-15T09:30', 'Australia/Sydney').toISOString()).toBe(
      '2026-01-14T22:30:00.000Z',
    );
  });

  it('converts a Sydney wall-clock time to the correct UTC instant in standard time', () => {
    expect(zonedDateTimeToUtc('2026-07-15T09:30', 'Australia/Sydney').toISOString()).toBe(
      '2026-07-14T23:30:00.000Z',
    );
  });

  it('rejects a wall-clock time skipped by daylight saving', () => {
    expect(() => zonedDateTimeToUtc('2026-10-04T02:30', 'Australia/Sydney')).toThrow(
      'does not exist',
    );
  });

  it('stores date-only deadlines at the end of the selected local day', () => {
    expect(zonedDateEndToUtc('2026-01-15', 'Australia/Sydney').toISOString()).toBe(
      '2026-01-15T12:59:59.999Z',
    );
  });

  it('formats the same instant for the selected timezone and exposes its offset', () => {
    const instant = '2026-01-14T22:30:00.000Z';
    expect(formatDateInput(instant, 'Australia/Sydney')).toBe('2026-01-15');
    expect(formatDateTime(instant, 'Australia/Sydney')).toContain('09:30');
    expect(formatTimeZoneOffset('Australia/Sydney', instant)).toBe('UTC+11:00');
  });

  it('validates IANA timezone identifiers', () => {
    expect(isValidTimeZone('Pacific/Auckland')).toBe(true);
    expect(isValidTimeZone('not/a-zone')).toBe(false);
  });
});
