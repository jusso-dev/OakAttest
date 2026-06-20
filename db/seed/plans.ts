#!/usr/bin/env tsx
// Seeds the SaaS plan catalogue: plans, features, plan_features, plan_limits.
// Idempotent — safe to re-run. Run with: npm run db:seed:plans
import 'dotenv/config';
import { db } from '@/lib/db/client';
import { plans, features, planFeatures, planLimits } from '@/db/schema/plans';

type LimitSpec = {
  maxUsers: number | null;
  maxFrameworks: number | null;
  maxEntities: number | null;
  maxStorageGb: number | null;
};

const FEATURE_SPECS: Array<{
  code: string;
  name: string;
  description: string;
  category: string;
}> = [
  { code: 'ESSENTIAL_EIGHT', name: 'Essential Eight', description: 'ASD Essential Eight maturity assessments.', category: 'framework' },
  { code: 'ISO27001', name: 'ISO/IEC 27001', description: 'ISO/IEC 27001 Annex A assessments.', category: 'framework' },
  { code: 'NIST', name: 'NIST CSF', description: 'NIST Cybersecurity Framework assessments.', category: 'framework' },
  { code: 'SOC2', name: 'SOC 2', description: 'SOC 2 Trust Services Criteria. Client imports their own licensed control set via CSV (see docs/frameworks).', category: 'framework' },
  { code: 'ISM', name: 'ISM (IRAP readiness)', description: 'Australian ISM controls; supports IRAP-style assessments. IRAP is an assessment performed against the ISM, not a separate framework.', category: 'framework' },
  { code: 'PSPF', name: 'PSPF', description: 'Protective Security Policy Framework assessments.', category: 'framework' },
  { code: 'MULTI_FRAMEWORK', name: 'Multiple frameworks', description: 'Run more than one compliance framework per tenant.', category: 'framework' },
  { code: 'EVIDENCE_REUSE', name: 'Evidence reuse', description: 'Reuse evidence across frameworks and assessments.', category: 'collaboration' },
  { code: 'AUDITOR_ACCESS', name: 'Auditor collaboration', description: 'Invite external auditors to collaborate.', category: 'collaboration' },
  { code: 'API_ACCESS', name: 'API access', description: 'Programmatic API access.', category: 'platform' },
  { code: 'ADVANCED_REPORTING', name: 'Advanced reporting', description: 'Advanced compliance reporting.', category: 'reporting' },
  { code: 'CUSTOM_REPORTS', name: 'Custom reports', description: 'Bespoke report templates.', category: 'reporting' },
  { code: 'SSO', name: 'Single sign-on', description: 'SAML/OIDC single sign-on.', category: 'platform' },
  { code: 'ADVANCED_WORKFLOWS', name: 'Advanced workflows', description: 'Configurable assessment workflows.', category: 'platform' },
  { code: 'INTEGRATIONS', name: 'Integrations', description: 'Third-party integrations.', category: 'platform' },
];

const PROFESSIONAL_FEATURES = [
  'ESSENTIAL_EIGHT',
  'ISO27001',
  'NIST',
  'SOC2',
  'MULTI_FRAMEWORK',
  'EVIDENCE_REUSE',
  'AUDITOR_ACCESS',
  'API_ACCESS',
  'ADVANCED_REPORTING',
];

const PLAN_SPECS: Array<{
  code: string;
  name: string;
  description: string;
  priceMonthly: string;
  sortOrder: number;
  features: string[];
  limits: LimitSpec;
}> = [
  {
    code: 'ESSENTIAL',
    name: 'Essential',
    description: 'Essential Eight for small businesses.',
    priceMonthly: '199.00',
    sortOrder: 1,
    features: ['ESSENTIAL_EIGHT'],
    limits: { maxUsers: 10, maxFrameworks: 1, maxEntities: 1, maxStorageGb: 5 },
  },
  {
    code: 'PROFESSIONAL',
    name: 'Professional',
    description: 'Multi-framework compliance for MSP-managed customers.',
    priceMonthly: '499.00',
    sortOrder: 2,
    features: PROFESSIONAL_FEATURES,
    limits: { maxUsers: 50, maxFrameworks: 3, maxEntities: 3, maxStorageGb: 50 },
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    description: 'Government, enterprise and regulated industries.',
    priceMonthly: '1499.00',
    sortOrder: 3,
    features: [
      ...PROFESSIONAL_FEATURES,
      'ISM',
      'PSPF',
      'SSO',
      'ADVANCED_WORKFLOWS',
      'CUSTOM_REPORTS',
      'INTEGRATIONS',
    ],
    limits: { maxUsers: null, maxFrameworks: null, maxEntities: null, maxStorageGb: null },
  },
];

async function main() {
  // Features
  await db
    .insert(features)
    .values(FEATURE_SPECS)
    .onConflictDoNothing({ target: features.code });

  // Plans
  await db
    .insert(plans)
    .values(
      PLAN_SPECS.map((p) => ({
        code: p.code,
        name: p.name,
        description: p.description,
        priceMonthly: p.priceMonthly,
        sortOrder: p.sortOrder,
      })),
    )
    .onConflictDoNothing({ target: plans.code });

  // Resolve ids
  const featureRows = await db.select({ id: features.id, code: features.code }).from(features);
  const planRows = await db.select({ id: plans.id, code: plans.code }).from(plans);
  const featureId = new Map(featureRows.map((f) => [f.code, f.id]));
  const planId = new Map(planRows.map((p) => [p.code, p.id]));

  // Plan ↔ feature
  for (const p of PLAN_SPECS) {
    const pid = planId.get(p.code);
    if (!pid) continue;
    const rows = p.features
      .map((code) => featureId.get(code))
      .filter((id): id is string => Boolean(id))
      .map((fid) => ({ planId: pid, featureId: fid, enabled: true }));
    if (rows.length > 0) {
      await db
        .insert(planFeatures)
        .values(rows)
        .onConflictDoNothing({
          target: [planFeatures.planId, planFeatures.featureId],
        });
    }
    // Limits
    await db
      .insert(planLimits)
      .values({ planId: pid, ...p.limits })
      .onConflictDoNothing({ target: planLimits.planId });
  }

  // eslint-disable-next-line no-console
  console.log(
    `[seed] Plans: ${PLAN_SPECS.length}, features: ${FEATURE_SPECS.length}. Catalogue seeded.`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
