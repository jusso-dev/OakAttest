'use server';

import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { auditLog } from '@/db/schema/audit';
import {
  assuranceConnectors,
  assuranceTestControlMappings,
  assuranceTestResults,
} from '@/db/schema/assurance-connectors';
import { engagements } from '@/db/schema/engagements';
import { engagementControls } from '@/db/schema/frameworks';
import { requireSession } from '@/lib/auth/session';
import { FEATURES, requireFeature } from '@/lib/licensing';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { connectorAdapter } from '@/lib/connectors/registry';
import { runAssuranceConnector, sanitiseConnectorError } from '@/lib/connectors/run';
import {
  connectorTestsForProvider,
  newConnectorExternalId,
  nextConnectorRun,
  parseConnectorConfig,
} from '@/lib/connectors/types';

async function contextForEngagement(engagementId: string) {
  const [engagement] = await db
    .select({ tenantId: engagements.tenantId })
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!engagement) throw new Error('Engagement not found.');
  return engagement;
}

const createSchema = z.object({
  engagementId: z.string().uuid(),
  name: z.string().min(2).max(120),
  roleArn: z.string().max(600),
  region: z.string().max(40),
  scheduleMinutes: z.coerce.number().int().min(15).max(43_200),
});

export async function createAwsSecurityHubConnector(input: z.input<typeof createSchema>) {
  const session = await requireSession();
  const data = createSchema.parse(input);
  const context = await contextForEngagement(data.engagementId);
  await requirePermission(ACTIONS.connectorManage, {
    userId: session.user.id,
    tenantId: context.tenantId,
    engagementId: data.engagementId,
  });
  await requireFeature(context.tenantId, 'INTEGRATIONS');
  const id = crypto.randomUUID();
  const configuration = parseConnectorConfig({
    provider: 'aws_security_hub',
    roleArn: data.roleArn,
    region: data.region,
    externalId: newConnectorExternalId(),
  });
  await db.transaction(async (tx) => {
    await tx.insert(assuranceConnectors).values({
      id,
      tenantId: context.tenantId,
      engagementId: data.engagementId,
      provider: configuration.provider,
      name: data.name,
      configuration,
      scheduleMinutes: data.scheduleMinutes,
      createdBy: session.user.id,
      updatedBy: session.user.id,
    });
    await tx.insert(auditLog).values({
      tenantId: context.tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'connector.create',
      resourceType: 'assurance_connector',
      resourceId: id,
      afterJson: {
        provider: configuration.provider,
        name: data.name,
        region: configuration.region,
        roleArn: configuration.roleArn,
        scheduleMinutes: data.scheduleMinutes,
      } as never,
    });
  });
  revalidate(data.engagementId);
  return { id, externalId: configuration.externalId };
}

const updateSchema = createSchema.extend({ connectorId: z.string().uuid() });

export async function updateAwsSecurityHubConnector(input: z.input<typeof updateSchema>) {
  const session = await requireSession();
  const data = updateSchema.parse(input);
  const { connector, tenantId } = await authorisedConnector(data, session.user.id, ACTIONS.connectorManage);
  await requireFeature(tenantId, 'INTEGRATIONS');
  const previous = parseConnectorConfig(connector.configuration);
  const configuration = parseConnectorConfig({
    provider: 'aws_security_hub',
    roleArn: data.roleArn,
    region: data.region,
    externalId: previous.externalId,
  });
  await db.transaction(async (tx) => {
    await tx
      .update(assuranceConnectors)
      .set({
        name: data.name,
        configuration,
        scheduleMinutes: data.scheduleMinutes,
        status: 'draft',
        nextRunAt: null,
        lastError: null,
        updatedBy: session.user.id,
        updatedAt: new Date(),
      })
      .where(and(eq(assuranceConnectors.id, connector.id), eq(assuranceConnectors.tenantId, tenantId)));
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'connector.update',
      resourceType: 'assurance_connector',
      resourceId: connector.id,
      beforeJson: { name: connector.name, roleArn: previous.roleArn, region: previous.region, scheduleMinutes: connector.scheduleMinutes } as never,
      afterJson: { name: data.name, roleArn: configuration.roleArn, region: configuration.region, scheduleMinutes: data.scheduleMinutes } as never,
    });
  });
  revalidate(data.engagementId);
  return { ok: true };
}

