#!/usr/bin/env tsx
// Loads the bundled OSCAL sample into the local database. For real
// catalogue ingestion use `npm run ism:import`.
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { importIsmCatalogue } from '@/lib/ism/import';

async function main() {
  const path = resolve(process.cwd(), 'db/seed/ism-sample.json');
  const text = await readFile(path, 'utf8');
  const data = JSON.parse(text);
  const result = await importIsmCatalogue({
    source: 'file',
    data,
    sourceUrl: `file://${path}`,
  });
  // eslint-disable-next-line no-console
  console.log(
    `[seed] Imported ${result.count} sample control(s) at revision ${result.revision}.`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
