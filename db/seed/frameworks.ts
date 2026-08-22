#!/usr/bin/env tsx
// Seed the framework registry with every compliance framework OakAttest
// supports. ISM is also seeded by migration 0012; this upserts it plus the
// others so they appear in the Frameworks admin and the engagement selector.
//
// Catalogue availability differs (see docs/frameworks/multi-framework-plan.md):
//   - ism, nist-800-53: official OSCAL catalogue → import by URL/release.
//   - fedramp: NIST baseline + uploaded FedRAMP OSCAL profile.
//   - soc2, iso-27001: copyrighted → client imports their licensed CSV.
import 'dotenv/config';
import { isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { frameworks } from '@/db/schema/frameworks';

const ROWS = [
  {
    key: 'ism',
    label: 'Australian Government ISM',
    description: 'Australian Government Information Security Manual controls.',
    authority: 'Australian Signals Directorate',
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
    description: 'NIST security and privacy control catalogue with selectable OSCAL profiles.',
    authority: 'National Institute of Standards and Technology',
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
    description: 'FedRAMP baselines resolved from official OSCAL profiles over NIST SP 800-53.',
    authority: 'FedRAMP',
    scopingMode: 'baseline_profile',
    sourceKind: 'oscal_url',
    sourceConfig: {
      note: 'Upload an official FedRAMP OSCAL profile and resolve it against an imported NIST 800-53 revision.',
    },
    overlays: [],
    classificationScheme: null,
  },
  {
    key: 'soc2',
    label: 'SOC 2 (Trust Services Criteria)',
    description: 'Tenant-supplied licensed Trust Services Criteria control set.',
    authority: 'AICPA',
    scopingMode: 'selection',
    sourceKind: 'csv_client_import',
    sourceConfig: { note: 'Client uploads their licensed AICPA TSC control set via CSV.' },
    overlays: [],
    classificationScheme: null,
  },
  {
    key: 'iso-27001',
    label: 'ISO/IEC 27001 (Annex A)',
    description: 'Tenant-supplied licensed ISO/IEC 27001 Annex A control set.',
    authority: 'ISO/IEC',
    scopingMode: 'selection',
    sourceKind: 'csv_client_import',
    sourceConfig: { note: 'Client uploads their licensed Annex A control set via CSV.' },
    overlays: [],
    classificationScheme: null,
  },
  {
    key: 'pspf',
    label: 'Protective Security Policy Framework',
    description: 'Australian Government protective security policy assessment pack.',
    authority: 'Australian Government',
    scopingMode: 'selection',
    sourceKind: 'csv_client_import',
    sourceConfig: { template: '/templates/pspf-controls-template.csv' },
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
        description: row.description,
        authority: row.authority,
        scopingMode: row.scopingMode,
        sourceKind: row.sourceKind,
        sourceConfig: row.sourceConfig as Record<string, unknown>,
        overlays: [...row.overlays],
        classificationScheme: row.classificationScheme,
      })
      .onConflictDoUpdate({
        target: frameworks.key,
        targetWhere: isNull(frameworks.tenantId),
        set: {
          label: row.label,
          description: row.description,
          authority: row.authority,
          scopingMode: row.scopingMode,
          sourceKind: row.sourceKind,
          sourceConfig: row.sourceConfig as Record<string, unknown>,
          overlays: [...row.overlays],
          classificationScheme: row.classificationScheme,
        },
      });
  }
  console.log(`[seed] Framework registry: ${ROWS.length} frameworks upserted.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
