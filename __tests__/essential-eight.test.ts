import { describe, expect, it } from 'vitest';
import { calculateEssentialEightOverall, formatMaturity } from '@/lib/essential-eight';

describe('Essential Eight package maturity', () => {
  it('uses the lowest maturity across all eight strategies', () => {
    const rows = [
      'application_control',
      'patch_applications',
      'configure_macro_settings',
      'user_application_hardening',
      'restrict_admin_privileges',
      'patch_operating_systems',
      'multi_factor_authentication',
      'regular_backups',
    ].map((strategy, index) => ({
      strategy,
      currentMaturity: index === 3 ? 'ml1' : 'ml2',
      targetMaturity: 'ml2',
    }));

    const result = calculateEssentialEightOverall(rows, 'ml2');
    expect(result.achieved).toBe('ml1');
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].strategy).toBe('user_application_hardening');
  });

  it('treats missing strategies as ML0 blockers', () => {
    const result = calculateEssentialEightOverall([], 'ml1');
    expect(result.achieved).toBe('ml0');
    expect(result.blockers).toHaveLength(8);
    expect(formatMaturity(result.achieved)).toBe('ML0');
  });
});
