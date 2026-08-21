'use server';

import crypto from 'node:crypto';
import JSZip from 'jszip';
import { revalidatePath } from 'next/cache';
import { and, asc, eq, inArray, isNotNull, isNull, max } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { auditLog } from '@/db/schema/audit';
import {
  auditEvidencePackages,
  auditReadinessProfiles,
  auditReadinessRequirementEvidence,
  auditReadinessRequirements,
} from '@/db/schema/audit-readiness';
import { engagements, clientOrganisations, systems } from '@/db/schema/engagements';
import { evidenceItemControls, evidenceItems } from '@/db/schema/evidence';
import { findings } from '@/db/schema/findings';
import { engagementControls, frameworkControls, frameworks } from '@/db/schema/frameworks';
import { engagementMembers, tenants } from '@/db/schema/tenants';
import { users } from '@/db/schema/auth';
import { requireSession } from '@/lib/auth/session';
import { userTimeZone } from '@/lib/auth/user-timezone';
import { zonedDateEndToUtc, zonedDateTimeToUtc } from '@/lib/timezone';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import {
  AUDIT_PROFILE_STATUSES,
  AUDIT_REQUIREMENT_STATUSES,
  AUDIT_TYPES,
  TRUST_SERVICE_CATEGORIES,
  auditTypesForFramework,
  buildAuditReadinessGates,
  requirementsForAuditType,
  type AuditRequirementStatus,
  type AuditType,
} from '@/lib/audit-readiness';
import { getEngagementCoverage } from '@/lib/assessment/coverage';
import {
  STORAGE_BUCKET,
  buildAuditPackageKey,
  getObjectBuffer,
  presignDownload,
  putBuffer,
} from '@/lib/storage/s3';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const profileSchema = z.object({
  engagementId: z.string().uuid(),
  auditType: z.enum(AUDIT_TYPES),
  status: z.enum(AUDIT_PROFILE_STATUSES),
  auditFirm: z.string().trim().max(240).optional().nullable(),
  leadAuditor: z.string().trim().max(240).optional().nullable(),
  scopeStatement: z.string().trim().min(20).max(12_000),
  trustServiceCategories: z.array(z.enum(TRUST_SERVICE_CATEGORIES)).max(5),
  periodStart: dateSchema.optional().nullable(),
  periodEnd: dateSchema.optional().nullable(),
  targetAuditDate: dateSchema,
});

const requirementSchema = z.object({
  engagementId: z.string().uuid(),
  requirementId: z.string().uuid(),
  status: z.enum(AUDIT_REQUIREMENT_STATUSES),
  ownerUserId: z.string().uuid().optional().nullable(),
  dueDate: dateSchema.optional().nullable(),
  notes: z.string().trim().max(6000).optional().nullable(),
  evidenceItemIds: z.array(z.string().uuid()).max(100).default([]),
});

