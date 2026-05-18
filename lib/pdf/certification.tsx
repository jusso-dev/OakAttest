import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer';
import type { Classification } from '@/db/schema/enums';
import type { CertificationReadinessSnapshot } from '@/lib/certification/readiness';

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
  sectionTitle: { fontSize: 13, fontWeight: 700, marginTop: 14, marginBottom: 6 },
  body: { lineHeight: 1.5, marginBottom: 6 },
  row: { flexDirection: 'row', borderBottom: '0.5pt solid #cbd5e1', paddingVertical: 3 },
  cell: { flexGrow: 1 },
  label: { color: '#64748b' },
  signatureBox: {
    border: '1pt solid #0f4c4a',
    padding: 10,
    marginTop: 20,
    backgroundColor: '#f0fdfa',
  },
  hash: { fontFamily: 'Courier', fontSize: 8, color: '#0f172a', wordBreak: 'break-all' },
});

export type CertificationData = {
  engagement: {
    name: string;
    reference: string | null;
    classification: Classification;
    ismRevision: string;
  };
  tenant: { name: string; productName: string };
  client: { name: string };
  scope: string;
  methodology: string;
  findings: {
    total: number;
    nonConformanceOpen: number;
    observations: number;
    bySeverity: Record<string, number>;
  };
  residualRisks: Array<{ title: string; description: string; mitigation: string | null }>;
  recommendation: 'recommended' | 'recommended_with_conditions' | 'not_recommended';
  conditions: string | null;
  validUntil: string | null;
  readiness: CertificationReadinessSnapshot | null;
  signedBy: { name: string; email: string } | null;
  signedAt: string | null;
  bundleHash: string | null;
  publicVerificationUrl: string | null;
  reportVersion: number;
};

export function CertificationDocument({ data }: { data: CertificationData }) {
  const banner = data.engagement.classification.replace('_', ':');
  const recLabel = {
    recommended: 'Recommended for certification',
    recommended_with_conditions: 'Recommended for certification with conditions',
    not_recommended: 'Not recommended for certification',
  }[data.recommendation];

  return (
    <Document title={`Certification Report — ${data.engagement.name}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.productTag}>{data.tenant.productName}</Text>
          <Text style={styles.title}>IRAP Certification Report</Text>
          <Text style={styles.subtitle}>
            {data.engagement.name}
            {data.engagement.reference ? ` · ${data.engagement.reference}` : ''}
          </Text>
        </View>
        <Text style={styles.classificationBanner}>{banner}</Text>

        <Text style={styles.sectionTitle}>1. Scope</Text>
        <Text style={styles.body}>{data.scope}</Text>

        <Text style={styles.sectionTitle}>2. Methodology</Text>
        <Text style={styles.body}>{data.methodology}</Text>

        <Text style={styles.sectionTitle}>3. Findings Summary</Text>
        <View style={styles.row}>
          <View style={styles.cell}><Text style={styles.label}>Total findings</Text></View>
          <View style={styles.cell}><Text>{data.findings.total}</Text></View>
        </View>
        <View style={styles.row}>
          <View style={styles.cell}><Text style={styles.label}>Open non-conformances</Text></View>
          <View style={styles.cell}><Text>{data.findings.nonConformanceOpen}</Text></View>
        </View>
        <View style={styles.row}>
          <View style={styles.cell}><Text style={styles.label}>Observations</Text></View>
          <View style={styles.cell}><Text>{data.findings.observations}</Text></View>
        </View>
        {Object.entries(data.findings.bySeverity).map(([sev, count]) => (
          <View style={styles.row} key={sev}>
            <View style={styles.cell}><Text style={styles.label}>{sev}</Text></View>
            <View style={styles.cell}><Text>{count}</Text></View>
          </View>
        ))}

        <Text style={styles.sectionTitle}>4. Residual Risks</Text>
        {data.residualRisks.length === 0 ? (
          <Text style={styles.body}>No residual risks recorded.</Text>
        ) : (
          data.residualRisks.map((r, i) => (
            <View key={i} style={{ marginBottom: 6 }}>
              <Text style={{ fontWeight: 700 }}>{r.title}</Text>
              <Text style={styles.body}>{r.description}</Text>
              {r.mitigation && (
                <Text style={{ ...styles.body, color: '#475569' }}>Mitigation: {r.mitigation}</Text>
              )}
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>5. Recommendation</Text>
        <Text style={{ ...styles.body, fontWeight: 700 }}>{recLabel}</Text>
        {data.conditions && (
          <Text style={styles.body}>Conditions: {data.conditions}</Text>
        )}
        {data.validUntil && (
          <Text style={styles.body}>Re-assessment due by: {data.validUntil}</Text>
        )}

        {data.readiness && (
          <>
            <Text style={styles.sectionTitle}>6. Readiness Snapshot</Text>
            <Text style={styles.body}>
              Captured: {data.readiness.capturedAt} · Ready to sign:{' '}
              {data.readiness.readyToSign ? 'yes' : 'no'}
            </Text>
            {data.readiness.blockers.length > 0 && (
              <Text style={styles.body}>
                Blockers: {data.readiness.blockers.map((item) => `${item.label} (${item.count})`).join('; ')}
              </Text>
            )}
            {data.readiness.warnings.length > 0 && (
              <Text style={styles.body}>
                Warnings: {data.readiness.warnings.map((item) => `${item.label} (${item.count})`).join('; ')}
              </Text>
            )}
          </>
        )}

        <View style={styles.signatureBox}>
          <Text style={{ fontWeight: 700, marginBottom: 6 }}>Lead Assessor Signature</Text>
          {data.signedBy ? (
            <>
              <Text>{data.signedBy.name} ({data.signedBy.email})</Text>
              <Text style={styles.body}>Signed: {data.signedAt}</Text>
              {data.bundleHash && (
                <>
                  <Text style={{ ...styles.label, marginTop: 6 }}>Bundle SHA-256:</Text>
                  <Text style={styles.hash}>{data.bundleHash}</Text>
                </>
              )}
              {data.publicVerificationUrl && (
                <>
                  <Text style={{ ...styles.label, marginTop: 6 }}>Verification URL:</Text>
                  <Text style={styles.hash}>{data.publicVerificationUrl}</Text>
                </>
              )}
            </>
          ) : (
            <Text style={styles.body}>Awaiting lead assessor signature.</Text>
          )}
        </View>
      </Page>
    </Document>
  );
}

export async function renderCertificationPdf(data: CertificationData): Promise<Buffer> {
  const instance = pdf(<CertificationDocument data={data} />);
  const blob = await instance.toBuffer();
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
