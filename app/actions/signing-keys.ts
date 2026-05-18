'use server';

import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import crypto from 'node:crypto';
import { db } from '@/lib/db/client';
import { tenantSigningKeys } from '@/db/schema/certification';
import { auditLog } from '@/db/schema/audit';
import { requireSession } from '@/lib/auth/session';
import { ACTIONS } from '@/lib/rbac/matrix';
import { requirePermission } from '@/lib/rbac/require';
import { fetchKmsPublicKey } from '@/lib/security/signing';

const registerSchema = z.object({
  tenantId: z.string().uuid(),
  kmsKeyArn: z
    .string()
    .regex(
      /^arn:[^:]+:kms:[^:]+:\d{12}:key\/[0-9a-fA-F-]{36}$/,
      'Enter a valid AWS KMS asymmetric key ARN.',
    ),
});

const revokeSchema = z.object({
  tenantId: z.string().uuid(),
  keyId: z.string().uuid(),
});

export async function registerTenantKmsSigningKey(input: z.infer<typeof registerSchema>) {
  const session = await requireSession();
  const data = registerSchema.parse(input);

  await requirePermission(ACTIONS.tenantManage, {
    userId: session.user.id,
    tenantId: data.tenantId,
  });

  const { publicKey, fingerprint } = await fetchKmsPublicKey(data.kmsKeyArn);
  const now = new Date();
  const hdrs = await headers();
  const id = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx
      .update(tenantSigningKeys)
      .set({ rotatedAt: now })
      .where(
        and(
          eq(tenantSigningKeys.tenantId, data.tenantId),
          isNull(tenantSigningKeys.rotatedAt),
          isNull(tenantSigningKeys.revokedAt),
        ),
      );
    await tx.insert(tenantSigningKeys).values({
      id,
      tenantId: data.tenantId,
      keyType: 'aws_kms_asymmetric_rsa_pss_sha256',
      publicKey,
      kmsKeyArn: data.kmsKeyArn,
      fingerprint,
    });
    await tx.insert(auditLog).values({
      tenantId: data.tenantId,
      actorType: 'user',
      actorUserId: session.user.id,
      actorIp: hdrs.get('x-forwarded-for'),
      actorUserAgent: hdrs.get('user-agent'),
      action: 'tenant.signing_key.register',
      resourceType: 'tenant_signing_key',
      resourceId: id,
      afterJson: { fingerprint, kmsKeyArn: redactKmsArn(data.kmsKeyArn) } as never,
    });
  });

  revalidatePath('/admin');
  return { id, fingerprint };
}

export async function revokeTenantSigningKey(input: z.infer<typeof revokeSchema>) {
  const session = await requireSession();
  const data = revokeSchema.parse(input);

  await requirePermission(ACTIONS.tenantManage, {
    userId: session.user.id,
    tenantId: data.tenantId,
  });

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(tenantSigningKeys)
      .set({ revokedAt: now })
      .where(and(eq(tenantSigningKeys.id, data.keyId), eq(tenantSigningKeys.tenantId, data.tenantId)));
    await tx.insert(auditLog).values({
      tenantId: data.tenantId,
      actorType: 'user',
      actorUserId: session.user.id,
      action: 'tenant.signing_key.revoke',
      resourceType: 'tenant_signing_key',
      resourceId: data.keyId,
      afterJson: { revokedAt: now.toISOString() } as never,
    });
  });

  revalidatePath('/admin');
  return { ok: true };
}

function redactKmsArn(arn: string): string {
  const parts = arn.split('/');
  if (parts.length < 2) return arn;
  return `${parts[0]}/${parts[1].slice(0, 8)}...`;
}
