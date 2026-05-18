import { describe, expect, it } from 'vitest';
import { isMfaRequiredForRoles } from '@/lib/auth/mfa-policy';

describe('MFA policy helpers', () => {
  it('keeps optional mode optional', () => {
    expect(isMfaRequiredForRoles(['lead_assessor'], { mfaMode: 'optional' })).toBe(false);
  });

  it('requires assessor-side roles in assessor_required mode', () => {
    expect(isMfaRequiredForRoles(['assessor'], { mfaMode: 'assessor_required' })).toBe(true);
    expect(isMfaRequiredForRoles(['client_contributor'], { mfaMode: 'assessor_required' })).toBe(false);
  });

  it('requires any member role in all-users mode', () => {
    expect(isMfaRequiredForRoles(['client_contributor'], { mfaMode: 'all_users_required' })).toBe(true);
  });
});
