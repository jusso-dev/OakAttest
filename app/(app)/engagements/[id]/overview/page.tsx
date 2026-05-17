import { and, eq, count, desc } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { engagements, clientOrganisations, systems } from '@/db/schema/engagements';
import { engagementControls } from '@/db/schema/ism';
import { engagementMembers } from '@/db/schema/tenants';
import { users } from '@/db/schema/auth';
import { sspExports } from '@/db/schema/ssp';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSession } from '@/lib/auth/session';
import { InviteMemberForm } from '@/components/engagement/InviteMemberForm';
import { SspExportPanel } from '@/components/engagement/SspExportPanel';

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = (await getSession())!;

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

  const members = await db
    .select({
      userId: engagementMembers.userId,
      role: engagementMembers.role,
      name: users.name,
      email: users.email,
    })
    .from(engagementMembers)
    .innerJoin(users, eq(users.id, engagementMembers.userId))
    .where(eq(engagementMembers.engagementId, id));

  const sspList = await db
    .select()
    .from(sspExports)
    .where(eq(sspExports.engagementId, id))
    .orderBy(desc(sspExports.version))
    .limit(5);

  const myRole = members.find((m) => m.userId === session.user.id)?.role;
  const canInvite =
    myRole === 'lead_assessor' || myRole === 'client_admin' || !myRole;

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
          <Row label="Boundary">{engagement.boundaryLockedAt ? 'Locked' : 'Draft'}</Row>
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
          <CardTitle>Members</CardTitle>
          <CardDescription>{members.length} members on this engagement.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="divide-y divide-slate-100 text-sm">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between py-2">
                <span>
                  <span className="font-medium text-slate-900">
                    {m.name ?? m.email}
                  </span>{' '}
                  <span className="text-slate-500">— {m.email}</span>
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                  {m.role}
                </span>
              </li>
            ))}
          </ul>
          {canInvite && <InviteMemberForm engagementId={id} />}
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>System Security Plan</CardTitle>
          <CardDescription>
            Generate a versioned SSP from the boundary, applicability worksheet,
            implementation statements, and residual risks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SspExportPanel
            engagementId={id}
            exports={sspList.map((e) => ({
              id: e.id,
              version: e.version,
              sha256: e.sha256,
              format: e.format,
              generatedAt: e.generatedAt.toISOString(),
            }))}
          />
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
