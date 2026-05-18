import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/lib/db/client';
import { evidenceRequests, evidenceItems } from '@/db/schema/evidence';
import { engagementControls, ismControls } from '@/db/schema/ism';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePageSession } from '@/lib/auth/session';
import { rolesForUser } from '@/lib/rbac/require';
import { EvidenceRequestForm } from '@/components/evidence/EvidenceRequestForm';
import { EvidenceUploader } from '@/components/evidence/EvidenceUploader';
import { EvidenceReviewActions } from '@/components/evidence/EvidenceReviewActions';
import { engagements } from '@/db/schema/engagements';
import { EnterpriseEvidenceGuidance } from '@/components/evidence/EnterpriseEvidenceGuidance';
import { EnterpriseEvidenceCsvPanel } from '@/components/evidence/EnterpriseEvidenceCsvPanel';
import { evidenceStorageState } from '@/lib/evidence/state';

export default async function EvidencePage({
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

  const requests = await db
    .select()
    .from(evidenceRequests)
    .where(eq(evidenceRequests.engagementId, id))
    .orderBy(desc(evidenceRequests.createdAt));

  const items = await db
    .select()
    .from(evidenceItems)
    .where(eq(evidenceItems.engagementId, id))
    .orderBy(desc(evidenceItems.uploadedAt));

  const controls = await db
    .select({
      id: engagementControls.ismControlId,
      controlId: engagementControls.controlId,
      description: ismControls.description,
    })
    .from(engagementControls)
    .innerJoin(ismControls, eq(ismControls.id, engagementControls.ismControlId))
    .where(eq(engagementControls.engagementId, id))
    .orderBy(engagementControls.controlId);

  const myRoles = await rolesForUser({
    userId: session.user.id,
    tenantId: engagement.tenantId,
    engagementId: id,
  });
  const isAssessor = myRoles.includes('lead_assessor') || myRoles.includes('assessor');
  const isClient = myRoles.includes('client_admin') || myRoles.includes('client_contributor');

  return (
    <div className="space-y-6">
      <EnterpriseEvidenceGuidance isAssessor={isAssessor} />

      {isAssessor && <EnterpriseEvidenceCsvPanel engagementId={id} />}

      {isAssessor && (
        <Card>
          <CardHeader>
            <CardTitle>Create evidence request</CardTitle>
            <CardDescription>
              Tell the client what artifact you need and which controls it covers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EvidenceRequestForm
              engagementId={id}
              controls={controls.map((c) => ({
                id: c.id,
                controlId: c.controlId,
                description: c.description,
              }))}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Open requests</CardTitle>
          <CardDescription>{requests.filter((r) => r.status === 'open').length} open.</CardDescription>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-sm text-slate-600">No requests yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {requests.map((r) => (
                <li key={r.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{r.title}</p>
                      {r.description && (
                        <p className="mt-1 text-sm text-slate-600">{r.description}</p>
                      )}
                      <p className="mt-1 text-xs text-slate-600">
                        Status: {r.status}
                        {r.dueAt ? ` · Due ${new Date(r.dueAt).toLocaleDateString('en-AU')}` : ''}
                      </p>
                    </div>
                    {isClient && r.status === 'open' && (
                      <EvidenceUploader
                        engagementId={id}
                        evidenceRequestId={r.id}
                        controls={controls.map((c) => ({
                          id: c.id,
                          controlId: c.controlId,
                        }))}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evidence index</CardTitle>
          <CardDescription>
            Every uploaded artifact with its SHA-256, version, and review status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-slate-600">No evidence yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--field-border)] text-left text-xs uppercase text-slate-600">
                    <th className="py-2 pr-3">Filename</th>
                    <th className="py-2 pr-3">v</th>
                    <th className="py-2 pr-3">SHA-256</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const storageState = evidenceStorageState(it);
                    return (
                      <tr key={it.id} className="border-b border-[var(--field-border)]">
                        <td className="py-2 pr-3 text-slate-900">{it.filename}</td>
                        <td className="py-2 pr-3 text-slate-600">v{it.version}</td>
                        <td className="py-2 pr-3 font-mono text-xs text-slate-600">
                          {it.sha256.slice(0, 16)}…
                        </td>
                        <td className="py-2 pr-3">
                          <span className="rounded-full bg-[var(--oak-mist-strong)] px-2 py-0.5 text-xs text-slate-700">
                            {storageState === 'finalised' ? it.reviewStatus : storageState}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {isAssessor && storageState === 'finalised' && it.reviewStatus === 'pending' && (
                            <EvidenceReviewActions
                              engagementId={id}
                              evidenceItemId={it.id}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-slate-600">
        See <Link href={`/engagements/${id}/evidence/cve`} className="underline">CVE scan as evidence</Link>{' '}
        for supply-chain snapshots.
      </p>
    </div>
  );
}
