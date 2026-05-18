import type { Role } from '@/lib/rbac/matrix';

export type MfaMode = 'optional' | 'assessor_required' | 'all_users_required';

export type MfaPolicy = {
  mfaMode?: MfaMode;
  mfaGracePeriodDays?: number;
};

export function effectiveMfaMode(policy?: MfaPolicy | null): MfaMode {
  return policy?.mfaMode ?? 'optional';
}

export function isMfaRequiredForRoles(roles: Role[], policy?: MfaPolicy | null): boolean {
  const mode = effectiveMfaMode(policy);
  if (mode === 'optional') return false;
  if (mode === 'all_users_required') return roles.length > 0;
  return roles.some((role) =>
    role === 'tenant_owner' ||
    role === 'assessor_admin' ||
    role === 'lead_assessor' ||
    role === 'assessor',
  );
}

export function isMfaGraceExpired(enforcedAt: Date | null | undefined, policy?: MfaPolicy | null): boolean {
  if (!enforcedAt) return true;
  const days = policy?.mfaGracePeriodDays ?? 0;
  if (days <= 0) return true;
  return Date.now() > enforcedAt.getTime() + days * 24 * 60 * 60 * 1000;
}

export function shouldRequireMfaEnrollment(input: {
  roles: Role[];
  policy?: MfaPolicy | null;
  enrolledAt?: Date | null;
  twoFactorEnabled?: boolean | null;
  enforcedAt?: Date | null;
  now?: Date;
}): boolean {
  if (!isMfaRequiredForRoles(input.roles, input.policy)) return false;
  if (input.enrolledAt || input.twoFactorEnabled) return false;

  const graceDays = input.policy?.mfaGracePeriodDays ?? 0;
  if (!input.enforcedAt) return graceDays <= 0;
  if (graceDays <= 0) return true;

  const now = input.now ?? new Date();
  return now.getTime() > input.enforcedAt.getTime() + graceDays * 24 * 60 * 60 * 1000;
}
