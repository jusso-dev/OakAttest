import Link from 'next/link';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { findings, findingControls, remediationActions } from '@/db/schema/findings';
import { engagementControls, ismControls } from '@/db/schema/ism';
import { engagementMembers } from '@/db/schema/tenants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FindingCreateForm } from '@/components/findings/FindingCreateForm';
import { FindingRow } from '@/components/findings/FindingRow';
import { getSession } from '@/lib/auth/session';

export default async function FindingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const session = (await getSession())!;
  const q = readParam(query.q).trim();
  const status = readParam(query.status);
  const severity = readParam(query.severity);
  const type = readParam(query.type);
  const chapter = readParam(query.chapter);
  const subChapter = readParam(query.subChapter);

  const list = await db
    .select()
    .from(findings)
    .where(eq(findings.engagementId, id))
    .orderBy(desc(findings.reportedAt));

  const remediations = await db
    .select()
    .from(remediationActions)
    .where(eq(remediationActions.engagementId, id))
    .orderBy(desc(remediationActions.createdAt));

  const controls = await db
    .select({
      id: engagementControls.ismControlId,
      controlId: engagementControls.controlId,
      chapter: ismControls.topic,
      subChapter: ismControls.section,
      description: ismControls.description,
    })
    .from(engagementControls)
    .innerJoin(ismControls, eq(ismControls.id, engagementControls.ismControlId))
    .where(eq(engagementControls.engagementId, id))
    .orderBy(engagementControls.controlId);

  const findingLinks =
    list.length === 0
      ? []
      : await db
          .select({
            findingId: findingControls.findingId,
            controlId: ismControls.controlId,
            chapter: ismControls.topic,
            subChapter: ismControls.section,
            description: ismControls.description,
          })
          .from(findingControls)
          .innerJoin(ismControls, eq(ismControls.id, findingControls.ismControlId))
          .where(inArray(findingControls.findingId, list.map((finding) => finding.id)))
          .orderBy(ismControls.controlId);

  const myRoleRows = await db
    .select({ role: engagementMembers.role })
    .from(engagementMembers)
    .where(
      and(
        eq(engagementMembers.engagementId, id),
        eq(engagementMembers.userId, session.user.id),
        isNull(engagementMembers.deletedAt),
      ),
    );
  const roles = myRoleRows.map((r) => r.role);
  const isAssessor = roles.includes('lead_assessor') || roles.includes('assessor');
  const isLead = roles.includes('lead_assessor');
  const isClient = roles.includes('client_admin') || roles.includes('client_contributor');
  const linksByFinding = new Map<string, typeof findingLinks>();
  for (const link of findingLinks) {
    const existing = linksByFinding.get(link.findingId) ?? [];
    existing.push(link);
    linksByFinding.set(link.findingId, existing);
  }
  const chapters = Array.from(new Set(controls.map((c) => c.chapter).filter(Boolean) as string[])).sort();
  const subChapters = Array.from(
    new Set(
      controls
        .filter((c) => !chapter || c.chapter === chapter)
        .map((c) => c.subChapter)
        .filter(Boolean) as string[],
    ),
  ).sort();
  const filteredList = list.filter((finding) => {
    const linkedControls = linksByFinding.get(finding.id) ?? [];
    if (status && finding.status !== status) return false;
    if (severity && finding.severity !== severity) return false;
    if (type && finding.type !== type) return false;
    if (chapter && !linkedControls.some((control) => control.chapter === chapter)) return false;
    if (subChapter && !linkedControls.some((control) => control.subChapter === subChapter)) return false;
    if (!q) return true;
    const haystack = [
      finding.code,
      finding.title,
      finding.description,
      finding.recommendation ?? '',
      finding.severity,
      finding.status,
      ...linkedControls.flatMap((control) => [
        control.controlId,
        control.chapter ?? '',
        control.subChapter ?? '',
        control.description,
      ]),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q.toLowerCase());
  });
  const counts = {
    total: list.length,
    nonConformance: list.filter((f) => f.type === 'non_conformance').length,
    observation: list.filter((f) => f.type === 'observation').length,
    open: list.filter((f) => f.status !== 'closed').length,
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Findings register</CardTitle>
              <CardDescription>
                {counts.total} total · {counts.nonConformance} non-conformance ·{' '}
                {counts.observation} observation · {counts.open} open.
              </CardDescription>
            </div>
            <a
              href={`/api/engagements/${id}/findings/csv`}
              className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-4 text-sm font-medium text-slate-900 hover:bg-[var(--oak-mist)]"
            >
              Export CSV
            </a>
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-[1fr_150px_150px_170px_170px_auto]">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search findings or controls"
              className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950"
            />
            <select
              name="type"
              defaultValue={type}
              className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950"
            >
              <option value="">All types</option>
              <option value="non_conformance">Non-conformance</option>
              <option value="observation">Observation</option>
            </select>
            <select
              name="severity"
              defaultValue={severity}
              className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950"
            >
              <option value="">All severity</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              name="status"
              defaultValue={status}
              className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950"
            >
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="awaiting_retest">Awaiting retest</option>
              <option value="closed">Closed</option>
              <option value="accepted_risk">Accepted risk</option>
            </select>
            <select
              name="chapter"
              defaultValue={chapter}
              className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950"
            >
              <option value="">All chapters</option>
              {chapters.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                type="submit"
                className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--oak-shield)] px-4 text-sm font-medium text-white hover:bg-[var(--oak-shield-hover)]"
              >
                Filter
              </button>
              <Link
                href={`/engagements/${id}/findings`}
                className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm font-medium text-slate-950 hover:bg-[var(--oak-mist)]"
              >
                Reset
              </Link>
            </div>
            <select
              name="subChapter"
              defaultValue={subChapter}
              className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950 md:col-start-5"
            >
              <option value="">All sub-chapters</option>
              {subChapters.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </form>
          <p className="mt-3 text-xs text-slate-600">
            Showing {filteredList.length} of {list.length} findings. Filters include linked
            ISM control ID, chapter, sub-chapter, and control description.
          </p>
        </CardContent>
      </Card>

      {isAssessor && (
        <Card>
          <CardHeader>
            <CardTitle>Log a finding</CardTitle>
            <CardDescription>
              Assessor only. Clients respond via remediation actions on the right of each finding.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FindingCreateForm
              engagementId={id}
              controls={controls}
            />
          </CardContent>
        </Card>
      )}

      {filteredList.length === 0 ? (
        <p className="text-sm text-slate-600">No findings recorded yet.</p>
      ) : (
        filteredList.map((f) => (
          <FindingRow
            key={f.id}
            engagementId={id}
            finding={f}
            controls={(linksByFinding.get(f.id) ?? []).map((control) => ({
              controlId: control.controlId,
              chapter: control.chapter,
              subChapter: control.subChapter,
              description: control.description,
            }))}
            remediations={remediations.filter((r) => r.findingId === f.id)}
            canSignOff={isLead}
            canUpdate={isAssessor}
            canRemediate={isClient}
          />
        ))
      )}
    </div>
  );
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}
