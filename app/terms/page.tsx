import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { users } from '@/db/schema/auth';
import { getSession } from '@/lib/auth/session';
import { TermsForm } from './TermsForm';
import { BrandLogo } from '@/components/BrandLogo';

export const metadata = { title: 'Data handling terms · OakAttest' };

export default async function TermsPage() {
  const session = await getSession();
  if (!session) redirect('/signin');

  const [u] = await db
    .select({ accepted: users.dataHandlingAcceptedAt })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (u?.accepted) redirect('/dashboard');

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-6 py-16 text-slate-950">
      <BrandLogo imageClassName="h-10" priority />
      <h1 className="mt-1 text-2xl font-semibold text-slate-900">Data handling and chain of custody</h1>
      <div className="mt-6 max-w-none space-y-4 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-5 text-sm leading-6 text-slate-800">
        <p>
          Before you can access engagements you need to acknowledge how the platform handles
          IRAP assessment material in this deployment.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            OakAttest is open-source software that your organisation or provider hosts. Data
            residency depends on your deployment, database, object storage, backups, and log
            retention settings.
          </li>
          <li>
            Evidence is encrypted at rest with KMS-managed keys and in transit over TLS 1.3.
            Files are immutable once uploaded; replacement creates a new version chained via
            <code>supersedes_id</code>.
          </li>
          <li>
            Every state-changing action is recorded in an append-only audit log. The
            application cannot update or delete audit rows — that is enforced at the database
            role layer.
          </li>
          <li>
            Sessions for assessor users are 8 hours rolling with a 12-hour absolute cap; client
            sessions are 4 hours. Multi-factor authentication follows the assessor firm
            workspace policy and may be required for assessor-side or all users.
          </li>
          <li>
            You must not upload material you are not authorised to share. The assessor firm
            and your organisation remain responsible for chain-of-custody decisions made on
            this platform.
          </li>
        </ul>
      </div>
      <div className="mt-6">
        <TermsForm />
      </div>
    </main>
  );
}