const connectorSchema = z.object({
  engagementId: z.string().uuid(),
  connectorId: z.string().uuid(),
});

export async function testAssuranceConnector(input: z.infer<typeof connectorSchema>) {
  const session = await requireSession();
  const data = connectorSchema.parse(input);
  const { connector, tenantId } = await authorisedConnector(data, session.user.id, ACTIONS.connectorManage);
  await requireFeature(tenantId, 'INTEGRATIONS');
  const config = parseConnectorConfig(connector.configuration);
  const testedAt = new Date();
  try {
    const result = await connectorAdapter(config.provider).testConnection(config);
    await db.transaction(async (tx) => {
      await tx
        .update(assuranceConnectors)
        .set({
          status: 'active',
          lastConnectionTestAt: testedAt,
          nextRunAt: nextConnectorRun(testedAt, connector.scheduleMinutes),
          lastError: null,
          updatedBy: session.user.id,
          updatedAt: testedAt,
        })
        .where(and(eq(assuranceConnectors.id, connector.id), eq(assuranceConnectors.tenantId, tenantId)));
      await tx.insert(auditLog).values({
        tenantId,
        engagementId: data.engagementId,
        actorUserId: session.user.id,
        action: 'connector.connection_test.passed',
        resourceType: 'assurance_connector',
        resourceId: connector.id,
        afterJson: { accountLabel: result.accountLabel } as never,
      });
    });
    revalidate(data.engagementId);
    return result;
  } catch (cause) {
    const error = sanitiseConnectorError(cause);
    await db.transaction(async (tx) => {
      await tx
        .update(assuranceConnectors)
        .set({ status: 'error', lastConnectionTestAt: testedAt, lastError: error, updatedBy: session.user.id, updatedAt: testedAt })
        .where(and(eq(assuranceConnectors.id, connector.id), eq(assuranceConnectors.tenantId, tenantId)));
      await tx.insert(auditLog).values({
        tenantId,
        engagementId: data.engagementId,
        actorUserId: session.user.id,
        action: 'connector.connection_test.failed',
        resourceType: 'assurance_connector',
        resourceId: connector.id,
        afterJson: { error } as never,
      });
    });
    revalidate(data.engagementId);
    throw new Error(error);
  }
}

export async function runAssuranceConnectorNow(input: z.infer<typeof connectorSchema>) {
  const session = await requireSession();
  const data = connectorSchema.parse(input);
  const { tenantId } = await authorisedConnector(data, session.user.id, ACTIONS.connectorRun);
  await requireFeature(tenantId, 'INTEGRATIONS');
  const result = await runAssuranceConnector({
    connectorId: data.connectorId,
    trigger: 'manual',
    requestedBy: session.user.id,
  });
  revalidate(data.engagementId);
  return result;
}

const reviewResultSchema = z.object({
  engagementId: z.string().uuid(),
  resultId: z.string().uuid(),
  status: z.enum(['accepted', 'rejected']),
  notes: z.string().max(2000).optional(),
});

export async function reviewAssuranceTestResult(input: z.infer<typeof reviewResultSchema>) {
  const session = await requireSession();
  const data = reviewResultSchema.parse(input);
  const context = await contextForEngagement(data.engagementId);
  await requirePermission(ACTIONS.evidenceReview, {
    userId: session.user.id,
    tenantId: context.tenantId,
    engagementId: data.engagementId,
  });
  await requireFeature(context.tenantId, 'INTEGRATIONS');
  const reviewedAt = new Date();
  const [result] = await db
    .update(assuranceTestResults)
    .set({
      reviewStatus: data.status,
      reviewNotes: data.notes || null,
      reviewedBy: session.user.id,
      reviewedAt,
    })
    .where(
      and(
        eq(assuranceTestResults.id, data.resultId),
        eq(assuranceTestResults.tenantId, context.tenantId),
        eq(assuranceTestResults.engagementId, data.engagementId),
      ),
    )
    .returning({ id: assuranceTestResults.id, outcome: assuranceTestResults.outcome });
  if (!result) throw new Error('Automated test result not found.');
  await db.insert(auditLog).values({
    tenantId: context.tenantId,
    engagementId: data.engagementId,
    actorUserId: session.user.id,
    action: 'connector.test_result.review',
    resourceType: 'assurance_test_result',
    resourceId: result.id,
    afterJson: { status: data.status, outcome: result.outcome, notes: data.notes ?? null } as never,
  });
  revalidate(data.engagementId);
  revalidatePath(`/engagements/${data.engagementId}/coverage`);
  return { ok: true };
}

