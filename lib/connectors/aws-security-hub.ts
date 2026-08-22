import crypto from 'node:crypto';
import {
  AssumeRoleCommand,
  GetCallerIdentityCommand,
  STSClient,
} from '@aws-sdk/client-sts';
import type { AwsCredentialIdentity } from '@smithy/types';
import {
  DescribeHubCommand,
  GetEnabledStandardsCommand,
  GetFindingsCommand,
  SecurityHubClient,
} from '@aws-sdk/client-securityhub';
import type {
  AssuranceConnectorConfig,
  AssuranceObservation,
  AwsSecurityHubConfig,
  ConnectorAdapter,
} from './types';

const READ_ONLY_SESSION_POLICY = JSON.stringify({
  Version: '2012-10-17',
  Statement: [
    {
      Effect: 'Allow',
      Action: [
        'securityhub:DescribeHub',
        'securityhub:GetEnabledStandards',
        'securityhub:GetFindings',
        'sts:GetCallerIdentity',
      ],
      Resource: '*',
    },
  ],
});

export const awsSecurityHubAdapter: ConnectorAdapter = {
  async testConnection(config) {
    const aws = asAwsConfig(config);
    const credentials = await assumeReadOnlyRole(aws);
    const client = new STSClient({ region: aws.region, credentials });
    try {
      const identity = await client.send(new GetCallerIdentityCommand({}));
      if (!identity.Account) throw new Error('AWS did not return the assumed account identifier.');
      return { accountLabel: `${identity.Account} · ${aws.region}` };
    } finally {
      client.destroy();
    }
  },

  async collect(config) {
    const aws = asAwsConfig(config);
    const credentials = await assumeReadOnlyRole(aws);
    const client = new SecurityHubClient({ region: aws.region, credentials });
    const observedAt = new Date();

    try {
      const hub = await client.send(new DescribeHubCommand({}));
      const enabled: AssuranceObservation = {
        testKey: 'aws.security-hub.enabled',
        title: 'AWS Security Hub CSPM enabled',
        outcome: hub.HubArn ? 'pass' : 'fail',
        observation: hub.HubArn
          ? `Security Hub CSPM is enabled in ${aws.region}.`
          : `Security Hub CSPM did not return a hub in ${aws.region}.`,
        observedAt,
        evidence: {
          region: aws.region,
          subscribedAt: hub.SubscribedAt ?? null,
          autoEnableControls: hub.AutoEnableControls ?? false,
          controlFindingGenerator: hub.ControlFindingGenerator ?? null,
        },
      };

      const [standards, findings] = await Promise.all([
        client.send(new GetEnabledStandardsCommand({ MaxResults: 100 })),
        client.send(new GetFindingsCommand({
          Filters: {
            RecordState: [{ Value: 'ACTIVE', Comparison: 'EQUALS' }],
            WorkflowStatus: [
              { Value: 'NEW', Comparison: 'EQUALS' },
              { Value: 'NOTIFIED', Comparison: 'EQUALS' },
            ],
            SeverityLabel: [
              { Value: 'HIGH', Comparison: 'EQUALS' },
              { Value: 'CRITICAL', Comparison: 'EQUALS' },
            ],
          },
          MaxResults: 100,
        })),
      ]);
      const readyStandards = (standards.StandardsSubscriptions ?? []).filter(
        (standard) => standard.StandardsStatus === 'READY',
      );
      const findingCount = findings.Findings?.length ?? 0;
      const truncated = Boolean(findings.NextToken);

      return [
        enabled,
        {
          testKey: 'aws.security-hub.standards-ready',
          title: 'AWS Security Hub standards ready',
          outcome: readyStandards.length > 0 ? 'pass' : 'fail',
          observation: readyStandards.length > 0
            ? `${readyStandards.length} enabled Security Hub standard(s) are ready.`
            : 'No enabled Security Hub standard is in READY state.',
          observedAt,
          evidence: {
            region: aws.region,
            readyStandards: readyStandards.map((standard) => standard.StandardsArn ?? 'unknown'),
            totalSubscriptions: standards.StandardsSubscriptions?.length ?? 0,
          },
        },
        {
          testKey: 'aws.security-hub.high-findings',
          title: 'No active high or critical AWS findings',
          outcome: findingCount === 0 ? 'pass' : 'fail',
          observation: findingCount === 0
            ? 'No active high or critical Security Hub findings were returned.'
            : `${truncated ? 'At least ' : ''}${findingCount} active high or critical finding(s) require review.`,
          observedAt,
          evidence: {
            region: aws.region,
            activeHighOrCriticalFindings: findingCount,
            resultTruncated: truncated,
          },
        },
      ];
    } catch (cause) {
      if (!isHubUnavailable(cause)) throw cause;
      return [
        {
          testKey: 'aws.security-hub.enabled',
          title: 'AWS Security Hub CSPM enabled',
          outcome: 'fail',
          observation: `Security Hub CSPM is unavailable or not enabled in ${aws.region}.`,
          observedAt,
          evidence: { region: aws.region, errorCode: errorName(cause) },
        },
        {
          testKey: 'aws.security-hub.standards-ready',
          title: 'AWS Security Hub standards ready',
          outcome: 'unknown',
          observation: 'Enabled standards could not be evaluated until Security Hub CSPM is available.',
          observedAt,
          evidence: { region: aws.region },
        },
        {
          testKey: 'aws.security-hub.high-findings',
          title: 'No active high or critical AWS findings',
          outcome: 'unknown',
          observation: 'High and critical findings could not be evaluated until Security Hub CSPM is available.',
          observedAt,
          evidence: { region: aws.region },
        },
      ];
    } finally {
      client.destroy();
    }
  },
};

async function assumeReadOnlyRole(config: AwsSecurityHubConfig): Promise<AwsCredentialIdentity> {
  const client = new STSClient({ region: config.region });
  try {
    const response = await client.send(new AssumeRoleCommand({
      RoleArn: config.roleArn,
      RoleSessionName: `OakAttest-${cryptoSafeSessionSuffix()}`,
      ExternalId: config.externalId,
      DurationSeconds: 900,
      Policy: READ_ONLY_SESSION_POLICY,
    }));
    if (
      !response.Credentials?.AccessKeyId ||
      !response.Credentials.SecretAccessKey ||
      !response.Credentials.SessionToken
    ) {
      throw new Error('AWS STS did not return complete temporary role credentials.');
    }
    return {
      accessKeyId: response.Credentials.AccessKeyId,
      secretAccessKey: response.Credentials.SecretAccessKey,
      sessionToken: response.Credentials.SessionToken,
      expiration: response.Credentials.Expiration,
    };
  } finally {
    client.destroy();
  }
}

function asAwsConfig(config: AssuranceConnectorConfig): AwsSecurityHubConfig {
  if (config.provider !== 'aws_security_hub') throw new Error('Unsupported connector provider.');
  return config;
}

function cryptoSafeSessionSuffix(): string {
  return `${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}`;
}

function isHubUnavailable(cause: unknown): boolean {
  return ['InvalidAccessException', 'ResourceNotFoundException'].includes(errorName(cause));
}

function errorName(cause: unknown): string {
  return cause instanceof Error ? cause.name : 'UnknownError';
}
