import crypto from 'node:crypto';
import { and, eq, lte } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { auditLog } from '@/db/schema/audit';
import {
  assuranceConnectors,
  assuranceTestControlMappings,
  assuranceTestResultControls,
  assuranceTestResults,
  assuranceTestRuns,
} from '@/db/schema/assurance-connectors';
import { connectorAdapter } from './registry';
import {
  hashObservation,
  nextConnectorRun,
  parseConnectorConfig,
  summariseObservations,
  type ConnectorAdapter,
  type ConnectorProvider,
} from './types';

export async function runAssuranceConnector({
  connectorId,
  trigger,
  requestedBy = null,
  adapterOverride,
}: {
  connectorId: string;
  trigger: 'manual' | 'scheduled';
  requestedBy?: string | null;
  adapterOverride?: ConnectorAdapter;
}) {
  const [connector] = await db
    .select()
    .from(assuranceConnectors)
    .where(eq(assuranceConnectors.id, connectorId))
    .limit(1);
  if (!connector) throw new Error('Connector not found.');
  if (connector.status !== 'active') throw new Error('Connector must be active before tests can run.');

  const config = parseConnectorConfig(connector.configuration);
  const adapter = adapterOverride ?? connectorAdapter(config.provider as ConnectorProvider);
  const runId = crypto.randomUUID();
  const startedAt = new Date();
  await db.insert(assuranceTestRuns).values({
    id: runId,
    tenantId: connector.tenantId,
    engagementId: connector.engagementId,
    connectorId: connector.id,
    trigger,
    status: 'running',
    startedAt,
    requestedBy,
  });

  try {
    const observations = await adapter.collect(config);
    const summary = summariseObservations(observations);
    const mappings = await db
      .select({
        testKey: assuranceTestControlMappings.testKey,
        frameworkControlId: assuranceTestControlMappings.frameworkControlId,
      })
      .from(assuranceTestControlMappings)
      .where(eq(assuranceTestControlMappings.connectorId, connector.id));
    const mappingsByTest = new Map<string, string[]>();
    for (const mapping of mappings) {
      const values = mappingsByTest.get(mapping.testKey) ?? [];
      values.push(mapping.frameworkControlId);
      mappingsByTest.set(mapping.testKey, values);
    }
    const completedAt = new Date();
    await db.transaction(async (tx) => {
      for (const observation of observations) {
        const resultId = crypto.randomUUID();
        await tx.insert(assuranceTestResults).values({
          id: resultId,
          tenantId: connector.tenantId,
          engagementId: connector.engagementId,
          connectorId: connector.id,
          runId,
          testKey: observation.testKey,
          title: observation.title,
          outcome: observation.outcome,
          observation: observation.observation,
          observedAt: observation.observedAt,
          evidence: observation.evidence,
          evidenceSha256: hashObservation(observation),
        });
        const controlIds = mappingsByTest.get(observation.testKey) ?? [];
        if (controlIds.length) {
          await tx.insert(assuranceTestResultControls).values(
            controlIds.map((frameworkControlId) => ({ resultId, frameworkControlId })),
          );
        }
      }
      await tx
        .update(assuranceTestRuns)
        .set({ status: 'completed', completedAt, summary })
        .where(eq(assuranceTestRuns.id, runId));
      await tx
        .update(assuranceConnectors)
        .set({
          lastRunAt: completedAt,
          nextRunAt: nextConnectorRun(completedAt, connector.scheduleMinutes),
          lastError: null,
          updatedAt: completedAt,
        })
        .where(eq(assuranceConnectors.id, connector.id));
      await tx.insert(auditLog).values({
        tenantId: connector.tenantId,
        engagementId: connector.engagementId,
        actorType: requestedBy ? 'user' : 'system',
        actorUserId: requestedBy,
        action: 'connector.test_run.completed',
        resourceType: 'assurance_test_run',
        resourceId: runId,
        afterJson: { connectorId: connector.id, trigger, summary } as never,
      });
    });
    return { runId, summary };
  } catch (cause) {
    const completedAt = new Date();
    const error = sanitiseConnectorError(cause);
    await db.transaction(async (tx) => {
      await tx
        .update(assuranceTestRuns)
        .set({ status: 'error', completedAt, error })
        .where(eq(assuranceTestRuns.id, runId));
      await tx
        .update(assuranceConnectors)
        .set({
          lastRunAt: completedAt,
          nextRunAt: nextConnectorRun(completedAt, connector.scheduleMinutes),
          lastError: error,
          updatedAt: completedAt,
        })
        .where(eq(assuranceConnectors.id, connector.id));
      await tx.insert(auditLog).values({
        tenantId: connector.tenantId,
        engagementId: connector.engagementId,
        actorType: requestedBy ? 'user' : 'system',
        actorUserId: requestedBy,
        action: 'connector.test_run.failed',
        resourceType: 'assurance_test_run',
        resourceId: runId,
        afterJson: { connectorId: connector.id, trigger, error } as never,
      });
    });
    throw new Error(error);
  }
}

export async function runDueAssuranceConnectors(now = new Date()) {
  const due = await db
    .select({ id: assuranceConnectors.id })
    .from(assuranceConnectors)
    .where(and(eq(assuranceConnectors.status, 'active'), lte(assuranceConnectors.nextRunAt, now)))
    .limit(50);
  const errors: string[] = [];
  let runCount = 0;

  for (const candidate of due) {
    const [claimed] = await db
      .update(assuranceConnectors)
      .set({ nextRunAt: new Date(now.getTime() + 15 * 60_000), updatedAt: now })
      .where(
        and(
          eq(assuranceConnectors.id, candidate.id),
          eq(assuranceConnectors.status, 'active'),
          lte(assuranceConnectors.nextRunAt, now),
        ),
      )
      .returning({ id: assuranceConnectors.id });
    if (!claimed) continue;
    try {
      await runAssuranceConnector({ connectorId: claimed.id, trigger: 'scheduled' });
      runCount += 1;
    } catch (cause) {
      errors.push(`${claimed.id}: ${sanitiseConnectorError(cause)}`);
    }
  }
  return { runCount, errorCount: errors.length, errors };
}

export function sanitiseConnectorError(cause: unknown): string {
  const source = cause instanceof Error ? `${cause.name}: ${cause.message}` : 'Unknown connector error';
  return source
    .replace(/A(?:KI|SI)A[A-Z0-9]{16}/g, '[redacted-access-key]')
    .replace(/(secret|token|password|credential)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]')
    .slice(0, 2000);
}