export async function disableAssuranceConnector(input: z.infer<typeof connectorSchema>) {
  const session = await requireSession();
  const data = connectorSchema.parse(input);
  const { connector, tenantId } = await authorisedConnector(data, session.user.id, ACTIONS.connectorManage);
  await requireFeature(tenantId, 'INTEGRATIONS');
  await db.transaction(async (tx) => {
    await tx
      .update(assuranceConnectors)
      .set({ status: 'disabled', nextRunAt: null, updatedBy: session.user.id, updatedAt: new Date() })
      .where(and(eq(assuranceConnectors.id, connector.id), eq(assuranceConnectors.tenantId, tenantId)));
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'connector.disable',
      resourceType: 'assurance_connector',
      resourceId: connector.id,
    });
  });
  revalidate(data.engagementId);
  return { ok: true };
}

const mappingsSchema = connectorSchema.extend({
  mappings: z.array(z.object({
    testKey: z.string().min(2).max(160),
    frameworkControlIds: z.array(z.string().uuid()).max(200),
  })).max(20),
});

export async function replaceConnectorControlMappings(input: z.infer<typeof mappingsSchema>) {
  const session = await requireSession();
  const data = mappingsSchema.parse(input);
  const { connector, tenantId } = await authorisedConnector(data, session.user.id, ACTIONS.connectorManage);
  await requireFeature(tenantId, 'INTEGRATIONS');
  const config = parseConnectorConfig(connector.configuration);
  const allowedTests = new Set(connectorTestsForProvider(config.provider).map((test) => test.key));
  if (data.mappings.some((mapping) => !allowedTests.has(mapping.testKey))) {
    throw new Error('A connector test key is not supported by this provider.');
  }
  const requestedControls = Array.from(new Set(data.mappings.flatMap((mapping) => mapping.frameworkControlIds)));
  if (requestedControls.length) {
    const rows = await db
      .select({ id: engagementControls.frameworkControlId })
      .from(engagementControls)
      .where(
        and(
          eq(engagementControls.engagementId, data.engagementId),
          eq(engagementControls.tenantId, tenantId),
          inArray(engagementControls.frameworkControlId, requestedControls),
        ),
      );
    if (new Set(rows.map((row) => row.id)).size !== requestedControls.length) {
      throw new Error('Every mapped control must belong to this engagement.');
    }
  }
  const values = data.mappings.flatMap((mapping) => mapping.frameworkControlIds.map((frameworkControlId) => ({
    connectorId: connector.id,
    testKey: mapping.testKey,
    frameworkControlId,
    createdBy: session.user.id,
  })));
  await db.transaction(async (tx) => {
    await tx.delete(assuranceTestControlMappings).where(eq(assuranceTestControlMappings.connectorId, connector.id));
    if (values.length) await tx.insert(assuranceTestControlMappings).values(values);
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'connector.control_mappings.replace',
      resourceType: 'assurance_connector',
      resourceId: connector.id,
      afterJson: { mappingCount: values.length } as never,
    });
  });
  revalidate(data.engagementId);
  return { mappingCount: values.length };
}

async function authorisedConnector(
  data: { engagementId: string; connectorId: string },
  userId: string,
  action: typeof ACTIONS.connectorManage | typeof ACTIONS.connectorRun,
) {
  const context = await contextForEngagement(data.engagementId);
  await requirePermission(action, {
    userId,
    tenantId: context.tenantId,
    engagementId: data.engagementId,
  });
  if (action === ACTIONS.connectorRun) {
    await requireFeature(context.tenantId, FEATURES.INTEGRATIONS);
  }
  const [connector] = await db
    .select()
    .from(assuranceConnectors)
    .where(
      and(
        eq(assuranceConnectors.id, data.connectorId),
        eq(assuranceConnectors.tenantId, context.tenantId),
        eq(assuranceConnectors.engagementId, data.engagementId),
      ),
    )
    .limit(1);
  if (!connector) throw new Error('Connector not found.');
  return { connector, tenantId: context.tenantId };
}

function revalidate(engagementId: string) {
  revalidatePath(`/engagements/${engagementId}/connectors`);
}