export async function upsertAuditReadinessProfile(input: z.infer<typeof profileSchema>) {
  const session = await requireSession();
  const timeZone = await userTimeZone(session.user.id);
  const data = profileSchema.parse(input);
  const engagement = await requireAuditAccess(
    session.user.id,
    data.engagementId,
    ACTIONS.auditReadinessManage,
  );

  const allowedTypes = auditTypesForFramework(engagement.frameworkKey);
  if (!allowedTypes.includes(data.auditType)) {
    throw new Error(`${engagement.frameworkLabel} does not support ${data.auditType}.`);
  }

  const periodStart = parseCalendarDate(data.periodStart, timeZone);
  const periodEnd = parseCalendarDate(data.periodEnd, timeZone);
  if (data.auditType === 'soc_2_type_2') {
    if (!periodStart || !periodEnd || periodEnd <= periodStart) {
      throw new Error('SOC 2 Type II needs an observation-period end after its start.');
    }
  }

  const trustServiceCategories = data.auditType.startsWith('soc_2')
    ? Array.from(new Set(['security', ...data.trustServiceCategories]))
    : [];
  const targetAuditAt = parseCalendarDate(data.targetAuditDate, timeZone);
  if (!targetAuditAt) throw new Error('Target audit date is required.');

  const [existing] = await db
    .select()
    .from(auditReadinessProfiles)
    .where(
      and(
        eq(auditReadinessProfiles.engagementId, data.engagementId),
        eq(auditReadinessProfiles.tenantId, engagement.tenantId),
      ),
    )
    .limit(1);

  let profileId = existing?.id ?? crypto.randomUUID();
  await db.transaction(async (tx) => {
    const [savedProfile] = await tx
      .insert(auditReadinessProfiles)
      .values({
        id: profileId,
        engagementId: data.engagementId,
        tenantId: engagement.tenantId,
        auditType: data.auditType,
        status: data.status,
        auditFirm: data.auditFirm || null,
        leadAuditor: data.leadAuditor || null,
        scopeStatement: data.scopeStatement,
        trustServiceCategories,
        periodStart,
        periodEnd,
        targetAuditAt,
        createdBy: session.user.id,
        updatedBy: session.user.id,
      })
      .onConflictDoUpdate({
        target: auditReadinessProfiles.engagementId,
        set: {
          auditType: data.auditType,
          status: data.status,
          auditFirm: data.auditFirm || null,
          leadAuditor: data.leadAuditor || null,
          scopeStatement: data.scopeStatement,
          trustServiceCategories,
          periodStart,
          periodEnd,
          targetAuditAt,
          updatedBy: session.user.id,
          updatedAt: new Date(),
        },
      })
      .returning({ id: auditReadinessProfiles.id });
    profileId = savedProfile.id;

    for (const requirement of requirementsForAuditType(data.auditType)) {
      await tx
        .insert(auditReadinessRequirements)
        .values({
          profileId,
          engagementId: data.engagementId,
          tenantId: engagement.tenantId,
          auditType: data.auditType,
          requirementKey: requirement.key,
          category: requirement.category,
          title: requirement.title,
          guidance: requirement.guidance,
        })
        .onConflictDoNothing();
    }

    await tx.insert(auditLog).values({
      tenantId: engagement.tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: existing ? 'audit_readiness.profile.update' : 'audit_readiness.profile.create',
      resourceType: 'audit_readiness_profile',
      resourceId: profileId,
      beforeJson: existing
        ? {
            auditType: existing.auditType,
            status: existing.status,
            targetAuditAt: existing.targetAuditAt.toISOString(),
          } as never
        : null,
      afterJson: {
        auditType: data.auditType,
        status: data.status,
        targetAuditAt: targetAuditAt.toISOString(),
        trustServiceCategories,
      } as never,
    });
  });

  revalidateAuditReadiness(data.engagementId);
  return { profileId };
}

