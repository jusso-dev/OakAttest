import { and, eq, count } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { engagements, clientOrganisations, systems } from '@/db/schema/engagements';
import { engagementControls } from '@/db/schema/ism';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [engagement] = await db
    .select()
    .from(engagements)
    .where(eq(engagements.id, id))
    .limit(1);

  const [client] = await db
    .select()
    .from(clientOrganisations)
    .where(eq(clientOrganisations.engagementId, id))
    .limit(1);

  const [system] = await db
    .select()
    .from(systems)
    .where(eq(systems.engagementId, id))
    .limit(1);

  const [{ controlCount }] = await db
    .select({ controlCount: count() })
    .from(engagementControls)
    .where(eq(engagementControls.engagementId, id));

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Scope</CardTitle>
          <CardDescription>System under assessment.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="System">{system?.name ?? '—'}</Row>
          <Row label="Environment">{system?.environment ?? '—'}</Row>
          <Row label="Classification">{engagement.classification.replace('_', ':')}</Row>
          <Row label="ISM revision">{engagement.ismRevision}</Row>
          <Row label="Applicable controls">{controlCount}</Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Client organisation</CardTitle>
          <CardDescription>The organisation being assessed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Name">{client?.name ?? '—'}</Row>
          <Row label="ABN">{client?.abn ?? '—'}</Row>
          <Row label="Primary contact">{client?.primaryContactName ?? '—'}</Row>
          <Row label="Email">{client?.primaryContactEmail ?? '—'}</Row>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Phase</CardTitle>
          <CardDescription>Current position in the five-phase IRAP lifecycle.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-700">
            This engagement is in the <strong>{engagement.phase}</strong> phase. Status:{' '}
            <strong>{engagement.status}</strong>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900">{children}</span>
    </div>
  );
}
