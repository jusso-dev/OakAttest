import { describe, expect, it } from 'vitest';
import { isValidAbn, normalizeAbn } from '@/lib/abn';

describe('ABN validation', () => {
  it('accepts valid ABNs with or without formatting', () => {
    expect(isValidAbn('62684389839')).toBe(true);
    expect(isValidAbn('62 684 389 839')).toBe(true);
    expect(normalizeAbn('62 684 389 839')).toBe('62684389839');
  });

  it('rejects invalid ABNs', () => {
    expect(isValidAbn('62684389838')).toBe(false);
    expect(isValidAbn('12345678901')).toBe(false);
    expect(isValidAbn('62 684 389')).toBe(false);
  });
});