export async function updateAuditReadinessRequirement(
  input: z.infer<typeof requirementSchema>,
) {
  const session = await requireSession();
  const timeZone = await userTimeZone(session.user.id);
  const data = requirementSchema.parse(input);
  const engagement = await requireAuditAccess(
    session.user.id,
    data.engagementId,
    ACTIONS.auditReadinessManage,
  );

  const [requirement] = await db
    .select()
    .from(auditReadinessRequirements)
    .where(
      and(
        eq(auditReadinessRequirements.id, data.requirementId),
        eq(auditReadinessRequirements.engagementId, data.engagementId),
        eq(auditReadinessRequirements.tenantId, engagement.tenantId),
      ),
    )
    .limit(1);
  if (!requirement) throw new Error('Audit requirement not found.');

  if (data.ownerUserId) {
    const [member] = await db
      .select({ id: engagementMembers.id })
      .from(engagementMembers)
      .where(
        and(
          eq(engagementMembers.engagementId, data.engagementId),
          eq(engagementMembers.tenantId, engagement.tenantId),
          eq(engagementMembers.userId, data.ownerUserId),
          isNull(engagementMembers.deletedAt),
        ),
      )
      .limit(1);
    if (!member) throw new Error('Requirement owner must be an engagement member.');
  }

  if (data.evidenceItemIds.length > 0) {
    const validEvidence = await db
      .select({ id: evidenceItems.id })
      .from(evidenceItems)
      .where(
        and(
          inArray(evidenceItems.id, data.evidenceItemIds),
          eq(evidenceItems.engagementId, data.engagementId),
          eq(evidenceItems.tenantId, engagement.tenantId),
          isNotNull(evidenceItems.storageVerifiedAt),
          isNull(evidenceItems.quarantinedAt),
        ),
      );
    if (validEvidence.length !== new Set(data.evidenceItemIds).size) {
      throw new Error('Linked evidence must be finalised evidence from this engagement.');
    }
  }

  const existingEvidenceLinks = await db
    .select({ evidenceItemId: auditReadinessRequirementEvidence.evidenceItemId })
    .from(auditReadinessRequirementEvidence)
    .where(
      and(
        eq(auditReadinessRequirementEvidence.requirementId, data.requirementId),
        eq(auditReadinessRequirementEvidence.engagementId, data.engagementId),
        eq(auditReadinessRequirementEvidence.tenantId, engagement.tenantId),
      ),
    );

  const completedAt = data.status === 'ready'
    ? requirement.completedAt ?? new Date()
    : null;
  await db.transaction(async (tx) => {
    await tx
      .update(auditReadinessRequirements)
      .set({
        status: data.status,
        ownerUserId: data.ownerUserId || null,
        dueAt: parseDueDate(data.dueDate, timeZone),
        notes: data.notes || null,
        completedAt,
        updatedBy: session.user.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(auditReadinessRequirements.id, data.requirementId),
          eq(auditReadinessRequirements.engagementId, data.engagementId),
          eq(auditReadinessRequirements.tenantId, engagement.tenantId),
        ),
      );
    await tx
      .delete(auditReadinessRequirementEvidence)
      .where(
        and(
          eq(auditReadinessRequirementEvidence.requirementId, data.requirementId),
          eq(auditReadinessRequirementEvidence.engagementId, data.engagementId),
          eq(auditReadinessRequirementEvidence.tenantId, engagement.tenantId),
        ),
      );
    if (data.evidenceItemIds.length > 0) {
      await tx.insert(auditReadinessRequirementEvidence).values(
        Array.from(new Set(data.evidenceItemIds), (evidenceItemId) => ({
          requirementId: data.requirementId,
          evidenceItemId,
          engagementId: data.engagementId,
          tenantId: engagement.tenantId,
          linkedBy: session.user.id,
        })),
      );
    }
    await tx.insert(auditLog).values({
      tenantId: engagement.tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'audit_readiness.requirement.update',
      resourceType: 'audit_readiness_requirement',
      resourceId: data.requirementId,
      beforeJson: {
        status: requirement.status,
        ownerUserId: requirement.ownerUserId,
        dueAt: requirement.dueAt?.toISOString() ?? null,
        evidenceItemIds: existingEvidenceLinks.map((link) => link.evidenceItemId),
      } as never,
      afterJson: {
        status: data.status,
        ownerUserId: data.ownerUserId || null,
        dueAt: parseDueDate(data.dueDate, timeZone)?.toISOString() ?? null,
        evidenceItemIds: data.evidenceItemIds,
      } as never,
    });
  });

  revalidateAuditReadiness(data.engagementId);
  return { requirementId: data.requirementId };
}

const packageSchema = z.object({ engagementId: z.string().uuid() });

