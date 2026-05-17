#!/usr/bin/env tsx
// ISM OSCAL importer CLI. Resolves the latest catalogue from cyber.gov.au or
// loads a local OSCAL JSON file passed via `--file`. Pinning to a specific
// release is supported via `--url`.
//
//   npm run ism:import                       # latest release
//   npm run ism:import -- --file ./fixture.json
//   npm run ism:import -- --url https://...   # pinned release

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { importIsmCatalogue } from '@/lib/ism/import';

function arg(name: string): string | undefined {
  const i = process.argv.findIndex((a) => a === `--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function resolveLatestUrl(): Promise<string> {
  const release = 'https://www.cyber.gov.au/ism/oscal/latest/ism-oscal.json';
  return process.env.ISM_OSCAL_URL ?? release;
}

async function load(): Promise<{ data: unknown; sourceUrl: string }> {
  const filePath = arg('file');
  if (filePath) {
    const text = await readFile(filePath, 'utf8');
    return { data: JSON.parse(text), sourceUrl: `file://${filePath}` };
  }
  const url = arg('url') ?? (await resolveLatestUrl());
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch OSCAL catalogue from ${url}: ${res.status}`);
  }
  return { data: await res.json(), sourceUrl: url };
}

async function main() {
  const { data, sourceUrl } = await load();
  // eslint-disable-next-line no-console
  console.log(`[ism] Importing from ${sourceUrl}…`);
  const result = await importIsmCatalogue({
    source: sourceUrl.startsWith('file://') ? 'file' : 'url',
    data,
    sourceUrl,
  });
  // eslint-disable-next-line no-console
  console.log(
    `[ism] Imported ${result.count} control(s) at revision ${result.revision} (sha256 ${result.sourceSha256.slice(0, 12)}).`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
