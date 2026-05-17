import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL;
if (!url) {
  // eslint-disable-next-line no-console
  console.warn('[drizzle] DATABASE_URL not set; drizzle-kit commands will fail.');
}

export default defineConfig({
  schema: './db/schema/index.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: url ?? '' },
  strict: true,
  verbose: true,
});
