'use server';

import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/client';
import { auditLog } from '@/db/schema/audit';
import { MCP_SCOPES, mcpApiTokens } from '@/db/schema/mcp';
import { requireSession } from '@/lib/auth/session';
import { createMcpTokenSecret } from '@/lib/mcp/auth';
import { ACTIONS } from '@/lib/rbac/matrix';
import { requirePermission } from '@/lib/rbac/require';
import { FEATURES, requireFeature } from '@/lib/licensing';

const createSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  expiresInDays: z.number().int().min(1).max(365),
});

export async function createMcpApiToken(input: z.infer<typeof createSchema>) {
  const session = await requireSession();
  const data = createSchema.parse(input);
  await requirePermission(ACTIONS.tenantManage, {
    userId: session.user.id,
    tenantId: data.tenantId,
  });
  await requireFeature(data.tenantId, FEATURES.API_ACCESS);

  const secret = createMcpTokenSecret();
  const expiresAt = new Date(Date.now() + data.expiresInDays * 86_400_000);
  const [record] = await db
    .insert(mcpApiTokens)
    .values({
      tenantId: data.tenantId,
      actorUserId: session.user.id,
      name: data.name,
      tokenPrefix: secret.prefix,
      tokenHash: secret.hash,
      scopes: [...MCP_SCOPES],
      expiresAt,
      createdBy: session.user.id,
    })
    .returning({ id: mcpApiTokens.id });

  await db.insert(auditLog).values({
    tenantId: data.tenantId,
    actorUserId: session.user.id,
    action: 'mcp.token.create',
    resourceType: 'mcp_api_token',
    resourceId: record.id,
    afterJson: { name: data.name, scopes: MCP_SCOPES, expiresAt: expiresAt.toISOString() } as never,
  });
  revalidatePath('/admin');
  return { id: record.id, token: secret.token, expiresAt: expiresAt.toISOString() };
}

const revokeSchema = z.object({ tenantId: z.string().uuid(), tokenId: z.string().uuid() });

export async function revokeMcpApiToken(input: z.infer<typeof revokeSchema>) {
  const session = await requireSession();
  const data = revokeSchema.parse(input);
  await requirePermission(ACTIONS.tenantManage, {
    userId: session.user.id,
    tenantId: data.tenantId,
  });

  const [record] = await db
    .update(mcpApiTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(mcpApiTokens.id, data.tokenId),
        eq(mcpApiTokens.tenantId, data.tenantId),
        isNull(mcpApiTokens.revokedAt),
      ),
    )
    .returning({ id: mcpApiTokens.id });
  if (!record) throw new Error('MCP token not found or already revoked.');

  await db.insert(auditLog).values({
    tenantId: data.tenantId,
    actorUserId: session.user.id,
    action: 'mcp.token.revoke',
    resourceType: 'mcp_api_token',
    resourceId: data.tokenId,
  });
  revalidatePath('/admin');
  return { ok: true };
}
