'use client';

import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  configureTrustPortal,
  denyTrustPortalAccess,
  disableTrustPortal,
  grantTrustPortalAccess,
  publishTrustPortal,
  revokeTrustPortalAccess,
} from '@/app/actions/trust-portal';
import { UserDateTime } from '@/components/timezone/UserTimezone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Portal = {
  id: string;
  slug: string;
  status: string;
  title: string;
  organisationName: string;
  overview: string;
  commitments: string[];
  securityContactEmail: string;
  currentPublicationId: string | null;
  createdAt: string;
  updatedAt: string;
};

type Report = {
  id: string;
  version: number;
  signedAt: string | null;
  validUntil: string | null;
};

type Publication = {
  id: string;
  version: number;
  snapshotSha256: string;
  certificationReportId: string;
  publishedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
};

type AccessRequest = {
  id: string;
  requesterEmail: string;
  requesterOrganisation: string;
  purpose: string;
  status: string;
  decisionNotes: string | null;
  requestedAt: string;
  decidedAt: string | null;
};

type AccessGrant = {
  id: string;
  requestId: string;
  requesterEmail: string;
  expiresAt: string;
  maxDownloads: number;
  downloadCount: number;
  createdAt: string;
  revokedAt: string | null;
};

export function TrustPortalManager({
  engagementId,
  engagementName,
  timeZone,
  defaultExpiry,
  canManage,
  portal,
  reports,
  publications,
  requests,
  grants,
}: {
  engagementId: string;
  engagementName: string;
  timeZone: string;
  defaultExpiry: string;
  canManage: boolean;
  portal: Portal | null;
  reports: Report[];
  publications: Publication[];
  requests: AccessRequest[];
  grants: AccessGrant[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const publicUrl = portal?.status === 'published' ? `/trust/${portal.slug}` : null;

  function run(task: () => Promise<unknown>, success: string) {
    setMessage(null);
    startTransition(async () => {
      try {
        await task();
        setMessage(success);
        router.refresh();
      } catch (cause) {
        setMessage((cause as Error).message);
      }
    });
  }

  function configure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(
      () => configureTrustPortal({
        engagementId,
        slug: String(form.get('slug') ?? ''),
        title: String(form.get('title') ?? ''),
        organisationName: String(form.get('organisationName') ?? ''),
        overview: String(form.get('overview') ?? ''),
        commitments: String(form.get('commitments') ?? '').split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
        securityContactEmail: String(form.get('securityContactEmail') ?? ''),
      }),
      portal ? 'Trust Portal configuration updated.' : 'Trust Portal configured as a draft.',
    );
  }

  function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get('approvedForPublicRelease') !== 'on') {
      setMessage('Confirm the PUBLIC release statement before publishing.');
      return;
    }
    run(
      () => publishTrustPortal({
        engagementId,
        reportId: String(form.get('reportId') ?? ''),
        publicSystemName: String(form.get('publicSystemName') ?? ''),
        expiresOn: String(form.get('expiresOn') ?? ''),
        releaseClassification: 'PUBLIC',
        approvedForPublicRelease: true,
      }),
      'A new immutable PUBLIC snapshot is live.',
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--oak-shield)]">External assurance</p>
        <h2 className="text-2xl font-semibold text-slate-950">Trust Portal</h2>
        <p className="max-w-4xl text-sm leading-6 text-slate-700">
          Publish a deliberately small PUBLIC projection of a signed assessment artefact. Evidence,
          findings, system internals, and bundles remain private; approved reviewers receive limited PDF links.
        </p>
        <p className="text-sm text-slate-600">
          Dates you enter and review use <strong>{timeZone}</strong>. Public verification dates are explicitly UTC.
        </p>
        {!canManage ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            You can review publication state. Only a client administrator can approve public release or access.
          </p>
        ) : null}
        {message ? <p className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800" role="status">{message}</p> : null}
      </header>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Portal configuration</CardTitle>
              <CardDescription>Public wording is kept separate from the private engagement record.</CardDescription>
            </div>
            {publicUrl ? (
              <a className="text-sm font-medium text-[var(--oak-shield)] underline" href={publicUrl} target="_blank" rel="noreferrer">
                Open public portal ↗
              </a>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={configure}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Public address">
                <div className="flex items-center rounded-md border border-slate-300 bg-slate-50 pl-3 text-sm text-slate-600 focus-within:ring-2 focus-within:ring-[var(--oak-shield)]">
                  <span>/trust/</span>
                  <Input className="border-0 bg-transparent shadow-none focus-visible:ring-0" name="slug" required minLength={3} defaultValue={portal?.slug ?? engagementName} disabled={!canManage || pending} />
                </div>
              </Field>
              <Field label="Security contact email">
                <Input name="securityContactEmail" type="email" required defaultValue={portal?.securityContactEmail ?? ''} disabled={!canManage || pending} />
              </Field>
              <Field label="Portal title">
                <Input name="title" required minLength={3} defaultValue={portal?.title ?? `${engagementName} security assurance`} disabled={!canManage || pending} />
              </Field>
              <Field label="Public organisation name">
                <Input name="organisationName" required minLength={2} defaultValue={portal?.organisationName ?? ''} disabled={!canManage || pending} />
              </Field>
            </div>
            <Field label="Public overview">
              <textarea className={textareaClass} name="overview" required minLength={20} defaultValue={portal?.overview ?? ''} disabled={!canManage || pending} rows={5} />
            </Field>
            <Field label="Published commitments — one per line, maximum 12">
              <textarea className={textareaClass} name="commitments" defaultValue={portal?.commitments.join('\n') ?? ''} disabled={!canManage || pending} rows={5} />
            </Field>
            {canManage ? <Button className="w-fit" variant="primary" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save draft configuration'}</Button> : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Publish signed assurance</CardTitle>
          <CardDescription>Each release creates an immutable snapshot and supersedes the previous public version.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {reports.length === 0 ? (
            <p className="text-sm text-slate-600">No current signed report is available. Sign a certification report first.</p>
          ) : portal ? (
            <form className="grid gap-4" onSubmit={publish}>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Signed report">
                  <select className={selectClass} name="reportId" required disabled={!canManage || pending} defaultValue={reports[0]?.id}>
                    {reports.map((report) => (
                      <option value={report.id} key={report.id}>Version {report.version}{report.validUntil ? ` · valid until ${report.validUntil.slice(0, 10)}` : ''}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Public system name">
                  <Input name="publicSystemName" required minLength={2} defaultValue={engagementName} disabled={!canManage || pending} />
                </Field>
                <Field label={`Publication expires (${timeZone})`}>
                  <Input name="expiresOn" type="date" required defaultValue={defaultExpiry} disabled={!canManage || pending} />
                </Field>
              </div>
              <label className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <input className="mt-1 size-4" name="approvedForPublicRelease" type="checkbox" required disabled={!canManage || pending} />
                <span>I confirm this snapshot contains <strong>PUBLIC information only</strong> and is approved for internet publication. It contains no OFFICIAL: Sensitive or higher-classified data.</span>
              </label>
              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" type="submit" disabled={pending}>Publish immutable snapshot</Button>
                  {portal.status === 'published' ? (
                    <Button type="button" variant="destructive" disabled={pending} onClick={() => {
                      const reason = window.prompt('Reason for disabling this public portal (minimum 10 characters)');
                      if (reason) run(() => disableTrustPortal({ engagementId, reason }), 'Trust Portal disabled and current publication revoked.');
                    }}>Disable portal</Button>
                  ) : null}
                </div>
              ) : null}
            </form>
          ) : (
            <p className="text-sm text-slate-600">Save the portal configuration before publishing.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Publication ledger</CardTitle>
          <CardDescription>{publications.length} immutable version(s).</CardDescription>
        </CardHeader>
        <CardContent>
          {publications.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600">
                  <tr><th className="py-2 pr-4">Version</th><th className="py-2 pr-4">Published</th><th className="py-2 pr-4">Expires</th><th className="py-2 pr-4">State</th><th className="py-2">Snapshot hash</th></tr>
                </thead>
                <tbody>{publications.map((publication) => (
                  <tr className="border-b border-slate-100 align-top" key={publication.id}>
                    <td className="py-3 pr-4 font-mono">v{publication.version}</td>
                    <td className="py-3 pr-4"><UserDateTime value={publication.publishedAt} /></td>
                    <td className="py-3 pr-4"><UserDateTime value={publication.expiresAt} /></td>
                    <td className="py-3 pr-4">{publication.revokedAt ? 'Revoked' : portal?.currentPublicationId === publication.id ? 'Current' : 'Superseded'}</td>
                    <td className="py-3 font-mono text-xs">{publication.snapshotSha256.slice(0, 24)}…</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="text-sm text-slate-600">Nothing has been published.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Controlled PDF requests</CardTitle>
          <CardDescription>Client administrators approve, constrain, deny, and revoke reviewer access.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {requests.length ? requests.map((request) => {
            const grant = grants.find((candidate) => candidate.requestId === request.id);
            return (
              <article className="rounded-md border border-slate-200 bg-white p-4 text-sm" key={request.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{request.requesterOrganisation}</p>
                    <p className="text-slate-600">{request.requesterEmail} · requested <UserDateTime value={request.requestedAt} /></p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium uppercase tracking-wide text-slate-700">{request.status}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-slate-800">{request.purpose}</p>
                {request.status === 'pending' && canManage ? (
                  <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 lg:grid-cols-[8rem_8rem_minmax(14rem,1fr)_auto_auto]">
                    <Input aria-label="Access days" name={`days-${request.id}`} type="number" min={1} max={30} defaultValue={7} disabled={pending} />
                    <Input aria-label="Maximum downloads" name={`downloads-${request.id}`} type="number" min={1} max={20} defaultValue={3} disabled={pending} />
                    <Input aria-label="Decision notes" name={`notes-${request.id}`} placeholder="Decision notes (optional)" disabled={pending} />
                    <Button variant="primary" disabled={pending} onClick={() => {
                      const days = document.querySelector<HTMLInputElement>(`[name="days-${request.id}"]`)?.value ?? '7';
                      const downloads = document.querySelector<HTMLInputElement>(`[name="downloads-${request.id}"]`)?.value ?? '3';
                      const notes = document.querySelector<HTMLInputElement>(`[name="notes-${request.id}"]`)?.value ?? '';
                      run(() => grantTrustPortalAccess({ engagementId, requestId: request.id, expiresInDays: days, maxDownloads: downloads, decisionNotes: notes }), 'Controlled access granted and emailed.');
                    }}>Approve</Button>
                    <Button variant="outline" disabled={pending} onClick={() => {
                      const notes = document.querySelector<HTMLInputElement>(`[name="notes-${request.id}"]`)?.value ?? '';
                      run(() => denyTrustPortalAccess({ engagementId, requestId: request.id, decisionNotes: notes }), 'Access request denied.');
                    }}>Deny</Button>
                  </div>
                ) : null}
                {grant ? (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 text-xs text-slate-600">
                    <span>{grant.downloadCount}/{grant.maxDownloads} downloads · expires <UserDateTime value={grant.expiresAt} />{grant.revokedAt ? ' · revoked' : ''}</span>
                    {canManage && !grant.revokedAt ? <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => revokeTrustPortalAccess({ engagementId, grantId: grant.id }), 'Controlled access revoked.')}>Revoke link</Button> : null}
                  </div>
                ) : null}
              </article>
            );
          }) : <p className="text-sm text-slate-600">No controlled-access requests.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <Label className="grid gap-1.5"><span>{label}</span>{children}</Label>;
}

const textareaClass = 'min-h-24 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)] disabled:cursor-not-allowed disabled:opacity-50';
const selectClass = 'h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)] disabled:cursor-not-allowed disabled:opacity-50';
