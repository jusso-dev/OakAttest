import { describe, expect, it } from 'vitest';
import {
  connectorTestsForProvider,
  hashObservation,
  newConnectorExternalId,
  nextConnectorRun,
  parseConnectorConfig,
  summariseObservations,
  type AssuranceObservation,
} from '@/lib/connectors/types';

const observedAt = new Date('2026-08-22T01:02:03.000Z');

function observation(outcome: AssuranceObservation['outcome']): AssuranceObservation {
  return {
    testKey: `test.${outcome}`,
    title: `${outcome} test`,
    outcome,
    observation: `${outcome} observation`,
    observedAt,
    evidence: { count: 1, enabled: true },
  };
}

describe('assurance connector engine', () => {
  it('accepts role-only AWS configuration and discards unknown credential fields', () => {
    const config = parseConnectorConfig({
      provider: 'aws_security_hub',
      roleArn: 'arn:aws:iam::123456789012:role/OakAttestReadOnly',
      externalId: 'oakattest-valid-external-id',
      region: 'ap-southeast-2',
      accessKeyId: 'must-not-persist',
      secretAccessKey: 'must-not-persist',
    });
    expect(config).toEqual({
      provider: 'aws_security_hub',
      roleArn: 'arn:aws:iam::123456789012:role/OakAttestReadOnly',
      externalId: 'oakattest-valid-external-id',
      region: 'ap-southeast-2',
    });
    expect(JSON.stringify(config)).not.toContain('must-not-persist');
  });

  it('rejects non-role ARNs and malformed AWS regions', () => {
    expect(() => parseConnectorConfig({
      provider: 'aws_security_hub',
      roleArn: 'arn:aws:iam::123456789012:user/operator',
      externalId: 'oakattest-valid-external-id',
      region: 'ap-southeast-2',
    })).toThrow();
    expect(() => parseConnectorConfig({
      provider: 'aws_security_hub',
      roleArn: 'arn:aws:iam::123456789012:role/OakAttestReadOnly',
      externalId: 'oakattest-valid-external-id',
      region: 'somewhere',
    })).toThrow();
  });

  it('generates unique external IDs for confused-deputy protection', () => {
    const first = newConnectorExternalId();
    const second = newConnectorExternalId();
    expect(first).toMatch(/^oakattest-[A-Za-z0-9_-]{32}$/);
    expect(first).not.toBe(second);
  });

  it('publishes the provider test catalogue and summarises every outcome', () => {
    expect(connectorTestsForProvider('aws_security_hub').map((test) => test.key)).toEqual([
      'aws.security-hub.enabled',
      'aws.security-hub.standards-ready',
      'aws.security-hub.high-findings',
    ]);
    expect(summariseObservations([
      observation('pass'),
      observation('fail'),
      observation('error'),
      observation('unknown'),
    ])).toEqual({ passed: 1, failed: 1, errors: 1, unknown: 1 });
  });

  it('hashes immutable observations deterministically and validates schedules', () => {
    const value = observation('pass');
    expect(hashObservation(value)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashObservation(value)).toBe(hashObservation({ ...value }));
    expect(nextConnectorRun(observedAt, 60).toISOString()).toBe('2026-08-22T02:02:03.000Z');
    expect(() => nextConnectorRun(observedAt, 5)).toThrow(/between 15 minutes/);
  });
});
