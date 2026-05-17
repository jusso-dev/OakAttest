/* eslint-disable jsx-a11y/alt-text */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer';
import type { Classification } from '@/db/schema/enums';

// Server-only renderer. The pdf() helper produces a buffer we upload to S3.
// Styles are intentionally plain — government audiences prefer dense and
// professional over decorative.

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 10, fontFamily: 'Helvetica', color: '#0f172a' },
  header: { marginBottom: 16, borderBottom: '1pt solid #1e293b', paddingBottom: 8 },
  productTag: { fontSize: 8, letterSpacing: 1.6, color: '#475569', textTransform: 'uppercase' },
  title: { fontSize: 18, marginTop: 4, fontWeight: 700 },
  subtitle: { fontSize: 10, color: '#334155', marginTop: 2 },
  classificationBanner: {
    backgroundColor: '#1e293b',
    color: '#fff',
    padding: 6,
    textAlign: 'center',
    fontWeight: 700,
    letterSpacing: 1.4,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    marginTop: 14,
    marginBottom: 6,
    color: '#0f172a',
  },
  body: { lineHeight: 1.5, marginBottom: 6 },
  row: { flexDirection: 'row', borderBottom: '0.5pt solid #cbd5e1', paddingVertical: 3 },
  cell: { flexGrow: 1 },
  label: { color: '#64748b' },
  small: { fontSize: 8, color: '#64748b' },
  tableHeader: {
    flexDirection: 'row',
    borderBottom: '1pt solid #94a3b8',
    paddingVertical: 3,
    fontWeight: 700,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    color: '#64748b',
    fontSize: 8,
  },
});

export type SspData = {
  engagement: {
    name: string;
    reference: string | null;
    classification: Classification;
    ismRevision: string;
    phase: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    startedAt: string | null;
    targetCertificationAt: string | null;
    certifiedAt: string | null;
    boundaryLockedAt: string | null;
  };
  tenant: { name: string; productName: string };
  client: { name: string; abn: string | null };
  system: { name: string; description: string | null; environment: string | null };
  boundary: { version: number; nodes: number; edges: number } | null;
  members: Array<{
    name: string | null;
    email: string;
    role: string;
    joinedAt: string | null;
  }>;
  summary: {
    totalControls: number;
    notStarted: number;
    inProgress: number;
    evidencePending: number;
    implemented: number;
    notApplicable: number;
    compensating: number;
    notImplemented: number;
    remainingControls: number;
    undecidedApplicability: number;
    missingImplementationStatements: number;
    residualRiskCount: number;
    essentialEightCount: number;
  };
  controls: Array<{
    controlId: string;
    description: string;
    applicable: string | null;
    justification: string | null;
    implementationStatement: string | null;
    status: string;
    assessmentMethods: string | null;
    assessmentObjects: string | null;
    evidenceQuality: string | null;
    evidenceLimitations: string | null;
  }>;
  essentialEight: Array<{ strategy: string; currentMaturity: string; targetMaturity: string }>;
  residualRisks: Array<{ title: string; description: string; mitigation: string | null }>;
  exportedAt: string;
  exportVersion: number;
};

function classificationLabel(c: Classification): string {
  return c.replace('_', ':');
}

