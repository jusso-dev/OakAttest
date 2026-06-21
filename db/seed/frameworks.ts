#!/usr/bin/env tsx
// Seed the framework registry with every compliance framework OakAttest
// supports. ISM is also seeded by migration 0012; this upserts it plus the
// others so they appear in the Frameworks admin and the engagement selector.
//
// Catalogue availability differs (see docs/frameworks/multi-framework-plan.md):
//   - ism, nist-800-53: official OSCAL catalogue → import by URL/release.
//   - fedramp: NIST baseline + FedRAMP profile → needs the profile resolver
//     (Phase 3); registered so it is visible.
//   - soc2, iso-27001: copyrighted → client imports their licensed CSV (Phase 4).
import 'dotenv/config';
import { db } from '@/lib/db/client';
import { frameworks } from '@/db/schema/frameworks';

const ROWS = [
  {
    key: 'ism',
    label: 'Australian Government ISM',
    scopingMode: 'classification',
    sourceKind: 'oscal_github_tags',
    sourceConfig: { repo: 'AustralianCyberSecurityCentre/ism-oscal' },
    overlays: ['essential-eight'],
    classificationScheme: {
      OFFICIAL: 1,
      OFFICIAL_SENSITIVE: 2,
      PROTECTED: 3,
      SECRET: 4,
      TOP_SECRET: 5,
    } as Record<string, number>,
  },
  {
    key: 'nist-800-53',
    label: 'NIST SP 800-53 Rev 5',
    scopingMode: 'baseline_profile',
    sourceKind: 'oscal_url',
    sourceConfig: {
      url: 'https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json',
    },
    overlays: [],
    classificationScheme: null,
  },
  {
    key: 'fedramp',
    label: 'FedRAMP (NIST 800-53 baselines)',
    scopingMode: 'baseline_profile',
    sourceKind: 'oscal_url',
    sourceConfig: {
      note: 'FedRAMP baselines are OSCAL profiles over NIST 800-53; profile resolver pending (Phase 3).',
    },
    overlays: [],
    classificationScheme: null,
  },
  {
    key: 'soc2',
    label: 'SOC 2 (Trust Services Criteria)',
    scopingMode: 'selection',
    sourceKind: 'csv_client_import',
    sourceConfig: { note: 'Client uploads their licensed AICPA TSC control set via CSV (Phase 4).' },
    overlays: [],
    classificationScheme: null,
  },
  {
    key: 'iso-27001',
    label: 'ISO/IEC 27001 (Annex A)',
    scopingMode: 'selection',
    sourceKind: 'csv_client_import',
    sourceConfig: { note: 'Client uploads their licensed Annex A control set via CSV (Phase 4).' },
    overlays: [],
    classificationScheme: null,
  },
] as const;

async function main() {
  for (const row of ROWS) {
    await db
      .insert(frameworks)
      .values({
        key: row.key,
        label: row.label,
        scopingMode: row.scopingMode,
        sourceKind: row.sourceKind,
        sourceConfig: row.sourceConfig as Record<string, unknown>,
        overlays: [...row.overlays],
        classificationScheme: row.classificationScheme,
      })
      .onConflictDoUpdate({
        target: frameworks.key,
        set: {
          label: row.label,
          scopingMode: row.scopingMode,
          sourceKind: row.sourceKind,
          sourceConfig: row.sourceConfig as Record<string, unknown>,
          overlays: [...row.overlays],
          classificationScheme: row.classificationScheme,
        },
      });
  }
  // eslint-disable-next-line no-console
  console.log(`[seed] Framework registry: ${ROWS.length} frameworks upserted.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
