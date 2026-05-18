import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/lib/db/client';
import { interviews } from '@/db/schema/interviews';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InterviewForm } from '@/components/fieldwork/InterviewForm';
import { InterviewRow } from '@/components/fieldwork/InterviewRow';
import { VulnScanUpload } from '@/components/fieldwork/VulnScanUpload';
import { requirePageSession } from '@/lib/auth/session';
import { rolesForUser } from '@/lib/rbac/require';
import { engagements } from '@/db/schema/engagements';

export default async function FieldworkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePageSession();

  const [engagement] = await db
    .select({ tenantId: engagements.tenantId })
    .from(engagements)
    .where(eq(engagements.id, id))
    .limit(1);
  if (!engagement) throw new Error('Engagement not found');

  const all = await db
    .select()
    .from(interviews)
    .where(eq(interviews.engagementId, id))
    .orderBy(desc(interviews.scheduledAt));

  const roles = await rolesForUser({
    userId: session.user.id,
    tenantId: engagement.tenantId,
    engagementId: id,
  });
  const isAssessor = roles.includes('lead_assessor') || roles.includes('assessor');

  return (
    <div className="space-y-6">
      {isAssessor && (
        <Card>
          <CardHeader>
            <CardTitle>Schedule interview</CardTitle>
            <CardDescription>
              Capture purpose, attendees, and the controls under discussion. Export to .ics
              and add to your calendar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InterviewForm engagementId={id} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Interviews and walkthroughs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {all.length === 0 ? (
            <p className="text-sm text-slate-600">No interviews scheduled.</p>
          ) : (
            all.map((i) => (
              <InterviewRow key={i.id} engagementId={id} interview={i} canEdit={isAssessor} />
            ))
          )}
        </CardContent>
      </Card>

      {isAssessor && (
        <Card>
          <CardHeader>
            <CardTitle>Import vulnerability scan</CardTitle>
            <CardDescription>
              Drafts an observation per critical or high severity entry and links it to any
              patching controls in scope. Promote to non-conformance from the findings register
              once you have reviewed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VulnScanUpload engagementId={id} />
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-slate-600">
        See{' '}
        <Link href={`/engagements/${id}/evidence/cve`} className="underline">
          CVE scan
        </Link>{' '}
        for supply-chain (dependency) snapshots.
      </p>
    </div>
  );
}