export async function generateAuditEvidencePackage(input: z.infer<typeof packageSchema>) {
  const session = await requireSession();
  const { engagementId } = packageSchema.parse(input);
  const engagement = await requireAuditAccess(
    session.user.id,
    engagementId,
    ACTIONS.auditReadinessManage,
  );

  const [profile] = await db
    .select()
    .from(auditReadinessProfiles)
    .where(
      and(
        eq(auditReadinessProfiles.engagementId, engagementId),
        eq(auditReadinessProfiles.tenantId, engagement.tenantId),
      ),
    )
    .limit(1);
  if (!profile) throw new Error('Configure audit readiness before creating a package.');

  const [requirementRows, requirementEvidenceRows, controlRows, evidenceRows, evidenceLinks, findingRows, auditRows] =
    await Promise.all([
      db
        .select({
          id: auditReadinessRequirements.id,
          key: auditReadinessRequirements.requirementKey,
          category: auditReadinessRequirements.category,
          title: auditReadinessRequirements.title,
          status: auditReadinessRequirements.status,
          notes: auditReadinessRequirements.notes,
          dueAt: auditReadinessRequirements.dueAt,
          completedAt: auditReadinessRequirements.completedAt,
          ownerName: users.name,
          ownerEmail: users.email,
          updatedAt: auditReadinessRequirements.updatedAt,
        })
        .from(auditReadinessRequirements)
        .leftJoin(users, eq(users.id, auditReadinessRequirements.ownerUserId))
        .where(
          and(
            eq(auditReadinessRequirements.profileId, profile.id),
            eq(auditReadinessRequirements.auditType, profile.auditType),
          ),
        )
        .orderBy(asc(auditReadinessRequirements.category), asc(auditReadinessRequirements.title)),
      db
        .select({
          requirementId: auditReadinessRequirementEvidence.requirementId,
          evidenceItemId: auditReadinessRequirementEvidence.evidenceItemId,
        })
        .from(auditReadinessRequirementEvidence)
        .where(
          and(
            eq(auditReadinessRequirementEvidence.engagementId, engagementId),
            eq(auditReadinessRequirementEvidence.tenantId, engagement.tenantId),
          ),
        ),
      db
        .select({
          controlId: engagementControls.controlId,
          status: engagementControls.status,
          applicable: engagementControls.applicable,
          applicabilityJustification: engagementControls.applicabilityJustification,
          implementationStatement: engagementControls.implementationStatement,
          assessmentMethods: engagementControls.assessmentMethods,
          assessmentObjects: engagementControls.assessmentObjects,
          evidenceQuality: engagementControls.evidenceQuality,
          evidenceLimitations: engagementControls.evidenceLimitations,
          lastReviewedAt: engagementControls.lastReviewedAt,
        })
        .from(engagementControls)
        .where(eq(engagementControls.engagementId, engagementId))
        .orderBy(engagementControls.controlId),
      db
        .select({
          id: evidenceItems.id,
          filename: evidenceItems.filename,
          mimeType: evidenceItems.mimeType,
          sizeBytes: evidenceItems.sizeBytes,
          sha256: evidenceItems.sha256,
          version: evidenceItems.version,
          description: evidenceItems.description,
          uploadedAt: evidenceItems.uploadedAt,
          storageVerifiedAt: evidenceItems.storageVerifiedAt,
          reviewStatus: evidenceItems.reviewStatus,
          reviewedAt: evidenceItems.reviewedAt,
          reviewNotes: evidenceItems.reviewNotes,
          storageKey: evidenceItems.storageKey,
        })
        .from(evidenceItems)
        .where(
          and(
            eq(evidenceItems.tenantId, engagement.tenantId),
            eq(evidenceItems.engagementId, engagementId),
            isNull(evidenceItems.quarantinedAt),
          ),
        )
        .orderBy(evidenceItems.uploadedAt),
      db
        .select({
          evidenceItemId: evidenceItemControls.evidenceItemId,
          controlId: frameworkControls.controlId,
        })
        .from(evidenceItemControls)
        .innerJoin(frameworkControls, eq(frameworkControls.id, evidenceItemControls.frameworkControlId))
        .innerJoin(evidenceItems, eq(evidenceItems.id, evidenceItemControls.evidenceItemId))
        .where(
          and(
            eq(evidenceItems.engagementId, engagementId),
            eq(evidenceItems.tenantId, engagement.tenantId),
          ),
        ),
      db
        .select({
          code: findings.code,
          type: findings.type,
          severity: findings.severity,
          status: findings.status,
          title: findings.title,
          description: findings.description,
          reportedAt: findings.reportedAt,
          signedOffAt: findings.signedOffAt,
          closedAt: findings.closedAt,
        })
        .from(findings)
        .where(
          and(eq(findings.tenantId, engagement.tenantId), eq(findings.engagementId, engagementId)),
        )
        .orderBy(findings.sequence),
      db
        .select({
          createdAt: auditLog.createdAt,
          action: auditLog.action,
          resourceType: auditLog.resourceType,
          resourceId: auditLog.resourceId,
          actorUserId: auditLog.actorUserId,
          message: auditLog.message,
        })
        .from(auditLog)
        .where(
          and(eq(auditLog.tenantId, engagement.tenantId), eq(auditLog.engagementId, engagementId)),
        )
        .orderBy(auditLog.createdAt),
    ]);

  const coverage = await getEngagementCoverage(engagementId);
  const acceptedEvidenceCount = evidenceRows.filter((row) => row.reviewStatus === 'accepted').length;
  const auditType = profile.auditType as AuditType;
  const gates = buildAuditReadinessGates({
    engagementId,
    auditType,
    scopeStatement: profile.scopeStatement,
    targetAuditAt: profile.targetAuditAt,
    periodStart: profile.periodStart,
    periodEnd: profile.periodEnd,
    requirementStatuses: requirementRows.map((row) => row.status as AuditRequirementStatus),
    controlCount: controlRows.length,
    acceptedEvidenceCount,
    coverageBlockerKeys: coverage.blockers.map((blocker) => blocker.key),
  });

  const linkedControls = new Map<string, string[]>();
  for (const link of evidenceLinks) {
    linkedControls.set(link.evidenceItemId, [
      ...(linkedControls.get(link.evidenceItemId) ?? []),
      link.controlId,
    ]);
  }
  const requirementEvidence = new Map<string, string[]>();
  for (const link of requirementEvidenceRows) {
    requirementEvidence.set(link.requirementId, [
      ...(requirementEvidence.get(link.requirementId) ?? []),
      link.evidenceItemId,
    ]);
  }

  const generatedAt = new Date();
  const [{ maxVersion }] = await db
    .select({ maxVersion: max(auditEvidencePackages.version) })
    .from(auditEvidencePackages)
    .where(
      and(
        eq(auditEvidencePackages.tenantId, engagement.tenantId),
        eq(auditEvidencePackages.engagementId, engagementId),
      ),
    );
  const version = (maxVersion ?? 0) + 1;

  const files = new Map<string, string>();
  files.set(
    'README.txt',
    [
      'OakAttest audit-readiness evidence package',
      `Generated: ${generatedAt.toISOString()}`,
      `Engagement: ${engagement.name}`,
      `Framework: ${engagement.frameworkLabel} ${engagement.frameworkRevision}`,
      `Audit type: ${profile.auditType}`,
      '',
      'This package is a timestamped snapshot of records held in OakAttest. It does not',
      'certify conformity or replace auditor judgement. Verified evidence files are included;',
      'invite the auditor as a read-only observer for live inspection and later versions.',
      '',
      'Verify package bytes against the SHA-256 shown in OakAttest.',
      '',
    ].join('\n'),
  );
  files.set(
    'readiness-checklist.csv',
    toCsv(
      ['key', 'category', 'title', 'status', 'owner', 'dueAt', 'completedAt', 'updatedAt', 'evidenceItemIds', 'notes'],
      requirementRows.map((row) => ({
        key: row.key,
        category: row.category,
        title: row.title,
        status: row.status,
        owner: row.ownerName || row.ownerEmail || '',
        dueAt: row.dueAt?.toISOString() ?? '',
        completedAt: row.completedAt?.toISOString() ?? '',
        updatedAt: row.updatedAt.toISOString(),
        evidenceItemIds: (requirementEvidence.get(row.id) ?? []).join(';'),
        notes: row.notes ?? '',
      })),
    ),
  );
  files.set(
    'control-matrix.csv',
    toCsv(
      ['controlId', 'status', 'applicable', 'applicabilityJustification', 'implementationStatement', 'assessmentMethods', 'assessmentObjects', 'evidenceQuality', 'evidenceLimitations', 'lastReviewedAt'],
      controlRows.map((row) => ({
        ...row,
        applicabilityJustification: row.applicabilityJustification ?? '',
        implementationStatement: row.implementationStatement ?? '',
        assessmentMethods: row.assessmentMethods ?? '',
        assessmentObjects: row.assessmentObjects ?? '',
        evidenceQuality: row.evidenceQuality ?? '',
        evidenceLimitations: row.evidenceLimitations ?? '',
        lastReviewedAt: row.lastReviewedAt?.toISOString() ?? '',
      })),
    ),
  );
  files.set(
    'evidence-index.csv',
    toCsv(
      ['id', 'filename', 'mimeType', 'sizeBytes', 'sha256', 'version', 'description', 'controlIds', 'uploadedAt', 'storageVerifiedAt', 'reviewStatus', 'reviewedAt', 'reviewNotes'],
      evidenceRows.map((row) => ({
        ...row,
        mimeType: row.mimeType ?? '',
        sizeBytes: String(row.sizeBytes),
        description: row.description ?? '',
        controlIds: (linkedControls.get(row.id) ?? []).sort().join(';'),
        uploadedAt: row.uploadedAt.toISOString(),
        storageVerifiedAt: row.storageVerifiedAt?.toISOString() ?? '',
        reviewedAt: row.reviewedAt?.toISOString() ?? '',
        reviewNotes: row.reviewNotes ?? '',
      })),
    ),
  );
  files.set(
    'findings-register.csv',
    toCsv(
      ['code', 'type', 'severity', 'status', 'title', 'description', 'reportedAt', 'signedOffAt', 'closedAt'],
      findingRows.map((row) => ({
        ...row,
        reportedAt: row.reportedAt.toISOString(),
        signedOffAt: row.signedOffAt?.toISOString() ?? '',
        closedAt: row.closedAt?.toISOString() ?? '',
      })),
    ),
  );
  files.set(
    'audit-log.csv',
    toCsv(
      ['createdAt', 'action', 'resourceType', 'resourceId', 'actorUserId', 'message'],
      auditRows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        resourceId: row.resourceId ?? '',
        actorUserId: row.actorUserId ?? '',
        message: row.message ?? '',
      })),
    ),
  );

  const [tenant] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, engagement.tenantId))
    .limit(1);
  const [client] = await db
    .select({ name: clientOrganisations.name })
    .from(clientOrganisations)
    .where(eq(clientOrganisations.engagementId, engagementId))
    .limit(1);
  const [system] = await db
    .select({ name: systems.name })
    .from(systems)
    .where(eq(systems.engagementId, engagementId))
    .limit(1);

  const evidenceFiles: Array<{ filename: string; body: Buffer }> = [];
  for (const row of evidenceRows) {
    if (!row.storageVerifiedAt) continue;
    const body = await getObjectBuffer(row.storageKey);
    const actualSha256 = sha256(body);
    if (actualSha256 !== row.sha256) {
      throw new Error(`Evidence checksum mismatch while packaging ${row.filename}.`);
    }
    evidenceFiles.push({
      filename: `evidence/${row.id}-${safeFilename(row.filename)}`,
      body,
    });
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    generatedBy: session.user.email,
    packageVersion: version,
    tenant: tenant?.name ?? '',
    client: client?.name ?? '',
    system: system?.name ?? '',
    engagement: {
      id: engagementId,
      name: engagement.name,
      reference: engagement.reference,
      framework: engagement.frameworkLabel,
      revision: engagement.frameworkRevision,
    },
    audit: {
      type: profile.auditType,
      status: profile.status,
      firm: profile.auditFirm,
      leadAuditor: profile.leadAuditor,
      scopeStatement: profile.scopeStatement,
      trustServiceCategories: profile.trustServiceCategories,
      periodStart: profile.periodStart?.toISOString() ?? null,
      periodEnd: profile.periodEnd?.toISOString() ?? null,
      targetAuditAt: profile.targetAuditAt.toISOString(),
    },
    readiness: {
      ready: gates.every((gate) => gate.ready),
      gates,
      controlCount: controlRows.length,
      evidenceCount: evidenceRows.length,
      acceptedEvidenceCount,
      attachedEvidenceCount: evidenceFiles.length,
      findingCount: findingRows.length,
    },
    files: [
      ...Array.from(files, ([filename, body]) => ({
        filename,
        sha256: sha256(body),
        sizeBytes: Buffer.byteLength(body),
      })),
      ...evidenceFiles.map(({ filename, body }) => ({
        filename,
        sha256: sha256(body),
        sizeBytes: body.byteLength,
      })),
    ],
  };
  files.set('MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`);

  const zip = new JSZip();
  for (const [filename, body] of files) zip.file(filename, body);
  for (const { filename, body } of evidenceFiles) zip.file(filename, body);
  const bundle = Buffer.from(
    await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    }),
  );
  const bundleSha256 = sha256(bundle);
  const storageKey = buildAuditPackageKey({
    tenantId: engagement.tenantId,
    engagementId,
    version,
  });
  await putBuffer({ key: storageKey, body: bundle, contentType: 'application/zip' });

  const packageId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(auditEvidencePackages).values({
      id: packageId,
      profileId: profile.id,
      engagementId,
      tenantId: engagement.tenantId,
      version,
      auditType: profile.auditType,
      storageKey,
      storageBucket: STORAGE_BUCKET,
      bundleSha256,
      sizeBytes: bundle.length,
      manifest: manifest as never,
      generatedBy: session.user.id,
      generatedAt,
    });
    await tx.insert(auditLog).values({
      tenantId: engagement.tenantId,
      engagementId,
      actorUserId: session.user.id,
      action: 'audit_readiness.package.generate',
      resourceType: 'audit_evidence_package',
      resourceId: packageId,
      afterJson: {
        version,
        auditType: profile.auditType,
        bundleSha256,
        sizeBytes: bundle.length,
        ready: manifest.readiness.ready,
      } as never,
    });
  });

  revalidateAuditReadiness(engagementId);
  return { packageId, version, bundleSha256, ready: manifest.readiness.ready };
}