export function SspDocument({ data }: { data: SspData }) {
  const banner = classificationLabel(data.engagement.classification);
  return (
    <Document
      title={`SSP — ${data.engagement.name}`}
      author={data.tenant.name}
      creator={data.tenant.productName}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.productTag}>{data.tenant.productName}</Text>
          <Text style={styles.title}>System Security Plan</Text>
          <Text style={styles.subtitle}>
            {data.engagement.name}
            {data.engagement.reference ? ` · ${data.engagement.reference}` : ''}
          </Text>
        </View>
        <Text style={styles.classificationBanner}>{banner}</Text>

        <Text style={styles.sectionTitle}>1. Export and Engagement Metadata</Text>
        <View style={styles.row}>
          <View style={styles.cell}><Text style={styles.label}>Export version</Text></View>
          <View style={styles.cell}><Text>{data.exportVersion}</Text></View>
        </View>
        <View style={styles.row}>
          <View style={styles.cell}><Text style={styles.label}>Exported at</Text></View>
          <View style={styles.cell}><Text>{formatDateTime(data.exportedAt)}</Text></View>
        </View>
        <View style={styles.row}>
          <View style={styles.cell}><Text style={styles.label}>Engagement last updated</Text></View>
          <View style={styles.cell}><Text>{formatDateTime(data.engagement.updatedAt)}</Text></View>
        </View>
        <View style={styles.row}>
          <View style={styles.cell}><Text style={styles.label}>Status</Text></View>
          <View style={styles.cell}><Text>{data.engagement.status} · {data.engagement.phase}</Text></View>
        </View>
        <View style={styles.row}>
          <View style={styles.cell}><Text style={styles.label}>Target certification</Text></View>
          <View style={styles.cell}><Text>{formatOptionalDate(data.engagement.targetCertificationAt)}</Text></View>
        </View>
        <View style={styles.row}>
          <View style={styles.cell}><Text style={styles.label}>Certified at</Text></View>
          <View style={styles.cell}><Text>{formatOptionalDate(data.engagement.certifiedAt)}</Text></View>
        </View>

        <Text style={styles.sectionTitle}>2. System Overview</Text>
        <View style={styles.row}>
          <View style={styles.cell}><Text style={styles.label}>System</Text></View>
          <View style={styles.cell}><Text>{data.system.name}</Text></View>
        </View>
        <View style={styles.row}>
          <View style={styles.cell}><Text style={styles.label}>Environment</Text></View>
          <View style={styles.cell}><Text>{data.system.environment ?? '—'}</Text></View>
        </View>
        <View style={styles.row}>
          <View style={styles.cell}><Text style={styles.label}>Client organisation</Text></View>
          <View style={styles.cell}>
            <Text>
              {data.client.name}
              {data.client.abn ? ` (ABN ${data.client.abn})` : ''}
            </Text>
          </View>
        </View>
        {data.system.description && (
          <Text style={styles.body}>{data.system.description}</Text>
        )}

        <Text style={styles.sectionTitle}>3. People and Roles</Text>
        {data.members.length === 0 ? (
          <Text style={styles.body}>No engagement members recorded.</Text>
        ) : (
          <>
            <View style={styles.tableHeader}>
              <View style={styles.cell}><Text>Name</Text></View>
              <View style={styles.cell}><Text>Email</Text></View>
              <View style={styles.cell}><Text>Role</Text></View>
            </View>
            {data.members.map((member) => (
              <View key={`${member.email}-${member.role}`} style={styles.row}>
                <View style={styles.cell}><Text>{member.name ?? '—'}</Text></View>
                <View style={styles.cell}><Text>{member.email}</Text></View>
                <View style={styles.cell}><Text>{member.role}</Text></View>
              </View>
            ))}
          </>
        )}

        <Text style={styles.sectionTitle}>4. Classification and Data Handling</Text>
        <Text style={styles.body}>
          This system is assessed at the {banner} level. Information handled at this level is
          subject to the relevant Protective Security Policy Framework controls and any client
          policy that overlays them. Classification is cumulative: controls applicable at
          lower classifications also apply to this system.
        </Text>
        <View style={styles.row}>
          <View style={styles.cell}><Text style={styles.label}>ISM revision</Text></View>
          <View style={styles.cell}><Text>{data.engagement.ismRevision}</Text></View>
        </View>

        <Text style={styles.sectionTitle}>5. Boundary and Component Inventory</Text>
        {data.boundary ? (
          <Text style={styles.body}>
            Boundary version {data.boundary.version} comprises {data.boundary.nodes} components
            with {data.boundary.edges} relationships. The visual graph is exported as Annex A.
          </Text>
        ) : (
          <Text style={styles.body}>
            Boundary not yet established. This section will be populated once the client
            completes the boundary builder and the lead assessor locks the version.
          </Text>
        )}

        <Text style={styles.sectionTitle}>6. Control Progress Summary</Text>
        <Text style={styles.body}>
          {data.controls.length} controls are in scope under the cumulative classification rule.
          {` ${data.summary.remainingControls} controls remain to be fully actioned.`}
        </Text>
        <View style={styles.row}>
          <View style={styles.cell}><Text style={styles.label}>Not started</Text></View>
          <View style={styles.cell}><Text>{data.summary.notStarted}</Text></View>
          <View style={styles.cell}><Text style={styles.label}>In progress</Text></View>
          <View style={styles.cell}><Text>{data.summary.inProgress}</Text></View>
        </View>
        <View style={styles.row}>
          <View style={styles.cell}><Text style={styles.label}>Evidence pending</Text></View>
          <View style={styles.cell}><Text>{data.summary.evidencePending}</Text></View>
          <View style={styles.cell}><Text style={styles.label}>Implemented</Text></View>
          <View style={styles.cell}><Text>{data.summary.implemented}</Text></View>
        </View>
        <View style={styles.row}>
          <View style={styles.cell}><Text style={styles.label}>Undecided applicability</Text></View>
          <View style={styles.cell}><Text>{data.summary.undecidedApplicability}</Text></View>
          <View style={styles.cell}><Text style={styles.label}>Missing statements</Text></View>
          <View style={styles.cell}><Text>{data.summary.missingImplementationStatements}</Text></View>
        </View>
      </Page>

      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.classificationBanner}>{banner}</Text>
        <Text style={styles.sectionTitle}>7. Control Implementation Statements</Text>
        {data.controls.map((c) => (
          <View key={c.controlId} style={{ marginBottom: 10 }} wrap={false}>
            <Text style={{ fontWeight: 700 }}>{c.controlId}</Text>
            <Text style={styles.body}>{c.description}</Text>
            <View style={styles.row}>
              <View style={styles.cell}><Text style={styles.label}>Applicability</Text></View>
              <View style={styles.cell}><Text>{c.applicable ?? 'not yet decided'}</Text></View>
            </View>
            {c.justification && (
              <Text style={styles.small}>Justification: {c.justification}</Text>
            )}
            {(c.assessmentMethods || c.assessmentObjects || c.evidenceQuality || c.evidenceLimitations) && (
              <View style={{ marginTop: 4 }}>
                <Text style={styles.small}>Assessment methods: {c.assessmentMethods ?? 'not recorded'}</Text>
                <Text style={styles.small}>Assessment objects: {c.assessmentObjects ?? 'not recorded'}</Text>
                <Text style={styles.small}>Evidence quality: {c.evidenceQuality ?? 'not recorded'}</Text>
                <Text style={styles.small}>Evidence limitations: {c.evidenceLimitations ?? 'none recorded'}</Text>
              </View>
            )}
            <Text style={{ marginTop: 4 }}>
              {c.implementationStatement?.trim() || 'No implementation statement supplied.'}
            </Text>
          </View>
        ))}
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.classificationBanner}>{banner}</Text>
        <Text style={styles.sectionTitle}>8. Essential Eight Posture</Text>
        {data.essentialEight.length === 0 ? (
          <Text style={styles.body}>Essential Eight assessment not yet recorded.</Text>
        ) : (
          data.essentialEight.map((e) => (
            <View key={e.strategy} style={styles.row}>
              <View style={styles.cell}><Text>{e.strategy.replace(/_/g, ' ')}</Text></View>
              <View style={styles.cell}>
                <Text>Current {e.currentMaturity.toUpperCase()} → target {e.targetMaturity.toUpperCase()}</Text>
              </View>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>9. Residual Risks</Text>
        {data.residualRisks.length === 0 ? (
          <Text style={styles.body}>No residual risks recorded.</Text>
        ) : (
          data.residualRisks.map((r, i) => (
            <View key={i} style={{ marginBottom: 6 }}>
              <Text style={{ fontWeight: 700 }}>{r.title}</Text>
              <Text style={styles.body}>{r.description}</Text>
              {r.mitigation && <Text style={styles.small}>Mitigation: {r.mitigation}</Text>}
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>10. Annexes</Text>
        <Text style={styles.body}>
          Annex A — Boundary diagram (exported separately).{'\n'}
          Annex B — Evidence index (see Certification Package CSV).
        </Text>

        <View style={styles.footer} fixed>
          <Text>
            {data.tenant.productName} · {data.tenant.name} · export v{data.exportVersion}
          </Text>
          <Text>{data.exportedAt}</Text>
        </View>
      </Page>
    </Document>
  );
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-AU');
}

function formatOptionalDate(value: string | null) {
  return value ? formatDateTime(value) : '—';
}

export async function renderSspPdf(data: SspData): Promise<Buffer> {
  const instance = pdf(<SspDocument data={data} />);
  const blob = await instance.toBuffer();
  // `toBuffer` returns a NodeJS-compatible stream in some versions; coerce.
  if (blob && typeof (blob as { read?: unknown }).read === 'function') {
    return await streamToBuffer(blob as unknown as NodeJS.ReadableStream);
  }
  if (Buffer.isBuffer(blob)) return blob;
  if (blob instanceof Uint8Array) return Buffer.from(blob);
  throw new Error('Unexpected PDF buffer shape');
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks);
}
