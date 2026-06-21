#!/usr/bin/env tsx
// Framework OSCAL importer CLI. Resolves the latest catalogue for a framework
// or loads a local OSCAL JSON file passed via `--file`. Pinning to a specific
// release is supported via `--url`. Defaults to the ISM framework.
//
//   npm run framework:import                              # latest ISM release
//   npm run framework:import -- --key ism --file f.json
//   npm run framework:import -- --key ism --url https://...

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { importFrameworkCatalogue } from '@/lib/frameworks/import';
import { fetchIsmCatalog, latestIsmCatalogUrl } from '@/lib/frameworks/sources';

function arg(name: string): string | undefined {
  const i = process.argv.findIndex((a) => a === `--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function resolveLatestUrl(): Promise<string> {
  return latestIsmCatalogUrl();
}

async function load(): Promise<{ data: unknown; sourceUrl: string }> {
  const filePath = arg('file');
  if (filePath) {
    const text = await readFile(filePath, 'utf8');
    return { data: JSON.parse(text), sourceUrl: `file://${filePath}` };
  }
  const url = arg('url') ?? (await resolveLatestUrl());
  return { data: await fetchIsmCatalog(url), sourceUrl: url };
}

async function main() {
  const frameworkKey = arg('key') ?? 'ism';
  const { data, sourceUrl } = await load();
  // eslint-disable-next-line no-console
  console.log(`[framework:${frameworkKey}] Importing from ${sourceUrl}…`);
  const result = await importFrameworkCatalogue({
    source: sourceUrl.startsWith('file://') ? 'file' : 'url',
    data,
    sourceUrl,
    frameworkKey,
  });
  // eslint-disable-next-line no-console
  console.log(
    `[framework:${frameworkKey}] Imported ${result.count} control(s) at revision ${result.revision} (sha256 ${result.sourceSha256.slice(0, 12)}).`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
