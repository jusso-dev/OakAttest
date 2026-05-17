import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';

const url = process.env.DATABASE_URL;
if (!url && process.env.NODE_ENV !== 'test') {
  // eslint-disable-next-line no-console
  console.warn('[db] DATABASE_URL not set; queries will fail at runtime.');
}

// One connection for the app role (oakattest_app). Migrations run as a
// separate admin role via drizzle-kit, not from this client.
const queryClient = postgres(url ?? '', {
  max: 10,
  idle_timeout: 30,
  prepare: false,
});

export const db = drizzle(queryClient, { schema });
export type DB = typeof db;
export { schema };
