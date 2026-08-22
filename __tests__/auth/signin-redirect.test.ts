import { describe, expect, it } from 'vitest';
import { safeNextPath } from '@/lib/auth/redirect';

describe('safeNextPath', () => {
  it.each([
    [null, '/'],
    [undefined, '/'],
    ['', '/'],
    ['https://example.com/account', '/'],
    ['//example.com/account', '/'],
    ['javascript:alert(1)', '/'],
  ])('falls back to home for an unsafe next path (%s)', (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
  });

  it.each([
    ['/', '/'],
    ['/dashboard', '/dashboard'],
    ['/engagements/123?tab=scope#details', '/engagements/123?tab=scope#details'],
  ])('preserves a safe relative next path (%s)', (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
  });
});
