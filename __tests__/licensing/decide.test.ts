import { describe, it, expect } from 'vitest';
import {
  decideFeature,
  decideCanCreateUser,
  decideCanCreateEntity,
  decideCanStore,
  decideFramework,
  featureForFramework,
  classifyPlanChange,
  FEATURES,
  type Entitlements,
} from '@/lib/licensing';
import { partnerRoleToTenantRole } from '@/lib/rbac/matrix';

const GB = 1_000_000_000;

function ent(overrides: Partial<Entitlements> = {}): Entitlements {
  return {
    planCode: 'PROFESSIONAL',
    planName: 'Professional',
    unlimited: false,
    features: new Set([FEATURES.ESSENTIAL_EIGHT, FEATURES.ISO27001]),
    limits: { maxUsers: 50, maxFrameworks: 3, maxEntities: 3, maxStorageGb: 50 },
    usage: { userCount: 10, entityCount: 1, frameworkCount: 1, storageBytes: 1 * GB },
    ...overrides,
  };
}

describe('decideFeature', () => {
  it('grants a feature the plan includes', () => {
    expect(decideFeature(ent(), FEATURES.ISO27001)).toBe(true);
  });
  it('denies a feature the plan lacks', () => {
    expect(decideFeature(ent(), FEATURES.NIST)).toBe(false);
  });
  it('unlimited (self-installed) grants everything', () => {
    expect(decideFeature(ent({ unlimited: true, features: new Set() }), FEATURES.SSO)).toBe(true);
  });
});

describe('limit decisions', () => {
  it('allows a new user under the seat cap', () => {
    expect(decideCanCreateUser(ent({ usage: { ...ent().usage, userCount: 49 } }))).toBe(true);
  });
  it('blocks a new user at the seat cap', () => {
    expect(decideCanCreateUser(ent({ usage: { ...ent().usage, userCount: 50 } }))).toBe(false);
  });
  it('null cap = unlimited users', () => {
    expect(
      decideCanCreateUser(
        ent({ limits: { ...ent().limits, maxUsers: null }, usage: { ...ent().usage, userCount: 9999 } }),
      ),
    ).toBe(true);
  });
  it('blocks a new entity at the cap', () => {
    expect(decideCanCreateEntity(ent({ usage: { ...ent().usage, entityCount: 3 } }))).toBe(false);
  });
});

describe('decideCanStore', () => {
  it('allows storage up to the cap', () => {
    // 1GB used, +49GB = 50GB exactly, cap 50GB
    expect(decideCanStore(ent(), 49 * GB)).toBe(true);
  });
  it('blocks storage over the cap', () => {
    expect(decideCanStore(ent(), 49 * GB + 1)).toBe(false);
  });
  it('unlimited storage when cap is null', () => {
    expect(decideCanStore(ent({ limits: { ...ent().limits, maxStorageGb: null } }), 999 * GB)).toBe(true);
  });
});

describe('decideFramework', () => {
  it('allows a framework whose feature is unlocked and under the count cap', () => {
    expect(decideFramework(ent(), 'iso-27001')).toEqual({ allowed: true });
  });
  it('denies a framework whose feature is locked', () => {
    expect(decideFramework(ent(), 'nist')).toEqual({ allowed: false, reason: 'feature' });
  });
  it('denies a new framework at the framework-count cap', () => {
    const e = ent({ usage: { ...ent().usage, frameworkCount: 3 } });
    expect(decideFramework(e, 'iso-27001')).toEqual({ allowed: false, reason: 'framework_limit' });
  });
  it('does not apply the count cap when not adding a new framework', () => {
    const e = ent({ usage: { ...ent().usage, frameworkCount: 3 } });
    expect(decideFramework(e, 'iso-27001', false)).toEqual({ allowed: true });
  });
  it('unlimited bypasses both feature and count checks', () => {
    expect(decideFramework(ent({ unlimited: true, features: new Set() }), 'pspf')).toEqual({
      allowed: true,
    });
  });
});

describe('featureForFramework', () => {
  it('maps framework keys to feature codes', () => {
    expect(featureForFramework('essential-eight')).toBe(FEATURES.ESSENTIAL_EIGHT);
    expect(featureForFramework('iso-27001')).toBe(FEATURES.ISO27001);
    expect(featureForFramework('nist-800-53')).toBe(FEATURES.NIST);
    expect(featureForFramework('soc2')).toBe(FEATURES.SOC2);
  });
  it('treats ISM and IRAP as the ISM framework (IRAP is an assessment, not a framework)', () => {
    expect(featureForFramework('ism')).toBe(FEATURES.ISM);
    expect(featureForFramework('irap')).toBe(FEATURES.ISM);
  });
  it('falls back to MULTI_FRAMEWORK for unknown keys', () => {
    expect(featureForFramework('whatever')).toBe(FEATURES.MULTI_FRAMEWORK);
  });
});

describe('classifyPlanChange', () => {
  it('no prior plan → created', () => {
    expect(classifyPlanChange(null, 'ESSENTIAL')).toBe('created');
  });
  it('higher tier → upgraded', () => {
    expect(classifyPlanChange('ESSENTIAL', 'PROFESSIONAL')).toBe('upgraded');
  });
  it('lower tier → downgraded', () => {
    expect(classifyPlanChange('ENTERPRISE', 'ESSENTIAL')).toBe('downgraded');
  });
  it('same tier → unchanged', () => {
    expect(classifyPlanChange('PROFESSIONAL', 'PROFESSIONAL')).toBe('unchanged');
  });
});

describe('partnerRoleToTenantRole', () => {
  it('partner_owner maps to tenant_owner', () => {
    expect(partnerRoleToTenantRole('partner_owner')).toBe('tenant_owner');
  });
  it('partner_admin maps to assessor_admin', () => {
    expect(partnerRoleToTenantRole('partner_admin')).toBe('assessor_admin');
  });
});
