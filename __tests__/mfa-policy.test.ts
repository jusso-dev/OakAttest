import { describe, expect, it } from 'vitest';
import { isMfaRequiredForRoles, shouldRequireMfaEnrollment } from '@/lib/auth/mfa-policy';

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

  it('honours the tenant MFA grace period before forcing enrolment', () => {
    const now = new Date('2026-05-18T00:00:00.000Z');
    expect(
      shouldRequireMfaEnrollment({
        roles: ['assessor'],
        policy: { mfaMode: 'assessor_required', mfaGracePeriodDays: 7 },
        enforcedAt: new Date('2026-05-16T00:00:00.000Z'),
        now,
      }),
    ).toBe(false);
    expect(
      shouldRequireMfaEnrollment({
        roles: ['assessor'],
        policy: { mfaMode: 'assessor_required', mfaGracePeriodDays: 7 },
        enforcedAt: new Date('2026-05-01T00:00:00.000Z'),
        now,
      }),
    ).toBe(true);
  });

  it('does not force enrolment when MFA is already enabled', () => {
    expect(
      shouldRequireMfaEnrollment({
        roles: ['tenant_owner'],
        policy: { mfaMode: 'all_users_required' },
        twoFactorEnabled: true,
      }),
    ).toBe(false);
  });
});
