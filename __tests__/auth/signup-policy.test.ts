import { describe, expect, it } from 'vitest';
import { isPublicSignupEnabled } from '@/lib/auth/signup-policy';

describe('public signup policy', () => {
  it('is disabled by default', () => {
    expect(isPublicSignupEnabled({})).toBe(false);
  });

  it('stays disabled for false-like values', () => {
    expect(isPublicSignupEnabled({ ALLOW_PUBLIC_SIGNUP: 'false' })).toBe(false);
    expect(isPublicSignupEnabled({ ALLOW_PUBLIC_SIGNUP: '1' })).toBe(false);
  });

  it('requires an explicit true value', () => {
    expect(isPublicSignupEnabled({ ALLOW_PUBLIC_SIGNUP: ' true ' })).toBe(true);
  });
});
