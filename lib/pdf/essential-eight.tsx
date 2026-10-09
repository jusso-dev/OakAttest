import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer';
import { e8StrategyLabel, formatMaturity } from '@/lib/essential-eight';
import {
  assessmentOutcome,
  outcomeLabel,
  type EssentialEightCriterionResult,
} from '@/lib/essential-eight-criteria';
import { formatDateTime } from '@/lib/timezone';

const styles = StyleSheet.create({
  page: { padding: 44, fontSize: 9, fontFamily: 'Helvetica', color: '#0f172a' },
  header: { marginBottom: 14, borderBottom: '1pt solid #1e293b', paddingBottom: 8 },
  productTag: { fontSize: 8, letterSpacing: 1.4, color: '#475569', textTransform: 'uppercase' },
  title: { fontSize: 18, marginTop: 4, fontWeight: 700 },
  subtitle: { fontSize: 10, color: '#334155', marginTop: 2 },
  banner: {
    backgroundColor: '#1e293b',
    color: '#fff',
    padding: 6,
    textAlign: 'center',
    fontWeight: 700,
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginTop: 12, marginBottom: 5 },
  body: { lineHeight: 1.45, marginBottom: 5 },
  row: { flexDirection: 'row', borderBottom: '0.5pt solid #cbd5e1', paddingVertical: 3 },
  cell: { flexGrow: 1, flexBasis: 0 },
  label: { color: '#64748b' },
  small: { fontSize: 8, color: '#64748b', lineHeight: 1.35 },
  hash: { fontFamily: 'Courier', fontSize: 7, color: '#0f172a' },
  strategyBox: { border: '0.5pt solid #cbd5e1', padding: 8, marginBottom: 8 },
  tableHeader: {
    flexDirection: 'row',
    borderBottom: '1pt solid #94a3b8',
    paddingVertical: 3,
    fontWeight: 700,
  },
});

export type EssentialEightReportData = {
  timeZone: string;
  tenant: {
    name: string;
    productName: string;
    primaryColour?: string;
    accentColour?: string;
    logoUrl?: string | null;
  };
  engagement: {
    name: string;
    reference: string | null;
    classification: string;
    frameworkRevision: string;
  };
  client: { name: string };
  system: { name: string; description: string | null; environment: string | null };
  report: { version: number; generatedAt: string; sha256?: string | null };
  profile: {
    targetMaturity: string;
    assessmentGuideVersion: string;
    criteriaModelVersion: string;
    scope: string | null;
    approach: string | null;
    limitations: string | null;
  };
  overall: {
    achieved: string;
    blockers: Array<{ label: string; current: string; target: string }>;
  };
  strategies: Array<{
    strategy: string;
    currentMaturity: string;
    targetMaturity: string;
    remediationPlan: string | null;
    assessmentMethods: string | null;
    assessmentObjects: string | null;
    sampleSize: string | null;
    evidenceQuality: string | null;
    evidenceLimitations: string | null;
    assessorConclusion: string | null;
    criteriaResults: Array<
      EssentialEightCriterionResult & {
        evidence: Array<{ filename: string; sha256: string; reviewStatus: string }>;
      }
    >;
    exceptions: Array<{
      scope?: string;
      justification?: string;
      owner?: string;
      compensatingControls?: string;
      conclusion?: string;
    }>;
    mappedControls: Array<{ controlId: string; maturityLevel?: number | null }>;
    evidence: Array<{
      filename: string;
      sha256: string;
      reviewStatus: string;
      quality?: string | null;
    }>;
    findings: Array<{ code: string; type: string; severity: string; status: string; title: string }>;
  }>;
};

