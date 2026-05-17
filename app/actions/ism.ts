'use server';

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { count, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { engagementControls, ismControls, ismImports } from '@/db/schema/ism';
import { requireSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { importIsmCatalogue } from '@/lib/ism/import';
import {
  fetchIsmCatalog,
  latestIsmCatalogUrl,
  releaseIsmCatalogUrl,
} from '@/lib/ism/sources';
import { recordAudit } from '@/lib/audit/log';

export type IsmActionState = {
  ok: boolean;
  message: string;
};

async function requireIsmAdmin() {
  const session = await requireSession();
  const tenant = await resolveActiveTenant(session.user.id);
  if (!tenant) throw new Error('Create or join an organisation before managing ISM controls.');

  await requirePermission(ACTIONS.tenantManageIsm, {
    userId: session.user.id,
    tenantId: tenant.tenantId,
  });

  return { session, tenantId: tenant.tenantId };
}

async function importFromSource(opts: {
  data: unknown;
  sourceUrl: string;
  source: 'url' | 'file';
  actorUserId: string;
  tenantId: string;
}) {
  const result = await importIsmCatalogue({
    source: opts.source,
    data: opts.data,
    sourceUrl: opts.sourceUrl,
    triggeredBy: opts.actorUserId,
  });

  await recordAudit({
    tenantId: opts.tenantId,
    actorUserId: opts.actorUserId,
    action: 'ism.import',
    resourceType: 'ism_revision',
    resourceId: result.revision,
    afterJson: {
      sourceUrl: opts.sourceUrl,
      controlCount: result.count,
      sourceSha256: result.sourceSha256,
    },
  });

  revalidatePath('/admin/ism');
  revalidatePath('/engagements/new');
  return {
    ok: true,
    message: `Imported ${result.count} ISM controls for revision ${result.revision}.`,
  };
}

export async function importLatestIsmControls(
  prevState: IsmActionState,
): Promise<IsmActionState> {
  void prevState;
  try {
    const { session, tenantId } = await requireIsmAdmin();
    const sourceUrl = latestIsmCatalogUrl();
    const data = await fetchIsmCatalog(sourceUrl);
    return importFromSource({
      data,
      sourceUrl,
      source: 'url',
      actorUserId: session.user.id,
      tenantId,
    });
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

const releaseSchema = z.object({
  release: z.string().regex(/^v?\d{4}\.\d{2}\.\d{1,2}$/, 'Select a valid ACSC release.'),
});

export async function importSpecificIsmRelease(
  prevState: IsmActionState,
  formData: FormData,
): Promise<IsmActionState> {
  void prevState;
  try {
    const { session, tenantId } = await requireIsmAdmin();
    const data = releaseSchema.parse({ release: formData.get('release') });
    const sourceUrl = releaseIsmCatalogUrl(data.release);
    const catalog = await fetchIsmCatalog(sourceUrl);
    return importFromSource({
      data: catalog,
      sourceUrl,
      source: 'url',
      actorUserId: session.user.id,
      tenantId,
    });
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function seedBundledIsmControls(
  prevState: IsmActionState,
): Promise<IsmActionState> {
  void prevState;
  try {
    const { session, tenantId } = await requireIsmAdmin();
    const filePath = resolve(process.cwd(), 'db/seed/ism-sample.json');
    const data = JSON.parse(await readFile(filePath, 'utf8'));
    return importFromSource({
      data,
      sourceUrl: `file://${filePath}`,
      source: 'file',
      actorUserId: session.user.id,
      tenantId,
    });
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

const removeSchema = z.object({
  revision: z.string().min(1),
});

export async function removeIsmRevision(
  prevState: IsmActionState,
  formData: FormData,
): Promise<IsmActionState> {
  void prevState;
  try {
    const { session, tenantId } = await requireIsmAdmin();
    const data = removeSchema.parse({ revision: formData.get('revision') });

    const [{ value: references }] = await db
      .select({ value: count() })
      .from(engagementControls)
      .where(eq(engagementControls.revision, data.revision));

    if (references > 0) {
      return {
        ok: false,
        message: `Cannot remove ${data.revision}; ${references} engagement control rows still reference it.`,
      };
    }

    try {
      await db.transaction(async (tx) => {
        await tx.delete(ismImports).where(eq(ismImports.revision, data.revision));
        await tx.delete(ismControls).where(eq(ismControls.revision, data.revision));
      });
    } catch {
      return {
        ok: false,
        message:
          'Cannot remove this revision while controls are referenced by evidence, findings, interviews, or engagements.',
      };
    }

    await recordAudit({
      tenantId,
      actorUserId: session.user.id,
      action: 'ism.remove_revision',
      resourceType: 'ism_revision',
      resourceId: data.revision,
    });

    revalidatePath('/admin/ism');
    revalidatePath('/engagements/new');
    return { ok: true, message: `Removed ISM revision ${data.revision}.` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
