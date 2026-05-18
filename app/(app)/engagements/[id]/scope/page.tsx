import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { systemBoundaries } from '@/db/schema/boundaries';
import { engagementControls, ismControls } from '@/db/schema/ism';
import { engagements } from '@/db/schema/engagements';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BoundaryEditor } from '@/components/engagement/BoundaryEditor';
import { ApplicabilityWorksheet } from '@/components/engagement/ApplicabilityWorksheet';
import { requirePageSession } from '@/lib/auth/session';
import { rolesForUser } from '@/lib/rbac/require';

export default async function ScopePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePageSession();

  const [engagement] = await db
    .select()
    .from(engagements)
    .where(eq(engagements.id, id))
    .limit(1);

  const [boundary] = await db
    .select()
    .from(systemBoundaries)
    .where(
      and(eq(systemBoundaries.engagementId, id), isNull(systemBoundaries.supersededAt)),
    )
    .orderBy(desc(systemBoundaries.version))
    .limit(1);

  const controlRows = await db
    .select({
      id: engagementControls.id,
      controlId: engagementControls.controlId,
      description: ismControls.description,
      chapter: ismControls.topic,
      subChapter: ismControls.section,
      minClassification: ismControls.minClassification,
      status: engagementControls.status,
      applicable: engagementControls.applicable,
      justification: engagementControls.applicabilityJustification,
      implementationStatement: engagementControls.implementationStatement,
      assessmentMethods: engagementControls.assessmentMethods,
      assessmentObjects: engagementControls.assessmentObjects,
      evidenceQuality: engagementControls.evidenceQuality,
      evidenceLimitations: engagementControls.evidenceLimitations,
    })
    .from(engagementControls)
    .innerJoin(ismControls, eq(ismControls.id, engagementControls.ismControlId))
    .where(eq(engagementControls.engagementId, id))
    .orderBy(engagementControls.controlId);

  const roles = await rolesForUser({
    userId: session.user.id,
    tenantId: engagement.tenantId,
    engagementId: id,
  });
  const isAssessor = roles.some((r) => r === 'lead_assessor' || r === 'assessor');
  const isClient = roles.some((r) => r === 'client_admin' || r === 'client_contributor');
  const isTenantAdmin = roles.some((r) => r === 'tenant_owner' || r === 'assessor_admin');
  const canLock = roles.includes('lead_assessor') || isTenantAdmin;

  const initialNodes = (boundary?.graph?.nodes ?? []).map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data as never,
  }));
  const initialEdges = (boundary?.graph?.edges ?? []).map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    type: e.type,
    label: e.label,
  })) as never;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>System boundary</CardTitle>
          <CardDescription>
            Drag components onto the canvas and connect them to define the system under
            assessment. The lead assessor locks the boundary once it is agreed; subsequent
            changes need a change request.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BoundaryEditor
            engagementId={id}
            initialNodes={initialNodes}
            initialEdges={initialEdges}
            locked={Boolean(boundary?.locked || engagement.boundaryLockedAt)}
            canLock={canLock}
            canEdit={isClient || isAssessor || isTenantAdmin}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Applicability worksheet</CardTitle>
          <CardDescription>
            {controlRows.length} controls auto-selected by the cumulative classification rule.
            The lead assessor records applicability and justification; the client authors the
            implementation statement that lands in the SSP.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApplicabilityWorksheet
            engagementId={id}
            controls={controlRows}
            canDecide={isAssessor}
            canWriteStatement={isClient}
          />
        </CardContent>
      </Card>
    </div>
  );
}
