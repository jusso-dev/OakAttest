import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { requireSession } from '@/lib/auth/session';
import { ACTIONS } from '@/lib/rbac/matrix';
import { requirePermission } from '@/lib/rbac/require';
import { syncAvailableIsmReleases } from '@/lib/ism/sync';

export const runtime = 'nodejs';

function isValidCronSecret(secret: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  if (!secret || !expected) return false;
  if (secret.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
}

async function requireCronOrIsmAdmin(request: NextRequest) {
  if (isValidCronSecret(request.headers.get('x-cron-secret'))) return;

  const session = await requireSession();
  const tenant = await resolveActiveTenant(session.user.id);
  if (!tenant) throw new Error('Create or join an organisation before syncing ISM releases.');

  await requirePermission(ACTIONS.tenantManageIsm, {
    userId: session.user.id,
    tenantId: tenant.tenantId,
  });
}

export async function POST(request: NextRequest) {
  try {
    await requireCronOrIsmAdmin(request);
    const result = await syncAvailableIsmReleases();
    return NextResponse.json(result, { status: result.errorCount > 0 ? 207 : 200 });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes('Authentication required') ? 401 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}
