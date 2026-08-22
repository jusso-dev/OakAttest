import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { trustPortalPublications, trustPortals } from '@/db/schema/trust-portal';
import { recordTrustPortalVisit } from '@/app/actions/trust-portal';
import { trustPortalSnapshotIsPublic, trustPortalSnapshotMatchesHash } from '@/lib/trust-portal';
import { certificationReports } from '@/db/schema/certification';
import { formatDate, formatDateTime } from '@/lib/timezone';
import { TrustPortalAccessRequestForm } from '@/components/trust/TrustPortalAccessRequestForm';
import styles from './trust-portal.module.css';

export const metadata = {
  title: 'Trust Portal · Assessment Platform',
  description: 'Verify a published security assessment artefact and request controlled access.',
};

export const dynamic = 'force-dynamic';

export default async function TrustPortalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [portal] = await db
    .select({
      id: trustPortals.id,
      slug: trustPortals.slug,
      currentPublicationId: trustPortals.currentPublicationId,
      publicationId: trustPortalPublications.id,
      publicationVersion: trustPortalPublications.version,
      snapshot: trustPortalPublications.snapshot,
      snapshotSha256: trustPortalPublications.snapshotSha256,
      publishedAt: trustPortalPublications.publishedAt,
      revokedAt: trustPortalPublications.revokedAt,
      reportStatus: certificationReports.status,
      reportRevokedAt: certificationReports.revokedAt,
    })
    .from(trustPortals)
    .innerJoin(trustPortalPublications, eq(trustPortalPublications.id, trustPortals.currentPublicationId))
    .innerJoin(certificationReports, eq(certificationReports.id, trustPortalPublications.certificationReportId))
    .where(
      and(
        eq(trustPortals.slug, slug.toLowerCase()),
        eq(trustPortals.status, 'published'),
        eq(trustPortalPublications.releaseClassification, 'PUBLIC'),
        isNull(trustPortalPublications.revokedAt),
        eq(certificationReports.status, 'signed'),
        isNull(certificationReports.revokedAt),
      ),
    )
    .limit(1);
  if (
    !portal ||
    portal.currentPublicationId !== portal.publicationId ||
    portal.revokedAt ||
    portal.reportStatus !== 'signed' ||
    portal.reportRevokedAt ||
    !trustPortalSnapshotIsPublic(portal.snapshot) ||
    !trustPortalSnapshotMatchesHash(portal.snapshot, portal.snapshotSha256)
  ) notFound();

  await recordTrustPortalVisit({ slug: portal.slug, publicationId: portal.publicationId });
  const { snapshot } = portal;
  const verificationHref = `/verify/${encodeURIComponent(snapshot.assurance.verificationToken)}`;

  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <div className={styles.wordmark}>
          <span>{snapshot.organisationName}</span>
          <small>Trust Portal</small>
        </div>
        <a className={styles.navAction} href={`mailto:${snapshot.securityContactEmail}`}>Contact security</a>
      </header>

      <article className={styles.document}>
        <header className={styles.introduction}>
          <p className={styles.classification}>PUBLIC</p>
          <h1>{snapshot.portalTitle}</h1>
          <p className={styles.lede}>{snapshot.overview}</p>
          <p className={styles.publicationMeta}>
            Publication v{portal.publicationVersion} · issued {formatDateTime(portal.publishedAt, 'UTC')} ·
            expires {formatDate(snapshot.assurance.publicationExpiresAt, 'UTC')} UTC
          </p>
        </header>

        <section className={styles.section} aria-labelledby="assurance-record">
          <h2 id="assurance-record">Signed assurance record.</h2>
          <p>
            This public record points to a signed assessment artefact. It publishes verification
            metadata only; evidence, findings, system internals, and the assessment bundle remain private.
          </p>
          <dl className={styles.ledger}>
            <LedgerRow term="Assessed system" value={snapshot.assurance.publicSystemName} />
            <LedgerRow term="Framework" value={snapshot.assurance.frameworkLabel} />
            <LedgerRow term="Report version" value={`v${snapshot.assurance.reportVersion}`} mono />
            <LedgerRow term="Assessment outcome" value={recommendationLabel(snapshot.assurance.recommendation)} />
            <LedgerRow term="Signed" value={`${formatDateTime(snapshot.assurance.signedAt, 'UTC')} (UTC)`} />
            <LedgerRow term="Report validity" value={snapshot.assurance.reportValidUntil ? `${formatDate(snapshot.assurance.reportValidUntil, 'UTC')} UTC` : 'No separate validity date recorded'} />
            <LedgerRow term="Signature algorithm" value={snapshot.assurance.signatureAlgorithm} mono />
            <LedgerRow term="Signing key" value={snapshot.assurance.signingKeyFingerprint} mono />
            <LedgerRow term="Bundle SHA-256" value={snapshot.assurance.bundleSha256} mono />
            <LedgerRow term="Public snapshot SHA-256" value={portal.snapshotSha256} mono />
          </dl>
          <p className={styles.inlineAction}>
            Compare the hash and signature status on the independent{' '}
            <Link href={verificationHref}>verification record →</Link>
          </p>
        </section>

        {snapshot.commitments.length ? (
          <section className={styles.section} aria-labelledby="commitments">
            <h2 id="commitments">Published commitments.</h2>
            <ul className={styles.commitments}>
              {snapshot.commitments.map((commitment) => <li key={commitment}>{commitment}</li>)}
            </ul>
          </section>
        ) : null}

        <section className={styles.section} aria-labelledby="controlled-access">
          <h2 id="controlled-access">Controlled artefact access.</h2>
          <p>
            Request the signed assessment PDF when your review needs more than public verification
            metadata. The publisher decides each request. Approved links expire, limit downloads,
            and write every download to an immutable audit trail.
          </p>
          <TrustPortalAccessRequestForm slug={portal.slug} />
        </section>

        <aside className={styles.disclosure} aria-label="Publication boundary">
          <strong>Publication boundary.</strong> This page is an approved PUBLIC snapshot. It does not
          claim government endorsement, system accreditation, or continuing compliance beyond the
          dates and signed artefact shown above.
        </aside>
      </article>

      <footer className={styles.footer}>
        <p className={styles.footerStatement}>Every assurance claim should lead to evidence.</p>
        <div className={styles.footerMeta}>
          <span>{snapshot.organisationName}</span>
          <span>Published with Assessment Platform · {new Date().getUTCFullYear()}</span>
        </div>
      </footer>
    </main>
  );
}

function LedgerRow({ term, value, mono = false }: { term: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.ledgerRow}>
      <dt>{term}</dt>
      <dd className={mono ? styles.mono : undefined}>{value}</dd>
    </div>
  );
}

function recommendationLabel(value: string) {
  if (value === 'recommended') return 'Recommended';
  if (value === 'recommended_with_conditions') return 'Recommended with conditions';
  return 'Not recommended';
}
