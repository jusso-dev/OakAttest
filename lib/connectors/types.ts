import crypto from 'node:crypto';
import { z } from 'zod';

export const CONNECTOR_PROVIDERS = ['aws_security_hub'] as const;
export type ConnectorProvider = (typeof CONNECTOR_PROVIDERS)[number];

export type AwsSecurityHubConfig = {
  provider: 'aws_security_hub';
  roleArn: string;
  externalId: string;
  region: string;
};

export type AssuranceConnectorConfig = AwsSecurityHubConfig;
export type AssuranceOutcome = 'pass' | 'fail' | 'error' | 'unknown';

export type AssuranceObservation = {
  testKey: string;
  title: string;
  outcome: AssuranceOutcome;
  observation: string;
  observedAt: Date;
  evidence: Record<string, string | number | boolean | null | string[]>;
};

export type ConnectorAdapter = {
  testConnection(config: AssuranceConnectorConfig): Promise<{ accountLabel: string }>;
  collect(config: AssuranceConnectorConfig): Promise<AssuranceObservation[]>;
};

export const CONNECTOR_TEST_CATALOG: Record<ConnectorProvider, ReadonlyArray<{ key: string; title: string }>> = {
  aws_security_hub: [
    { key: 'aws.security-hub.enabled', title: 'AWS Security Hub CSPM enabled' },
    { key: 'aws.security-hub.standards-ready', title: 'AWS Security Hub standards ready' },
    { key: 'aws.security-hub.high-findings', title: 'No active high or critical AWS findings' },
  ],
};

export function connectorTestsForProvider(provider: ConnectorProvider) {
  return CONNECTOR_TEST_CATALOG[provider];
}

const awsConfigSchema = z.object({
  provider: z.literal('aws_security_hub'),
  roleArn: z.string().regex(/^arn:(?:aws|aws-us-gov|aws-cn):iam::\d{12}:role\/[A-Za-z0-9+=,.@_\/-]{1,512}$/),
  externalId: z.string().min(16).max(128),
  region: z.string().regex(/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/),
});

export function parseConnectorConfig(value: unknown): AssuranceConnectorConfig {
  return awsConfigSchema.parse(value);
}

export function newConnectorExternalId(): string {
  return `oakattest-${crypto.randomBytes(24).toString('base64url')}`;
}

export function hashObservation(observation: AssuranceObservation): string {
  return crypto.createHash('sha256').update(stableJson({
    testKey: observation.testKey,
    title: observation.title,
    outcome: observation.outcome,
    observation: observation.observation,
    observedAt: observation.observedAt.toISOString(),
    evidence: observation.evidence,
  })).digest('hex');
}

export function summariseObservations(observations: AssuranceObservation[]) {
  return observations.reduce(
    (summary, observation) => {
      if (observation.outcome === 'pass') summary.passed += 1;
      else if (observation.outcome === 'fail') summary.failed += 1;
      else if (observation.outcome === 'error') summary.errors += 1;
      else summary.unknown += 1;
      return summary;
    },
    { passed: 0, failed: 0, errors: 0, unknown: 0 },
  );
}

export function nextConnectorRun(from: Date, scheduleMinutes: number): Date {
  if (!Number.isInteger(scheduleMinutes) || scheduleMinutes < 15 || scheduleMinutes > 43_200) {
    throw new Error('Connector schedule must be between 15 minutes and 30 days.');
  }
  return new Date(from.getTime() + scheduleMinutes * 60_000);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
