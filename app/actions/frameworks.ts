'use server';

import { z } from 'zod';
import crypto from 'node:crypto';
import { and, eq, isNotNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/client';
import { frameworkControls, frameworkImports } from '@/db/schema/frameworks';
import { CLASSIFICATION_RANK } from '@/db/schema/enums';
import { requireSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { requireFeature, featureForFramework } from '@/lib/licensing';
import { importFrameworkCatalogue } from '@/lib/frameworks/import';
import { getFrameworkByKey } from '@/lib/frameworks/registry';
import { fetchIsmCatalog } from '@/lib/frameworks/sources';
import { parseControlCsv } from '@/lib/frameworks/csv';
import { recordAudit } from '@/lib/audit/log';

export type FrameworkActionState = { ok: boolean; message: string };

async function requireFrameworkAdmin() {
  const session = await requireSession();
  const tenant = await resolveActiveTenant(session.user.id);
  if (!tenant) throw new Error('Create or join an organisation before managing frameworks.');
  await requirePermission(ACTIONS.tenantManageIsm, {
    userId: session.user.id,
    tenantId: tenant.tenantId,
  });
  return { session, tenantId: tenant.tenantId };
}

// Import an OSCAL catalogue for any framework from a URL. Works for frameworks
// whose source is an OSCAL catalogue (ISM, NIST 800-53). FedRAMP needs the
// baseline-profile resolver (Phase 3); SOC 2 / ISO 27001 use client CSV import.
const importUrlSchema = z.object({
  frameworkKey: z.string().min(1),
  url: z.string().url(),
});

export async function importFrameworkFromUrl(
  prevState: FrameworkActionState,
  formData: FormData,
): Promise<FrameworkActionState> {
  void prevState;
  try {
    const { session, tenantId } = await requireFrameworkAdmin();
    const data = importUrlSchema.parse({
      frameworkKey: formData.get('frameworkKey'),
      url: formData.get('url'),
    });

    const framework = await getFrameworkByKey(data.frameworkKey);
    if (!framework) throw new Error(`Unknown framework '${data.frameworkKey}'.`);
    if (framework.sourceKind === 'csv_client_import') {
      throw new Error(
        `${framework.label} uses client CSV import, not URL import (its control text is licensed to the client).`,
      );
    }

    const catalog = await fetchIsmCatalog(data.url);
    const result = await importFrameworkCatalogue({
      source: 'url',
      data: catalog,
      sourceUrl: data.url,
      frameworkKey: data.frameworkKey,
      triggeredBy: session.user.id,
    });

    await recordAudit({
      tenantId,
      actorUserId: session.user.id,
      action: 'framework.import',
      resourceType: 'framework_revision',
      resourceId: result.revision,
      afterJson: {
        frameworkKey: data.frameworkKey,
        sourceUrl: data.url,
        controlCount: result.count,
        sourceSha256: result.sourceSha256,
      },
    });

    revalidatePath('/admin/frameworks');
    revalidatePath('/engagements/new');
    return {
      ok: true,
      message: `Imported ${result.count} ${framework.label} controls at revision ${result.revision}.`,
    };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

// Import a client-supplied control set (SOC 2 / ISO 27001) from a CSV upload.
// Rows are stored TENANT-SCOPED so one client's licensed content never crosses
// the tenant boundary. We provide the format; the client supplies the text.
export async function importFrameworkCsv(
  prevState: FrameworkActionState,
  formData: FormData,
): Promise<FrameworkActionState> {
  void prevState;
  try {
    const { session, tenantId } = await requireFrameworkAdmin();

    const frameworkKey = String(formData.get('frameworkKey') ?? '');
    const framework = await getFrameworkByKey(frameworkKey);
    if (!framework) throw new Error(`Unknown framework '${frameworkKey}'.`);
    if (framework.sourceKind !== 'csv_client_import') {
      throw new Error(`${framework.label} is not a client-CSV framework.`);
    }

    // Feature-gate the framework (e.g. SOC2 / ISO27001 plan entitlement).
    await requireFeature(tenantId, featureForFramework(frameworkKey));

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      throw new Error('Attach a CSV file to import.');
    }
    const text = await file.text();
    const { rows, errors } = parseControlCsv(text);
    if (rows.length === 0) {
      throw new Error(errors[0] ?? 'No valid control rows found in the file.');
    }

    const revisionInput = String(formData.get('revision') ?? '').trim();
    const revision = revisionInput || `client-${new Date().toISOString().slice(0, 10)}`;
    const sourceSha256 = crypto
      .createHash('sha256')
      .update(Buffer.from(text))
      .digest('hex');

    await db.transaction(async (tx) => {
      for (const row of rows) {
        await tx
          .insert(frameworkControls)
          .values({
            frameworkId: framework.id,
            tenantId,
            controlId: row.controlId,
            revision,
            topic: row.topic,
            section: row.title,
            description: row.description,
            guidance: row.guidance,
            // Selection-mode frameworks ignore classification; default to the
            // lowest rank so every control is in scope until the assessor marks
            // applicability (SoA / TSC selection).
            minClassification: 'OFFICIAL',
            minClassificationRank: CLASSIFICATION_RANK.OFFICIAL,
            oscalRaw: {
              source: 'client_csv',
              defaultApplicable: row.defaultApplicable,
              row,
            } as never,
          })
          .onConflictDoUpdate({
            target: [
              frameworkControls.frameworkId,
              frameworkControls.tenantId,
              frameworkControls.controlId,
              frameworkControls.revision,
            ],
            targetWhere: isNotNull(frameworkControls.tenantId),
            set: {
              topic: row.topic,
              section: row.title,
              description: row.description,
              guidance: row.guidance,
              oscalRaw: {
                source: 'client_csv',
                defaultApplicable: row.defaultApplicable,
                row,
              } as never,
            },
          });
      }

      await tx
        .insert(frameworkImports)
        .values({
          frameworkId: framework.id,
          tenantId,
          revision,
          sourceUrl: `csv://${file.name}`,
          sourceSha256,
          controlCount: rows.length,
          triggeredBy: session.user.id,
          metadata: { filename: file.name, rowErrors: errors } as never,
        })
        .onConflictDoNothing();
    });

    await recordAudit({
      tenantId,
      actorUserId: session.user.id,
      action: 'framework.csv_import',
      resourceType: 'framework_revision',
      resourceId: revision,
      afterJson: {
        frameworkKey,
        revision,
        controlCount: rows.length,
        rowErrors: errors.length,
        sourceSha256,
      },
    });

    revalidatePath('/admin/frameworks');
    revalidatePath('/engagements/new');
    const errNote = errors.length > 0 ? ` ${errors.length} row(s) skipped.` : '';
    return {
      ok: true,
      message: `Imported ${rows.length} ${framework.label} control(s) at revision ${revision}.${errNote}`,
    };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