export async function getAuditEvidencePackageDownloadUrl(input: {
  engagementId: string;
  packageId: string;
}) {
  const session = await requireSession();
  const data = z
    .object({ engagementId: z.string().uuid(), packageId: z.string().uuid() })
    .parse(input);
  const engagement = await requireAuditAccess(
    session.user.id,
    data.engagementId,
    ACTIONS.auditReadinessView,
  );
  const [record] = await db
    .select()
    .from(auditEvidencePackages)
    .where(
      and(
        eq(auditEvidencePackages.id, data.packageId),
        eq(auditEvidencePackages.engagementId, data.engagementId),
        eq(auditEvidencePackages.tenantId, engagement.tenantId),
      ),
    )
    .limit(1);
  if (!record) throw new Error('Audit evidence package not found.');

  await db.insert(auditLog).values({
    tenantId: engagement.tenantId,
    engagementId: data.engagementId,
    actorUserId: session.user.id,
    action: 'audit_readiness.package.download',
    resourceType: 'audit_evidence_package',
    resourceId: record.id,
    afterJson: { version: record.version, bundleSha256: record.bundleSha256 } as never,
  });
  return { url: await presignDownload({ key: record.storageKey, expiresIn: 300 }) };
}

async function requireAuditAccess(
  userId: string,
  engagementId: string,
  action: typeof ACTIONS.auditReadinessManage | typeof ACTIONS.auditReadinessView,
) {
  const [engagement] = await db
    .select({
      tenantId: engagements.tenantId,
      name: engagements.name,
      reference: engagements.reference,
      frameworkRevision: engagements.frameworkRevision,
      frameworkKey: frameworks.key,
      frameworkLabel: frameworks.label,
    })
    .from(engagements)
    .innerJoin(frameworks, eq(frameworks.id, engagements.frameworkId))
    .where(and(eq(engagements.id, engagementId), isNull(engagements.deletedAt)))
    .limit(1);
  if (!engagement) throw new Error('Engagement not found.');
  await requirePermission(action, {
    userId,
    tenantId: engagement.tenantId,
    engagementId,
  });
  return engagement;
}

function parseCalendarDate(value: string | null | undefined, timeZone: string) {
  if (!value) return null;
  return zonedDateTimeToUtc(`${value}T09:00`, timeZone);
}

function parseDueDate(value: string | null | undefined, timeZone: string) {
  return value ? zonedDateEndToUtc(value, timeZone) : null;
}

function sha256(value: string | Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function toCsv(headers: string[], rows: Array<Record<string, unknown>>) {
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
  ].join('\n');
}

function revalidateAuditReadiness(engagementId: string) {
  revalidatePath(`/engagements/${engagementId}/audit-readiness`);
  revalidatePath(`/engagements/${engagementId}/coverage`);
}
