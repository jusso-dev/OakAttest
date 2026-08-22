'use server';

import { z } from 'zod';
import crypto from 'node:crypto';
import { and, count, eq, gt, isNotNull, isNull, lte, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/client';
import { frameworkControls, frameworkImports, frameworkPacks, frameworks } from '@/db/schema/frameworks';
import { CLASSIFICATION_RANK } from '@/db/schema/enums';
import { requireSession } from '@/lib/auth/session';
import { requirePlatformAdmin } from '@/lib/auth/platform';
import { userTimeZone } from '@/lib/auth/user-timezone';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { requireFeature, featureForFramework } from '@/lib/licensing';
import { importFrameworkCatalogue } from '@/lib/frameworks/import';
import { getFrameworkByKey, selectPreferredFrameworkPack } from '@/lib/frameworks/registry';
import { fetchIsmCatalog } from '@/lib/frameworks/sources';
import { parseControlCsv } from '@/lib/frameworks/csv';
import {
  assertFrameworkPackTransition,
  resolveOscalProfile,
  validateCustomFrameworkDefinition,
  validatePackDates,
} from '@/lib/frameworks/profile';
import { recordAudit } from '@/lib/audit/log';
import { zonedDateEndToUtc, zonedDateTimeToUtc } from '@/lib/timezone';

export type FrameworkActionState = { ok: boolean; message: string };

async function requireFrameworkAdmin() {
  const session = await requireSession();
  const tenant = await resolveActiveTenant(session.user.id);
  if (!tenant) throw new Error('Create or join an organisation before managing frameworks.');
  await requirePermission(ACTIONS.frameworkPackManage, {
    userId: session.user.id,
    tenantId: tenant.tenantId,
  });
  return { session, tenantId: tenant.tenantId };
}

// Import an OSCAL catalogue for any framework from a URL. Works for frameworks
// whose source is an OSCAL catalogue (ISM, NIST 800-53). FedRAMP needs the
// baseline-profile resolver; selection frameworks use tenant CSV import.
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

    const framework = await getFrameworkByKey(data.frameworkKey, tenantId);
    if (!framework) throw new Error(`Unknown framework '${data.frameworkKey}'.`);
    if (framework.tenantId !== null) throw new Error('Tenant-authored frameworks cannot use global URL import.');
    if (framework.sourceKind === 'csv_client_import') {
      throw new Error(
        `${framework.label} uses client CSV import, not URL import (its control text is licensed to the client).`,
      );
    }
    await requirePlatformAdmin(session.user.id);

    const catalog = await fetchIsmCatalog(data.url);
    const result = await importFrameworkCatalogue({
      source: 'url',
      data: catalog,
      sourceUrl: data.url,
      frameworkKey: data.frameworkKey,
      triggeredBy: session.user.id,
    });

    await db.insert(frameworkPacks).values({
      frameworkId: framework.id,
      tenantId: null,
      revision: result.revision,
      label: `${framework.label} ${result.revision}`,
      status: 'active',
      sourceKind: 'official_catalogue',
      sourceUrl: data.url,
      sourceSha256: result.sourceSha256,
      controlCount: result.count,
      effectiveAt: new Date(),
      activatedAt: new Date(),
      authoredBy: session.user.id,
      approvedBy: session.user.id,
      metadata: { frameworkKey: data.frameworkKey } as never,
    }).onConflictDoUpdate({
      target: [frameworkPacks.frameworkId, frameworkPacks.revision],
      targetWhere: isNull(frameworkPacks.tenantId),
      set: {
        label: `${framework.label} ${result.revision}`,
        status: 'active',
        sourceUrl: data.url,
        sourceSha256: result.sourceSha256,
        controlCount: result.count,
        activatedAt: new Date(),
        updatedAt: new Date(),
      },
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
    const framework = await getFrameworkByKey(frameworkKey, tenantId);
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
    if (file.size > 5 * 1024 * 1024) throw new Error('Framework CSV files must be 5 MB or smaller.');
    const text = await file.text();
    const { rows, errors } = parseControlCsv(text);
    if (rows.length === 0) {
      throw new Error(errors[0] ?? 'No valid control rows found in the file.');
    }

    if (rows.length > 5_000) throw new Error('Framework CSV files may contain at most 5,000 valid controls.');
    const revisionInput = String(formData.get('revision') ?? '').trim();
    const revision = z.string().min(1).max(160).parse(
      revisionInput || `client-${new Date().toISOString().slice(0, 10)}`,
    );
    const sourceSha256 = crypto
      .createHash('sha256')
      .update(Buffer.from(text))
      .digest('hex');

    const [existingPack] = await db.select({ sourceSha256: frameworkPacks.sourceSha256 }).from(frameworkPacks).where(and(
      eq(frameworkPacks.frameworkId, framework.id),
      eq(frameworkPacks.tenantId, tenantId),
      eq(frameworkPacks.revision, revision),
    )).limit(1);
    if (existingPack) {
      if (existingPack.sourceSha256 === sourceSha256) {
        return { ok: true, message: `${framework.label} ${revision} is already loaded with identical content.` };
      }
      throw new Error(`Framework revision ${revision} already exists. Use a new revision so existing assessments remain immutable.`);
    }

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
      await tx.insert(frameworkPacks).values({
        frameworkId: framework.id,
        tenantId,
        revision,
        label: `${framework.label} ${revision}`,
        status: 'active',
        sourceKind: 'tenant_csv',
        sourceUrl: `csv://${file.name}`,
        sourceSha256,
        controlCount: rows.length,
        effectiveAt: new Date(),
        activatedAt: new Date(),
        authoredBy: session.user.id,
        approvedBy: session.user.id,
        metadata: { filename: file.name, rowErrors: errors } as never,
      }).onConflictDoUpdate({
        target: [frameworkPacks.frameworkId, frameworkPacks.tenantId, frameworkPacks.revision],
        targetWhere: isNotNull(frameworkPacks.tenantId),
        set: {
          label: `${framework.label} ${revision}`,
          status: 'active',
          sourceUrl: `csv://${file.name}`,
          sourceSha256,
          controlCount: rows.length,
          activatedAt: new Date(),
          updatedAt: new Date(),
          metadata: { filename: file.name, rowErrors: errors } as never,
        },
      });
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

const profileImportSchema = z.object({
  targetFrameworkKey: z.string().trim().min(1).max(80),
  baseFrameworkKey: z.string().trim().min(1).max(80),
  baseRevision: z.string().trim().min(1).max(160),
  revision: z.string().trim().min(1).max(160),
  label: z.string().trim().min(3).max(240),
  description: z.string().trim().max(4_000).optional(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// Resolve an uploaded NIST/FedRAMP OSCAL profile against a loaded base
// catalogue, then materialise a tenant-private revision. Tenant A can never
// mutate or select Tenant B's resolved baseline.
export async function importFrameworkProfile(
  prevState: FrameworkActionState,
  formData: FormData,
): Promise<FrameworkActionState> {
  void prevState;
  try {
    const { session, tenantId } = await requireFrameworkAdmin();
    const data = profileImportSchema.parse({
      targetFrameworkKey: formData.get('targetFrameworkKey'),
      baseFrameworkKey: formData.get('baseFrameworkKey'),
      baseRevision: formData.get('baseRevision'),
      revision: formData.get('revision'),
      label: formData.get('label'),
      description: formData.get('description') || undefined,
      effectiveDate: formData.get('effectiveDate'),
      expiryDate: formData.get('expiryDate') || undefined,
    });
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) throw new Error('Attach an OSCAL profile JSON file.');
    if (file.size > 5 * 1024 * 1024) throw new Error('OSCAL profile files must be 5 MB or smaller.');

    const [targetFramework, baseFramework] = await Promise.all([
      getFrameworkByKey(data.targetFrameworkKey, tenantId),
      getFrameworkByKey(data.baseFrameworkKey, tenantId),
    ]);
    if (!targetFramework || !baseFramework) throw new Error('Target or base framework was not found.');
    if (targetFramework.scopingMode !== 'baseline_profile') {
      throw new Error(`${targetFramework.label} does not use OSCAL baseline profiles.`);
    }
    await requireFeature(tenantId, featureForFramework(targetFramework.key));
    const [existingPack] = await db.select({ id: frameworkPacks.id }).from(frameworkPacks).where(and(
      eq(frameworkPacks.frameworkId, targetFramework.id),
      eq(frameworkPacks.tenantId, tenantId),
      eq(frameworkPacks.revision, data.revision),
    )).limit(1);
    if (existingPack) throw new Error('That framework pack revision already exists for this tenant.');

    const now = new Date();
    const availableBasePacks = await db.select({ tenantId: frameworkPacks.tenantId }).from(frameworkPacks).where(and(
      eq(frameworkPacks.frameworkId, baseFramework.id),
      eq(frameworkPacks.revision, data.baseRevision),
      eq(frameworkPacks.status, 'active'),
      or(isNull(frameworkPacks.tenantId), eq(frameworkPacks.tenantId, tenantId)),
      or(isNull(frameworkPacks.effectiveAt), lte(frameworkPacks.effectiveAt, now)),
      or(isNull(frameworkPacks.expiresAt), gt(frameworkPacks.expiresAt, now)),
    )).limit(2);
    const basePack = selectPreferredFrameworkPack(availableBasePacks, tenantId);
    if (!basePack) throw new Error('Selected base catalogue pack is not active, current, or available to this tenant.');

    const baseRows = await db.select().from(frameworkControls).where(and(
      eq(frameworkControls.frameworkId, baseFramework.id),
      eq(frameworkControls.revision, data.baseRevision),
      basePack.tenantId === null
        ? isNull(frameworkControls.tenantId)
        : eq(frameworkControls.tenantId, tenantId),
    ));
    if (baseRows.length === 0) throw new Error('Selected base catalogue revision has no controls.');
    const baseByControl = new Map(baseRows.map((row) => [row.controlId, row]));

    let document: unknown;
    const profileText = await file.text();
    try {
      document = JSON.parse(profileText) as unknown;
    } catch {
      throw new Error('OSCAL profile file is not valid JSON.');
    }
    const resolved = resolveOscalProfile(document, Array.from(baseByControl.values()), profileText);
    const selected = resolved.controlIds.map((controlId) => baseByControl.get(controlId)).filter((row) => row !== undefined);
    const timeZone = await userTimeZone(session.user.id);
    const effectiveAt = zonedDateTimeToUtc(`${data.effectiveDate}T00:00:00`, timeZone);
    const expiresAt = data.expiryDate ? zonedDateEndToUtc(data.expiryDate, timeZone) : null;
    validatePackDates(effectiveAt, expiresAt);
    const packId = crypto.randomUUID();

    await db.transaction(async (tx) => {
      await tx.insert(frameworkControls).values(selected.map((control) => ({
        frameworkId: targetFramework.id,
        tenantId,
        controlId: control.controlId,
        revision: data.revision,
        topic: control.topic,
        section: control.section,
        description: control.description,
        guidance: control.guidance,
        minClassification: 'OFFICIAL' as const,
        minClassificationRank: CLASSIFICATION_RANK.OFFICIAL,
        essentialEightMapping: null,
        oscalRaw: {
          source: 'oscal_profile',
          baseFrameworkKey: baseFramework.key,
          baseRevision: data.baseRevision,
          baseControlId: control.controlId,
          baseControl: control.oscalRaw,
          profileSourceSha256: resolved.sourceSha256,
        } as never,
      })));
      await tx.insert(frameworkPacks).values({
        id: packId,
        frameworkId: targetFramework.id,
        tenantId,
        revision: data.revision,
        label: data.label,
        description: data.description || resolved.title,
        status: 'active',
        sourceKind: 'oscal_profile',
        sourceUrl: profileSourceUrl(document) ?? `profile://${file.name}`,
        sourceSha256: resolved.sourceSha256,
        baseFrameworkId: baseFramework.id,
        baseRevision: data.baseRevision,
        controlCount: selected.length,
        effectiveAt,
        expiresAt,
        metadata: {
          profileTitle: resolved.title,
          profileVersion: resolved.version,
          profileLastModified: resolved.lastModified,
          profileModify: resolved.modifications,
          warnings: resolved.warnings,
          filename: file.name,
        } as never,
        authoredBy: session.user.id,
        approvedBy: session.user.id,
        activatedAt: new Date(),
      });
      await tx.insert(frameworkImports).values({
        frameworkId: targetFramework.id,
        tenantId,
        revision: data.revision,
        sourceUrl: profileSourceUrl(document) ?? `profile://${file.name}`,
        sourceSha256: resolved.sourceSha256,
        controlCount: selected.length,
        triggeredBy: session.user.id,
        metadata: {
          sourceKind: 'oscal_profile',
          packId,
          baseFrameworkKey: baseFramework.key,
          baseRevision: data.baseRevision,
          warnings: resolved.warnings,
          filename: file.name,
        } as never,
      });
    });
    await recordAudit({
      tenantId,
      actorUserId: session.user.id,
      action: 'framework.profile.resolve',
      resourceType: 'framework_pack',
      resourceId: packId,
      afterJson: {
        targetFrameworkKey: targetFramework.key,
        baseFrameworkKey: baseFramework.key,
        baseRevision: data.baseRevision,
        revision: data.revision,
        controlCount: selected.length,
        sourceSha256: resolved.sourceSha256,
        warnings: resolved.warnings,
        effectiveAt: effectiveAt.toISOString(),
        expiresAt: expiresAt?.toISOString() ?? null,
        timeZone,
      },
    });
    revalidateFrameworks();
    return {
      ok: true,
      message: `Activated ${data.label} with ${selected.length} controls.${resolved.warnings.length ? ` ${resolved.warnings.join(' ')}` : ''}`,
    };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

const customFrameworkSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(240),
  revision: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(4_000),
});

export async function createCustomFramework(
  prevState: FrameworkActionState,
  formData: FormData,
): Promise<FrameworkActionState> {
  void prevState;
  try {
    const { session, tenantId } = await requireFrameworkAdmin();
    await requireFeature(tenantId, featureForFramework('custom'));
    const raw = customFrameworkSchema.parse({
      key: formData.get('key'),
      label: formData.get('label'),
      revision: formData.get('revision'),
      description: formData.get('description'),
    });
    const data = validateCustomFrameworkDefinition(raw);
    if (await getFrameworkByKey(data.key, tenantId)) {
      throw new Error(`Framework key '${data.key}' already exists.`);
    }
    const frameworkId = crypto.randomUUID();
    const packId = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(frameworks).values({
        id: frameworkId,
        tenantId,
        key: data.key,
        label: data.label,
        description: data.description,
        authority: 'Tenant-authored',
        lifecycleStatus: 'draft',
        scopingMode: 'selection',
        sourceKind: 'custom_builder',
        sourceConfig: { packId } as never,
        overlays: [],
        classificationScheme: null,
        createdBy: session.user.id,
      });
      await tx.insert(frameworkPacks).values({
        id: packId,
        frameworkId,
        tenantId,
        revision: data.revision,
        label: `${data.label} ${data.revision}`,
        description: data.description,
        status: 'draft',
        sourceKind: 'custom_builder',
        controlCount: 0,
        authoredBy: session.user.id,
      });
    });
    await recordAudit({
      tenantId,
      actorUserId: session.user.id,
      action: 'framework.custom.create',
      resourceType: 'framework_pack',
      resourceId: packId,
      afterJson: { frameworkId, key: data.key, label: data.label, revision: data.revision },
    });
    revalidateFrameworks();
    return { ok: true, message: `Created draft framework ${data.label} ${data.revision}.` };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

const customControlSchema = z.object({
  packId: z.string().uuid(),
  controlId: z.string().trim().min(1).max(120),
  title: z.string().trim().min(3).max(240),
  description: z.string().trim().min(10).max(12_000),
  topic: z.string().trim().max(240).optional(),
  guidance: z.string().trim().max(12_000).optional(),
  defaultApplicable: z.enum(['true', 'false']),
});

export async function upsertCustomFrameworkControl(
  prevState: FrameworkActionState,
  formData: FormData,
): Promise<FrameworkActionState> {
  void prevState;
  try {
    const { session, tenantId } = await requireFrameworkAdmin();
    const data = customControlSchema.parse({
      packId: formData.get('packId'),
      controlId: formData.get('controlId'),
      title: formData.get('title'),
      description: formData.get('description'),
      topic: formData.get('topic') || undefined,
      guidance: formData.get('guidance') || undefined,
      defaultApplicable: formData.get('defaultApplicable'),
    });
    const pack = await requireTenantPack(data.packId, tenantId);
    if (pack.sourceKind !== 'custom_builder' || pack.status !== 'draft') {
      throw new Error('Only draft custom packs can be edited.');
    }
    await db.transaction(async (tx) => {
      await tx.insert(frameworkControls).values({
        frameworkId: pack.frameworkId,
        tenantId,
        controlId: data.controlId,
        revision: pack.revision,
        topic: data.topic || null,
        section: data.title,
        description: data.description,
        guidance: data.guidance || null,
        minClassification: 'OFFICIAL',
        minClassificationRank: CLASSIFICATION_RANK.OFFICIAL,
        oscalRaw: {
          source: 'custom_builder',
          defaultApplicable: data.defaultApplicable === 'true',
          authoredBy: session.user.id,
        } as never,
      }).onConflictDoUpdate({
        target: [
          frameworkControls.frameworkId,
          frameworkControls.tenantId,
          frameworkControls.controlId,
          frameworkControls.revision,
        ],
        targetWhere: isNotNull(frameworkControls.tenantId),
        set: {
          topic: data.topic || null,
          section: data.title,
          description: data.description,
          guidance: data.guidance || null,
          oscalRaw: {
            source: 'custom_builder',
            defaultApplicable: data.defaultApplicable === 'true',
            authoredBy: session.user.id,
          } as never,
          importedAt: new Date(),
        },
      });
      const [controlCount] = await tx.select({ value: count() }).from(frameworkControls).where(and(
        eq(frameworkControls.frameworkId, pack.frameworkId),
        eq(frameworkControls.tenantId, tenantId),
        eq(frameworkControls.revision, pack.revision),
      ));
      await tx.update(frameworkPacks).set({ controlCount: controlCount.value, updatedAt: new Date() }).where(and(
        eq(frameworkPacks.id, pack.id),
        eq(frameworkPacks.tenantId, tenantId),
      ));
    });
    await recordAudit({
      tenantId,
      actorUserId: session.user.id,
      action: 'framework.custom.control_upsert',
      resourceType: 'framework_control',
      resourceId: data.controlId,
      afterJson: { packId: pack.id, frameworkId: pack.frameworkId, revision: pack.revision },
    });
    revalidateFrameworks();
    return { ok: true, message: `Saved control ${data.controlId}.` };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

const deleteCustomControlSchema = z.object({
  packId: z.string().uuid(),
  controlId: z.string().trim().min(1).max(120),
});

export async function deleteCustomFrameworkControl(
  prevState: FrameworkActionState,
  formData: FormData,
): Promise<FrameworkActionState> {
  void prevState;
  try {
    const { session, tenantId } = await requireFrameworkAdmin();
    const data = deleteCustomControlSchema.parse({
      packId: formData.get('packId'),
      controlId: formData.get('controlId'),
    });
    const pack = await requireTenantPack(data.packId, tenantId);
    if (pack.sourceKind !== 'custom_builder' || pack.status !== 'draft') {
      throw new Error('Only draft custom packs can be edited.');
    }
    await db.transaction(async (tx) => {
      const removed = await tx.delete(frameworkControls).where(and(
        eq(frameworkControls.frameworkId, pack.frameworkId),
        eq(frameworkControls.tenantId, tenantId),
        eq(frameworkControls.revision, pack.revision),
        eq(frameworkControls.controlId, data.controlId),
      )).returning({ id: frameworkControls.id });
      if (removed.length === 0) throw new Error('Custom control was not found in this draft pack.');
      const [controlCount] = await tx.select({ value: count() }).from(frameworkControls).where(and(
        eq(frameworkControls.frameworkId, pack.frameworkId),
        eq(frameworkControls.tenantId, tenantId),
        eq(frameworkControls.revision, pack.revision),
      ));
      await tx.update(frameworkPacks).set({ controlCount: controlCount.value, updatedAt: new Date() }).where(and(
        eq(frameworkPacks.id, pack.id),
        eq(frameworkPacks.tenantId, tenantId),
      ));
    });
    await recordAudit({
      tenantId,
      actorUserId: session.user.id,
      action: 'framework.custom.control_delete',
      resourceType: 'framework_control',
      resourceId: data.controlId,
      beforeJson: { packId: pack.id, frameworkId: pack.frameworkId, revision: pack.revision },
    });
    revalidateFrameworks();
    return { ok: true, message: `Removed control ${data.controlId}.` };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

const customRevisionSchema = z.object({
  packId: z.string().uuid(),
  revision: z.string().trim().min(1).max(160),
});

export async function createCustomFrameworkRevision(
  prevState: FrameworkActionState,
  formData: FormData,
): Promise<FrameworkActionState> {
  void prevState;
  try {
    const { session, tenantId } = await requireFrameworkAdmin();
    const data = customRevisionSchema.parse({
      packId: formData.get('packId'),
      revision: formData.get('revision'),
    });
    const sourcePack = await requireTenantPack(data.packId, tenantId);
    if (sourcePack.sourceKind !== 'custom_builder' || sourcePack.status === 'draft') {
      throw new Error('Create a new revision from an active or retired custom pack.');
    }
    const [existing] = await db.select({ id: frameworkPacks.id }).from(frameworkPacks).where(and(
      eq(frameworkPacks.frameworkId, sourcePack.frameworkId),
      eq(frameworkPacks.tenantId, tenantId),
      eq(frameworkPacks.revision, data.revision),
    )).limit(1);
    if (existing) throw new Error('That custom framework revision already exists.');

    const controls = await db.select().from(frameworkControls).where(and(
      eq(frameworkControls.frameworkId, sourcePack.frameworkId),
      eq(frameworkControls.tenantId, tenantId),
      eq(frameworkControls.revision, sourcePack.revision),
    ));
    if (controls.length === 0) throw new Error('Source pack has no controls to copy.');
    const packId = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(frameworkControls).values(controls.map((control) => ({
        frameworkId: sourcePack.frameworkId,
        tenantId,
        controlId: control.controlId,
        revision: data.revision,
        topic: control.topic,
        section: control.section,
        description: control.description,
        guidance: control.guidance,
        minClassification: control.minClassification,
        minClassificationRank: control.minClassificationRank,
        essentialEightMapping: control.essentialEightMapping,
        oscalRaw: control.oscalRaw,
      })));
      await tx.insert(frameworkPacks).values({
        id: packId,
        frameworkId: sourcePack.frameworkId,
        tenantId,
        revision: data.revision,
        label: `${sourcePack.frameworkLabel} ${data.revision}`,
        description: `Draft revision cloned from ${sourcePack.revision}.`,
        status: 'draft',
        sourceKind: 'custom_builder',
        baseFrameworkId: sourcePack.frameworkId,
        baseRevision: sourcePack.revision,
        controlCount: controls.length,
        authoredBy: session.user.id,
        metadata: { clonedFromPackId: sourcePack.id } as never,
      });
    });
    await recordAudit({
      tenantId,
      actorUserId: session.user.id,
      action: 'framework.custom.revision_create',
      resourceType: 'framework_pack',
      resourceId: packId,
      afterJson: {
        frameworkId: sourcePack.frameworkId,
        revision: data.revision,
        clonedFromRevision: sourcePack.revision,
        controlCount: controls.length,
      },
    });
    revalidateFrameworks();
    return { ok: true, message: `Created draft ${sourcePack.frameworkLabel} ${data.revision} with ${controls.length} copied controls.` };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

const activatePackSchema = z.object({
  packId: z.string().uuid(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function activateCustomFrameworkPack(
  prevState: FrameworkActionState,
  formData: FormData,
): Promise<FrameworkActionState> {
  void prevState;
  try {
    const { session, tenantId } = await requireFrameworkAdmin();
    const data = activatePackSchema.parse({
      packId: formData.get('packId'),
      effectiveDate: formData.get('effectiveDate'),
      expiryDate: formData.get('expiryDate') || undefined,
    });
    const pack = await requireTenantPack(data.packId, tenantId);
    if (pack.sourceKind !== 'custom_builder') throw new Error('Only custom builder packs use this activation flow.');
    assertFrameworkPackTransition(pack.status, 'active');
    const controls = await db.select({
      controlId: frameworkControls.controlId,
      description: frameworkControls.description,
      guidance: frameworkControls.guidance,
      topic: frameworkControls.topic,
      section: frameworkControls.section,
      oscalRaw: frameworkControls.oscalRaw,
    }).from(frameworkControls).where(and(
      eq(frameworkControls.frameworkId, pack.frameworkId),
      eq(frameworkControls.tenantId, tenantId),
      eq(frameworkControls.revision, pack.revision),
    )).orderBy(frameworkControls.controlId);
    if (controls.length === 0) throw new Error('Add at least one control before activating this pack.');
    const timeZone = await userTimeZone(session.user.id);
    const effectiveAt = zonedDateTimeToUtc(`${data.effectiveDate}T00:00:00`, timeZone);
    const expiresAt = data.expiryDate ? zonedDateEndToUtc(data.expiryDate, timeZone) : null;
    validatePackDates(effectiveAt, expiresAt);
    const sourceSha256 = crypto.createHash('sha256').update(JSON.stringify(controls)).digest('hex');
    await db.transaction(async (tx) => {
      await tx.update(frameworkPacks).set({
        status: 'active',
        sourceSha256,
        controlCount: controls.length,
        effectiveAt,
        expiresAt,
        approvedBy: session.user.id,
        activatedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(eq(frameworkPacks.id, pack.id), eq(frameworkPacks.tenantId, tenantId)));
      await tx.update(frameworks).set({ lifecycleStatus: 'active', updatedAt: new Date() }).where(and(
        eq(frameworks.id, pack.frameworkId),
        eq(frameworks.tenantId, tenantId),
      ));
      await tx.insert(frameworkImports).values({
        frameworkId: pack.frameworkId,
        tenantId,
        revision: pack.revision,
        sourceUrl: `custom://${pack.frameworkKey}/${pack.revision}`,
        sourceSha256,
        controlCount: controls.length,
        triggeredBy: session.user.id,
        metadata: { sourceKind: 'custom_builder', packId: pack.id } as never,
      });
    });
    await recordAudit({
      tenantId,
      actorUserId: session.user.id,
      action: 'framework.custom.activate',
      resourceType: 'framework_pack',
      resourceId: pack.id,
      afterJson: {
        frameworkId: pack.frameworkId,
        revision: pack.revision,
        controlCount: controls.length,
        sourceSha256,
        effectiveAt: effectiveAt.toISOString(),
        expiresAt: expiresAt?.toISOString() ?? null,
        timeZone,
      },
    });
    revalidateFrameworks();
    return { ok: true, message: `Activated ${pack.packLabel} with ${controls.length} controls.` };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function retireFrameworkPack(
  prevState: FrameworkActionState,
  formData: FormData,
): Promise<FrameworkActionState> {
  void prevState;
  try {
    const { session, tenantId } = await requireFrameworkAdmin();
    const packId = z.string().uuid().parse(formData.get('packId'));
    const pack = await requireTenantPack(packId, tenantId);
    assertFrameworkPackTransition(pack.status, 'retired');
    await db.transaction(async (tx) => {
      await tx.update(frameworkPacks).set({ status: 'retired', retiredAt: new Date(), updatedAt: new Date() }).where(and(
        eq(frameworkPacks.id, pack.id),
        eq(frameworkPacks.tenantId, tenantId),
      ));
      const [remaining] = await tx.select({ value: count() }).from(frameworkPacks).where(and(
        eq(frameworkPacks.frameworkId, pack.frameworkId),
        eq(frameworkPacks.tenantId, tenantId),
        eq(frameworkPacks.status, 'active'),
      ));
      if (remaining.value === 0 && pack.frameworkTenantId === tenantId) {
        await tx.update(frameworks).set({ lifecycleStatus: 'retired', updatedAt: new Date() }).where(and(
          eq(frameworks.id, pack.frameworkId),
          eq(frameworks.tenantId, tenantId),
        ));
      }
    });
    await recordAudit({
      tenantId,
      actorUserId: session.user.id,
      action: 'framework.pack.retire',
      resourceType: 'framework_pack',
      resourceId: pack.id,
      afterJson: { frameworkId: pack.frameworkId, revision: pack.revision },
    });
    revalidateFrameworks();
    return { ok: true, message: `Retired ${pack.packLabel}. Existing engagements remain pinned.` };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

async function requireTenantPack(packId: string, tenantId: string) {
  const [pack] = await db.select({
    id: frameworkPacks.id,
    frameworkId: frameworkPacks.frameworkId,
    tenantId: frameworkPacks.tenantId,
    revision: frameworkPacks.revision,
    packLabel: frameworkPacks.label,
    status: frameworkPacks.status,
    sourceKind: frameworkPacks.sourceKind,
    frameworkKey: frameworks.key,
    frameworkLabel: frameworks.label,
    frameworkTenantId: frameworks.tenantId,
  }).from(frameworkPacks)
    .innerJoin(frameworks, eq(frameworks.id, frameworkPacks.frameworkId))
    .where(and(eq(frameworkPacks.id, packId), eq(frameworkPacks.tenantId, tenantId)))
    .limit(1);
  if (!pack) throw new Error('Framework pack not found for this tenant.');
  return pack;
}

function profileSourceUrl(document: unknown) {
  if (!document || typeof document !== 'object' || !('profile' in document)) return null;
  const profile = (document as { profile?: unknown }).profile;
  if (!profile || typeof profile !== 'object' || !('imports' in profile)) return null;
  const imports = (profile as { imports?: unknown }).imports;
  if (!Array.isArray(imports)) return null;
  const href = imports.find((entry) => entry && typeof entry === 'object' && typeof (entry as { href?: unknown }).href === 'string') as { href?: string } | undefined;
  return href?.href ?? null;
}

function revalidateFrameworks() {
  revalidatePath('/admin/frameworks');
  revalidatePath('/engagements/new');
}