export function EssentialEightReportDocument({ data }: { data: EssentialEightReportData }) {
  return (
    <Document
      title={`Essential Eight Assessment Report - ${data.engagement.name}`}
      author={data.tenant.name}
      creator={data.tenant.productName}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text
            style={{
              ...styles.productTag,
              ...(data.tenant.primaryColour ? { color: data.tenant.primaryColour } : {}),
            }}
          >
            {data.tenant.productName}
          </Text>
          <Text style={styles.title}>Essential Eight Assessment Report</Text>
          <Text style={styles.subtitle}>
            {data.engagement.name}
            {data.engagement.reference ? ` - ${data.engagement.reference}` : ''}
          </Text>
        </View>
        <Text
          style={{
            ...styles.banner,
            ...(data.tenant.primaryColour
              ? { backgroundColor: data.tenant.primaryColour }
              : {}),
          }}
        >
          {data.engagement.classification.replace('_', ':')}
        </Text>

        <Text style={styles.sectionTitle}>1. Report Metadata</Text>
        <InfoRow label="Version" value={`v${data.report.version}`} />
        <InfoRow label="Generated" value={formatDateTime(data.report.generatedAt, data.timeZone)} />
        <InfoRow label="Timezone" value={data.timeZone} />
        <InfoRow label="Client" value={data.client.name} />
        <InfoRow label="System" value={data.system.name} />
        <InfoRow label="Environment" value={data.system.environment ?? '-'} />
        <InfoRow label="ISM revision" value={data.engagement.frameworkRevision} />

        <Text style={styles.sectionTitle}>2. Scope and Approach</Text>
        <Text style={styles.body}>{data.profile.scope || 'No Essential Eight-specific scope recorded.'}</Text>
        <Text style={styles.body}>
          Approach: {data.profile.approach || 'No assessment approach recorded.'}
        </Text>
        <Text style={styles.body}>
          Limitations: {data.profile.limitations || 'No limitations recorded.'}
        </Text>

        <Text style={styles.sectionTitle}>3. Overall Package Maturity</Text>
        <InfoRow label="Target maturity" value={formatMaturity(data.profile.targetMaturity)} />
        <InfoRow label="ASD assessment guide" value={data.profile.assessmentGuideVersion} />
        <InfoRow label="Criteria model" value={data.profile.criteriaModelVersion} />
        <InfoRow label="Achieved maturity" value={formatMaturity(data.overall.achieved)} />
        <Text style={styles.small}>
          OakAttest calculates the package result as the lowest achieved maturity across all
          eight strategies.
        </Text>
        {data.overall.blockers.length > 0 && (
          <Text style={styles.body}>
            Blockers: {data.overall.blockers.map((b) => `${b.label} ${formatMaturity(b.current)}`).join('; ')}
          </Text>
        )}

        <Text style={styles.sectionTitle}>4. Strategy Results</Text>
        {data.strategies.map((strategy) => (
          <View key={strategy.strategy} style={styles.strategyBox} wrap={false}>
            <Text style={{ fontWeight: 700, marginBottom: 3 }}>
              {e8StrategyLabel(strategy.strategy)} - {formatMaturity(strategy.currentMaturity)}
            </Text>
            <Text style={styles.small}>Target: {formatMaturity(strategy.targetMaturity)}</Text>
            <Text style={styles.small}>Evidence quality: {strategy.evidenceQuality || 'Not recorded'}</Text>
            <Text style={styles.small}>Methods: {strategy.assessmentMethods || 'Not recorded'}</Text>
            <Text style={styles.small}>Objects/sample: {strategy.assessmentObjects || '-'} / {strategy.sampleSize || '-'}</Text>
            {strategy.assessorConclusion && (
              <Text style={styles.body}>Conclusion: {strategy.assessorConclusion}</Text>
            )}
            <Text style={styles.small}>
              Versioned criteria: {strategy.criteriaResults.length > 0
                ? strategy.criteriaResults
                    .map((result) =>
                      `${result.controlId} ${formatMaturity(result.maturity)} ${outcomeLabel(assessmentOutcome(result))}`,
                    )
                    .join('; ')
                : 'No criterion workpapers recorded'}
            </Text>
            {strategy.evidenceLimitations && (
              <Text style={styles.body}>Limitations: {strategy.evidenceLimitations}</Text>
            )}
            {strategy.exceptions.length > 0 && (
              <Text style={styles.body}>
                Exceptions: {strategy.exceptions.map((item) => item.scope || item.justification || 'Exception recorded').join('; ')}
              </Text>
            )}
            <Text style={styles.small}>
              Mapped ISM controls:{' '}
              {strategy.mappedControls.length > 0
                ? strategy.mappedControls.map((c) => `${c.controlId}${c.maturityLevel ? ` ML${c.maturityLevel}` : ''}`).join(', ')
                : 'None recorded'}
            </Text>
            <Text style={styles.small}>
              Evidence reviewed:{' '}
              {strategy.evidence.length > 0
                ? strategy.evidence.map((e) => `${e.filename} (${e.reviewStatus})`).join(', ')
                : 'No linked evidence recorded'}
            </Text>
            <Text style={styles.small}>
              E8-relevant findings:{' '}
              {strategy.findings.length > 0
                ? strategy.findings.map((f) => `${f.code} ${f.severity}/${f.status}`).join(', ')
                : 'None recorded'}
            </Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>5. Criterion Workpapers</Text>
        {data.strategies.flatMap((strategy) =>
          strategy.criteriaResults.map((result) => (
            <View key={result.criterionId} style={styles.strategyBox} wrap={false}>
              <Text style={{ fontWeight: 700, marginBottom: 3 }}>
                {result.controlId} - {outcomeLabel(assessmentOutcome(result))}
              </Text>
              <Text style={styles.small}>
                {e8StrategyLabel(strategy.strategy)} · {formatMaturity(result.maturity)} · ISM {result.sourceRevision} · guide {result.guideVersion}
              </Text>
              <Text style={styles.body}>{result.criterionText}</Text>
              <Text style={styles.small}>Method: {result.assessmentMethods || '-'}</Text>
              <Text style={styles.small}>Objects: {result.assessmentObjects || '-'}</Text>
              <Text style={styles.small}>
                Population/sample: {result.populationSize ?? '-'} / {result.sampleSize ?? '-'}
              </Text>
              <Text style={styles.body}>Procedure: {result.testProcedure || '-'}</Text>
              <Text style={styles.body}>Result: {result.testResult || '-'}</Text>
              <Text style={styles.small}>
                Evidence: {result.evidence.length > 0
                  ? result.evidence.map((item) => `${item.filename} (${item.reviewStatus})`).join(', ')
                  : 'None'}
              </Text>
              {result.alternateControl && (
                <Text style={styles.body}>Alternate control: {result.alternateControl}</Text>
              )}
              {result.exception && (
                <Text style={styles.body}>
                  Exception approved by {result.exception.authorityName}, {result.exception.authorityRole} on {result.exception.approvedAt}
                  {result.exception.decisionReference ? ` (${result.exception.decisionReference})` : ''}
                </Text>
              )}
            </View>
          )),
        )}

        <Text style={styles.sectionTitle}>6. Evidence Index</Text>
        <View style={styles.tableHeader}>
          <View style={styles.cell}><Text>Strategy</Text></View>
          <View style={styles.cell}><Text>Evidence</Text></View>
          <View style={styles.cell}><Text>SHA-256</Text></View>
        </View>
        {data.strategies.flatMap((strategy) =>
          strategy.evidence.map((evidence) => (
            <View key={`${strategy.strategy}-${evidence.sha256}`} style={styles.row}>
              <View style={styles.cell}><Text>{e8StrategyLabel(strategy.strategy)}</Text></View>
              <View style={styles.cell}><Text>{evidence.filename}</Text></View>
              <View style={styles.cell}><Text style={styles.hash}>{evidence.sha256}</Text></View>
            </View>
          )),
        )}
      </Page>
    </Document>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.cell}><Text style={styles.label}>{label}</Text></View>
      <View style={styles.cell}><Text>{value}</Text></View>
    </View>
  );
}

export async function renderEssentialEightReportPdf(data: EssentialEightReportData): Promise<Buffer> {
  const instance = pdf(<EssentialEightReportDocument data={data} />);
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
