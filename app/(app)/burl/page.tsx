import { redirect } from 'next/navigation';
import { BurlAssistant } from '@/components/burl/BurlAssistant';
import { BurlAvatar } from '@/components/burl/BurlAvatar';
import { getSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { listBurlEngagements } from '@/lib/burl/context';

export const metadata = { title: 'Burl - OakAttest' };

export default async function BurlPage() {
  const session = await getSession();
  if (!session) redirect('/signin');

  const activeTenant = await resolveActiveTenant(session.user.id);
  if (!activeTenant) redirect('/onboarding');

  const engagements = await listBurlEngagements({
    userId: session.user.id,
    tenantId: activeTenant.tenantId,
    tenantAccess: activeTenant.access,
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-4 border-b border-[var(--field-border)] pb-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <BurlAvatar className="h-16 w-16" priority variant="mascot" />
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-slate-950">Burl</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-700">
              Ask ISM questions, review evidence, and draft assessor-controlled suggestions.
            </p>
          </div>
        </div>
        <div className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 py-2 text-xs text-slate-700">
          <span className="font-medium text-slate-950">Assessor review required</span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <BurlAssistant mode="page" engagements={engagements} />
        <aside className="space-y-3 text-sm">
          <section className="rounded-lg border border-[var(--field-border)] bg-[var(--panel-surface)] p-4">
            <h2 className="text-sm font-semibold text-slate-950">Review boundary</h2>
            <ul className="mt-3 list-disc space-y-2 pl-4 text-slate-700">
              <li>Mappings are suggestions until an assessor confirms them.</li>
              <li>PDF text is sent only with the current Burl request.</li>
              <li>Responses are recorded in the tenant audit log.</li>
            </ul>
          </section>
          <section className="rounded-lg border border-[var(--field-border)] bg-[var(--panel-surface)] p-4">
            <h2 className="text-sm font-semibold text-slate-950">Good prompts</h2>
            <ul className="mt-3 list-disc space-y-2 pl-4 text-slate-700">
              <li>Map this PDF to likely ISM controls with confidence.</li>
              <li>What evidence is weak or missing for this control?</li>
              <li>Draft a client evidence request for admin MFA.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
