'use server';

import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { and, eq, inArray, isNull, max } from 'drizzle-orm';
import { z } from 'zod';
import { auditLog } from '@/db/schema/audit';
import { engagements } from '@/db/schema/engagements';
import {
  accessReviewCampaigns,
  accessReviewItems,
  governancePolicies,
  personnelAssuranceRecords,
  policyAttestations,
  vendorRiskRecords,
} from '@/db/schema/operational-grc';
import { engagementMembers } from '@/db/schema/tenants';
import { requireSession } from '@/lib/auth/session';
import { userTimeZone } from '@/lib/auth/user-timezone';
import { db } from '@/lib/db/client';
import {
  accessReviewCompletionBlockers,
  assertAccessReviewTransition,
  assertPersonnelTransition,
  assertPolicyTransition,
  assertVendorTransition,
  parseAccessReviewItems,
  vendorApprovalBlockers,
  type AccessReviewStatus,
  type PersonnelStatus,
  type PolicyStatus,
  type RiskRating,
  type VendorStatus,
} from '@/lib/governance/workflow';
import { ACTIONS } from '@/lib/rbac/matrix';
import { requirePermission } from '@/lib/rbac/require';
import { zonedDateEndToUtc } from '@/lib/timezone';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalDate = date.optional().nullable();
const riskRatings = ['low', 'medium', 'high', 'critical'] as const;

const createPolicySchema = z.object({
  engagementId: uuid,
  title: z.string().trim().min(3).max(240),
  category: z.string().trim().min(2).max(120),
  content: z.string().trim().min(50).max(100_000),
  reviewDate: date,
  ownerUserId: uuid.optional().nullable(),
});
const transitionPolicySchema = z.object({
  engagementId: uuid,
  policyId: uuid,
  nextStatus: z.enum(['draft', 'in_review', 'approved', 'published', 'retired']),
  attestationDueDate: optionalDate,
});
const createPersonnelSchema = z.object({
  engagementId: uuid,
  personName: z.string().trim().min(2).max(240),
  personEmail: z.string().trim().email().max(320),
  roleTitle: z.string().trim().max(240).optional().nullable(),
  trainingDueDate: optionalDate,
  ownerUserId: uuid.optional().nullable(),
});
const updatePersonnelSchema = z.object({
  engagementId: uuid,
  personnelId: uuid,
  employmentStatus: z.enum(['onboarding', 'active', 'suspended', 'terminated']),
  screeningStatus: z.enum(['not_required', 'pending', 'verified', 'expired']),
  screeningExpiresDate: optionalDate,
  trainingDueDate: optionalDate,
  trainingCompleted: z.boolean(),
  offboardingDueDate: optionalDate,
  offboardingCompleted: z.boolean(),
  ownerUserId: uuid.optional().nullable(),
  notes: z.string().trim().max(8_000).optional().nullable(),
});
const createAccessReviewSchema = z.object({
  engagementId: uuid,
  title: z.string().trim().min(3).max(240),
  scope: z.string().trim().min(10).max(4_000),
  dueDate: date,
  ownerUserId: uuid.optional().nullable(),
  items: z.string().min(3).max(100_000),
});
const campaignSchema = z.object({ engagementId: uuid, campaignId: uuid });
const accessDecisionSchema = z.object({
  engagementId: uuid,
  itemId: uuid,
  decision: z.enum(['retain', 'modify', 'revoke']),
  rationale: z.string().trim().max(4_000).optional().nullable(),
  remediationStatus: z.enum(['none', 'open', 'complete']),
});
const createVendorSchema = z.object({
  engagementId: uuid,
  vendorName: z.string().trim().min(2).max(240),
  serviceDescription: z.string().trim().min(10).max(4_000),
  criticality: z.enum(riskRatings),
  inherentRisk: z.enum(riskRatings),
  ownerUserId: uuid.optional().nullable(),
});
const assessVendorSchema = z.object({
  engagementId: uuid,
  vendorId: uuid,
  inherentRisk: z.enum(riskRatings),
  residualRisk: z.enum(riskRatings),
  dataHandled: z.string().trim().max(4_000).optional().nullable(),
  dueDiligenceSummary: z.string().trim().min(20).max(12_000),
  contractExpiryDate: optionalDate,
  nextReviewDate: date,
  ownerUserId: uuid.optional().nullable(),
});
const transitionVendorSchema = z.object({
  engagementId: uuid,
  vendorId: uuid,
  nextStatus: z.enum(['assessing', 'approved', 'monitoring', 'offboarding', 'closed']),
  riskAcceptanceStatement: z.string().trim().max(8_000).optional().nullable(),
});

export async function createGovernancePolicy(input: z.infer<typeof createPolicySchema>) {
  const session = await requireSession();
  const data = createPolicySchema.parse(input);
  const context = await requireEngagement(data.engagementId);
  await requirePermission(ACTIONS.policyWrite, permissionContext(session.user.id, context));
  const ownerUserId = data.ownerUserId ?? session.user.id;
  await assertClientMember(ownerUserId, context);
  const timeZone = await userTimeZone(session.user.id);
  const policyId = crypto.randomUUID();
  const reviewDueAt = zonedDateEndToUtc(data.reviewDate, timeZone);

  await db.transaction(async (tx) => {
    await tx.insert(governancePolicies).values({
      id: policyId,
      policyGroupId: policyId,
      tenantId: context.tenantId,
      engagementId: data.engagementId,
      title: data.title,
      category: data.category,
      content: data.content,
      ownerUserId,
      reviewDueAt,
      createdBy: session.user.id,
    });
    await tx.insert(auditLog).values(auditValue(context, session.user.id, 'policy.create', 'governance_policy', policyId, {
      title: data.title,
      category: data.category,
      version: 1,
      reviewDueAt: reviewDueAt.toISOString(),
      timeZone,
    }));
  });
  revalidateGovernance(data.engagementId);
  return { policyId };
}

export async function transitionGovernancePolicy(input: z.infer<typeof transitionPolicySchema>) {
  const session = await requireSession();
  const data = transitionPolicySchema.parse(input);
  const policy = await requirePolicy(data.policyId, data.engagementId);
  assertPolicyTransition(policy.status as PolicyStatus, data.nextStatus);
  const approvalStep = ['approved', 'published', 'retired'].includes(data.nextStatus);
  await requirePermission(approvalStep ? ACTIONS.policyApprove : ACTIONS.policyWrite, permissionContext(session.user.id, policy));
  if (data.nextStatus === 'published' && !policy.approvedAt) throw new Error('Policy needs client approval before publication.');

  const now = new Date();
  const changes: Partial<typeof governancePolicies.$inferInsert> = { status: data.nextStatus, updatedAt: now };
  if (data.nextStatus === 'draft') {
    changes.approvedBy = null;
    changes.approvedAt = null;
  } else if (data.nextStatus === 'approved') {
    changes.approvedBy = session.user.id;
    changes.approvedAt = now;
  } else if (data.nextStatus === 'published') {
    changes.publishedBy = session.user.id;
    changes.publishedAt = now;
  } else if (data.nextStatus === 'retired') {
    changes.retiredAt = now;
  }

  const timeZone = await userTimeZone(session.user.id);
  const attestationDueAt = data.nextStatus === 'published'
    ? zonedDateEndToUtc(data.attestationDueDate ?? '', timeZone)
    : null;
  await db.transaction(async (tx) => {
    await tx.update(governancePolicies).set(changes).where(and(
      eq(governancePolicies.id, data.policyId),
      eq(governancePolicies.tenantId, policy.tenantId),
      eq(governancePolicies.engagementId, data.engagementId),
    ));
    let attestationCount = 0;
    if (data.nextStatus === 'published') {
      const members = await tx.select({ userId: engagementMembers.userId }).from(engagementMembers).where(and(
        eq(engagementMembers.tenantId, policy.tenantId),
        eq(engagementMembers.engagementId, data.engagementId),
        inArray(engagementMembers.role, ['client_admin', 'client_contributor']),
        isNull(engagementMembers.deletedAt),
      ));
      attestationCount = members.length;
      if (members.length > 0) {
        await tx.insert(policyAttestations).values(members.map((member) => ({
          policyId: data.policyId,
          policyVersion: policy.version,
          tenantId: policy.tenantId,
          engagementId: data.engagementId,
          userId: member.userId,
          dueAt: attestationDueAt!,
        }))).onConflictDoNothing();
      }
    }
    await tx.insert(auditLog).values(auditValue(policy, session.user.id, `policy.${data.nextStatus}`, 'governance_policy', data.policyId, {
      from: policy.status,
      to: data.nextStatus,
      attestationCount,
      attestationDueAt: attestationDueAt?.toISOString() ?? null,
      timeZone,
    }));
  });
  revalidateGovernance(data.engagementId);
}

export async function reviseGovernancePolicy(input: { engagementId: string; policyId: string }) {
  const session = await requireSession();
  const data = z.object({ engagementId: uuid, policyId: uuid }).parse(input);
  const policy = await requirePolicy(data.policyId, data.engagementId);
  await requirePermission(ACTIONS.policyWrite, permissionContext(session.user.id, policy));
  if (!['approved', 'published', 'retired'].includes(policy.status)) {
    throw new Error('Only an approved, published, or retired policy can start a new revision.');
  }
  const [versionRow] = await db.select({ version: max(governancePolicies.version) }).from(governancePolicies).where(and(
    eq(governancePolicies.policyGroupId, policy.policyGroupId),
    eq(governancePolicies.tenantId, policy.tenantId),
    eq(governancePolicies.engagementId, data.engagementId),
  ));
  const version = (versionRow?.version ?? policy.version) + 1;
  const newPolicyId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(governancePolicies).values({
      id: newPolicyId,
      policyGroupId: policy.policyGroupId,
      tenantId: policy.tenantId,
      engagementId: data.engagementId,
      title: policy.title,
      category: policy.category,
      version,
      content: policy.content,
      ownerUserId: policy.ownerUserId,
      reviewDueAt: policy.reviewDueAt,
      createdBy: session.user.id,
    });
    await tx.insert(auditLog).values(auditValue(policy, session.user.id, 'policy.revise', 'governance_policy', newPolicyId, {
      sourcePolicyId: policy.id,
      policyGroupId: policy.policyGroupId,
      version,
    }));
  });
  revalidateGovernance(data.engagementId);
  return { policyId: newPolicyId, version };
}

export async function acceptGovernancePolicy(input: { engagementId: string; attestationId: string }) {
  const session = await requireSession();
  const data = z.object({ engagementId: uuid, attestationId: uuid }).parse(input);
  const [record] = await db.select({
    id: policyAttestations.id,
    tenantId: policyAttestations.tenantId,
    engagementId: policyAttestations.engagementId,
    userId: policyAttestations.userId,
    status: policyAttestations.status,
    policyId: policyAttestations.policyId,
    policyVersion: policyAttestations.policyVersion,
    policyStatus: governancePolicies.status,
    policyTitle: governancePolicies.title,
  }).from(policyAttestations)
    .innerJoin(governancePolicies, eq(governancePolicies.id, policyAttestations.policyId))
    .where(and(eq(policyAttestations.id, data.attestationId), eq(policyAttestations.engagementId, data.engagementId)))
    .limit(1);
  if (!record) throw new Error('Policy attestation not found.');
  await requirePermission(ACTIONS.policyAccept, permissionContext(session.user.id, record));
  if (record.userId !== session.user.id) throw new Error('You can accept only your own assigned policy attestation.');
  if (record.status !== 'pending' || record.policyStatus !== 'published') throw new Error('Policy attestation is not open.');
  const acceptedAt = new Date();
  const acceptanceSha256 = crypto.createHash('sha256')
    .update(`${record.policyId}:${record.policyVersion}:${record.userId}:${acceptedAt.toISOString()}`)
    .digest('hex');
  await db.transaction(async (tx) => {
    await tx.update(policyAttestations).set({ status: 'accepted', acceptedAt, acceptanceSha256 }).where(and(
      eq(policyAttestations.id, data.attestationId),
      eq(policyAttestations.tenantId, record.tenantId),
      eq(policyAttestations.userId, session.user.id),
    ));
    await tx.insert(auditLog).values(auditValue(record, session.user.id, 'policy.attestation.accept', 'policy_attestation', data.attestationId, {
      policyId: record.policyId,
      policyVersion: record.policyVersion,
      acceptanceSha256,
    }));
  });
  revalidateGovernance(data.engagementId);
}

export async function createPersonnelAssuranceRecord(input: z.infer<typeof createPersonnelSchema>) {
  const session = await requireSession();
  const data = createPersonnelSchema.parse(input);
  const context = await requireEngagement(data.engagementId);
  await requirePermission(ACTIONS.personnelManage, permissionContext(session.user.id, context));
  const ownerUserId = data.ownerUserId ?? session.user.id;
  await assertClientMember(ownerUserId, context);
  const timeZone = await userTimeZone(session.user.id);
  const recordId = crypto.randomUUID();
  const trainingDueAt = parseOptionalDate(data.trainingDueDate, timeZone);
  await db.transaction(async (tx) => {
    await tx.insert(personnelAssuranceRecords).values({
      id: recordId,
      tenantId: context.tenantId,
      engagementId: data.engagementId,
      personName: data.personName,
      personEmail: data.personEmail.toLowerCase(),
      roleTitle: data.roleTitle || null,
      trainingDueAt,
      ownerUserId,
      createdBy: session.user.id,
      updatedBy: session.user.id,
    });
    await tx.insert(auditLog).values(auditValue(context, session.user.id, 'personnel.create', 'personnel_assurance_record', recordId, {
      personEmail: data.personEmail.toLowerCase(),
      employmentStatus: 'onboarding',
      trainingDueAt: trainingDueAt?.toISOString() ?? null,
      timeZone,
    }));
  });
  revalidateGovernance(data.engagementId);
}

export async function updatePersonnelAssuranceRecord(input: z.infer<typeof updatePersonnelSchema>) {
  const session = await requireSession();
  const data = updatePersonnelSchema.parse(input);
  const record = await requirePersonnel(data.personnelId, data.engagementId);
  await requirePermission(ACTIONS.personnelManage, permissionContext(session.user.id, record));
  assertPersonnelTransition(record.employmentStatus as PersonnelStatus, data.employmentStatus);
  const ownerUserId = data.ownerUserId ?? session.user.id;
  await assertClientMember(ownerUserId, record);
  if (data.employmentStatus === 'active' && !['verified', 'not_required'].includes(data.screeningStatus)) {
    throw new Error('Personnel screening must be verified or documented as not required before activation.');
  }
  if (data.employmentStatus === 'terminated' && !data.offboardingDueDate) {
    throw new Error('Terminated personnel need an offboarding due date.');
  }
  const timeZone = await userTimeZone(session.user.id);
  const now = new Date();
  const values = {
    employmentStatus: data.employmentStatus,
    screeningStatus: data.screeningStatus,
    screeningExpiresAt: parseOptionalDate(data.screeningExpiresDate, timeZone),
    trainingDueAt: parseOptionalDate(data.trainingDueDate, timeZone),
    trainingCompletedAt: data.trainingCompleted ? record.trainingCompletedAt ?? now : null,
    offboardingDueAt: parseOptionalDate(data.offboardingDueDate, timeZone),
    offboardingCompletedAt: data.offboardingCompleted ? record.offboardingCompletedAt ?? now : null,
    ownerUserId,
    notes: data.notes || null,
    updatedBy: session.user.id,
    updatedAt: now,
  };
  await db.transaction(async (tx) => {
    await tx.update(personnelAssuranceRecords).set(values).where(and(
      eq(personnelAssuranceRecords.id, data.personnelId),
      eq(personnelAssuranceRecords.tenantId, record.tenantId),
      eq(personnelAssuranceRecords.engagementId, data.engagementId),
    ));
    await tx.insert(auditLog).values(auditValue(record, session.user.id, 'personnel.update', 'personnel_assurance_record', data.personnelId, {
      previousEmploymentStatus: record.employmentStatus,
      ...values,
      trainingCompletedAt: values.trainingCompletedAt?.toISOString() ?? null,
      offboardingCompletedAt: values.offboardingCompletedAt?.toISOString() ?? null,
      timeZone,
    }));
  });
  revalidateGovernance(data.engagementId);
}

export async function createAccessReviewCampaign(input: z.infer<typeof createAccessReviewSchema>) {
  const session = await requireSession();
  const data = createAccessReviewSchema.parse(input);
  const context = await requireEngagement(data.engagementId);
  await requirePermission(ACTIONS.accessReviewManage, permissionContext(session.user.id, context));
  const ownerUserId = data.ownerUserId ?? session.user.id;
  await assertClientMember(ownerUserId, context);
  const records = parseAccessReviewItems(data.items);
  const timeZone = await userTimeZone(session.user.id);
  const dueAt = zonedDateEndToUtc(data.dueDate, timeZone);
  const campaignId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(accessReviewCampaigns).values({
      id: campaignId,
      tenantId: context.tenantId,
      engagementId: data.engagementId,
      title: data.title,
      scope: data.scope,
      ownerUserId,
      dueAt,
      createdBy: session.user.id,
    });
    await tx.insert(accessReviewItems).values(records.map((record) => ({
      campaignId,
      tenantId: context.tenantId,
      engagementId: data.engagementId,
      subjectName: record.subjectName,
      subjectEmail: record.subjectEmail,
      systemName: record.systemName,
      accessLevel: record.accessLevel,
      reviewerUserId: ownerUserId,
    })));
    await tx.insert(auditLog).values(auditValue(context, session.user.id, 'access_review.create', 'access_review_campaign', campaignId, {
      title: data.title,
      dueAt: dueAt.toISOString(),
      itemCount: records.length,
      timeZone,
    }));
  });
  revalidateGovernance(data.engagementId);
  return { campaignId, itemCount: records.length };
}

export async function startAccessReviewCampaign(input: z.infer<typeof campaignSchema>) {
  const session = await requireSession();
  const data = campaignSchema.parse(input);
  const campaign = await requireCampaign(data.campaignId, data.engagementId);
  await requirePermission(ACTIONS.accessReviewManage, permissionContext(session.user.id, campaign));
  assertAccessReviewTransition(campaign.status as AccessReviewStatus, 'in_progress');
  await changeCampaignStatus(campaign, session.user.id, 'in_progress', { startedAt: new Date() });
}

export async function decideAccessReviewItem(input: z.infer<typeof accessDecisionSchema>) {
  const session = await requireSession();
  const data = accessDecisionSchema.parse(input);
  const item = await requireAccessReviewItem(data.itemId, data.engagementId);
  await requirePermission(ACTIONS.accessReviewManage, permissionContext(session.user.id, item));
  if (!['in_progress', 'in_review'].includes(item.campaignStatus)) throw new Error('Access review is not accepting decisions.');
  if ((data.decision === 'modify' || data.decision === 'revoke') && (data.rationale?.length ?? 0) < 10) {
    throw new Error('Modify and revoke decisions need a rationale.');
  }
  if (data.decision === 'retain' && data.remediationStatus !== 'none') {
    throw new Error('Retained access cannot have remediation work.');
  }
  if ((data.decision === 'modify' || data.decision === 'revoke') && data.remediationStatus === 'none') {
    throw new Error('Modify and revoke decisions need open or completed remediation.');
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(accessReviewItems).set({
      decision: data.decision,
      rationale: data.rationale || null,
      remediationStatus: data.remediationStatus,
      decidedBy: session.user.id,
      decidedAt: now,
      updatedAt: now,
    }).where(and(
      eq(accessReviewItems.id, data.itemId),
      eq(accessReviewItems.tenantId, item.tenantId),
      eq(accessReviewItems.engagementId, data.engagementId),
    ));
    const campaignItems = await tx.select({ id: accessReviewItems.id, decision: accessReviewItems.decision })
      .from(accessReviewItems)
      .where(and(eq(accessReviewItems.campaignId, item.campaignId), eq(accessReviewItems.tenantId, item.tenantId)));
    const decisionsComplete = campaignItems.every((candidate) => candidate.id === data.itemId || candidate.decision !== 'pending');
    await tx.update(accessReviewCampaigns).set({
      status: decisionsComplete ? 'in_review' : 'in_progress',
      updatedAt: now,
    }).where(and(eq(accessReviewCampaigns.id, item.campaignId), eq(accessReviewCampaigns.tenantId, item.tenantId)));
    await tx.insert(auditLog).values(auditValue(item, session.user.id, 'access_review.item.decide', 'access_review_item', data.itemId, {
      campaignId: item.campaignId,
      decision: data.decision,
      remediationStatus: data.remediationStatus,
      rationale: data.rationale || null,
    }));
  });
  revalidateGovernance(data.engagementId);
}

export async function completeAccessReviewCampaign(input: z.infer<typeof campaignSchema>) {
  const session = await requireSession();
  const data = campaignSchema.parse(input);
  const campaign = await requireCampaign(data.campaignId, data.engagementId);
  await requirePermission(ACTIONS.accessReviewManage, permissionContext(session.user.id, campaign));
  assertAccessReviewTransition(campaign.status as AccessReviewStatus, 'completed');
  const items = await db.select({ decision: accessReviewItems.decision, remediationStatus: accessReviewItems.remediationStatus })
    .from(accessReviewItems)
    .where(and(
      eq(accessReviewItems.campaignId, data.campaignId),
      eq(accessReviewItems.tenantId, campaign.tenantId),
      eq(accessReviewItems.engagementId, data.engagementId),
    ));
  const blockers = accessReviewCompletionBlockers(items);
  if (blockers.length > 0) throw new Error(`Access review cannot be completed: ${blockers.join(' ')}`);
  await changeCampaignStatus(campaign, session.user.id, 'completed', { completedAt: new Date() });
}

export async function createVendorRiskRecord(input: z.infer<typeof createVendorSchema>) {
  const session = await requireSession();
  const data = createVendorSchema.parse(input);
  const context = await requireEngagement(data.engagementId);
  await requirePermission(ACTIONS.vendorManage, permissionContext(session.user.id, context));
  const ownerUserId = data.ownerUserId ?? session.user.id;
  await assertClientMember(ownerUserId, context);
  const vendorId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(vendorRiskRecords).values({
      id: vendorId,
      tenantId: context.tenantId,
      engagementId: data.engagementId,
      vendorName: data.vendorName,
      serviceDescription: data.serviceDescription,
      criticality: data.criticality,
      inherentRisk: data.inherentRisk,
      ownerUserId,
      createdBy: session.user.id,
      updatedBy: session.user.id,
    });
    await tx.insert(auditLog).values(auditValue(context, session.user.id, 'vendor.create', 'vendor_risk_record', vendorId, {
      vendorName: data.vendorName,
      criticality: data.criticality,
      inherentRisk: data.inherentRisk,
    }));
  });
  revalidateGovernance(data.engagementId);
  return { vendorId };
}

export async function assessVendorRisk(input: z.infer<typeof assessVendorSchema>) {
  const session = await requireSession();
  const data = assessVendorSchema.parse(input);
  const vendor = await requireVendor(data.vendorId, data.engagementId);
  await requirePermission(ACTIONS.vendorManage, permissionContext(session.user.id, vendor));
  if (!['intake', 'assessing', 'monitoring'].includes(vendor.status)) throw new Error('Vendor is not open for assessment.');
  const ownerUserId = data.ownerUserId ?? session.user.id;
  await assertClientMember(ownerUserId, vendor);
  if (vendor.status !== 'assessing') assertVendorTransition(vendor.status as VendorStatus, 'assessing');
  const timeZone = await userTimeZone(session.user.id);
  const values = {
    status: 'assessing',
    inherentRisk: data.inherentRisk,
    residualRisk: data.residualRisk,
    dataHandled: data.dataHandled || null,
    dueDiligenceSummary: data.dueDiligenceSummary,
    contractExpiresAt: parseOptionalDate(data.contractExpiryDate, timeZone),
    nextReviewAt: zonedDateEndToUtc(data.nextReviewDate, timeZone),
    lastAssessedAt: new Date(),
    ownerUserId,
    riskAcceptanceStatement: null,
    riskAcceptedBy: null,
    riskAcceptedAt: null,
    updatedBy: session.user.id,
    updatedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    await tx.update(vendorRiskRecords).set(values).where(and(
      eq(vendorRiskRecords.id, data.vendorId),
      eq(vendorRiskRecords.tenantId, vendor.tenantId),
      eq(vendorRiskRecords.engagementId, data.engagementId),
    ));
    await tx.insert(auditLog).values(auditValue(vendor, session.user.id, 'vendor.assess', 'vendor_risk_record', data.vendorId, {
      inherentRisk: data.inherentRisk,
      residualRisk: data.residualRisk,
      nextReviewAt: values.nextReviewAt.toISOString(),
      timeZone,
    }));
  });
  revalidateGovernance(data.engagementId);
}

export async function transitionVendorRisk(input: z.infer<typeof transitionVendorSchema>) {
  const session = await requireSession();
  const data = transitionVendorSchema.parse(input);
  const vendor = await requireVendor(data.vendorId, data.engagementId);
  assertVendorTransition(vendor.status as VendorStatus, data.nextStatus);
  const approval = data.nextStatus === 'approved';
  await requirePermission(approval ? ACTIONS.vendorRiskAccept : ACTIONS.vendorManage, permissionContext(session.user.id, vendor));
  const statement = data.riskAcceptanceStatement || vendor.riskAcceptanceStatement;
  if (approval) {
    const blockers = vendorApprovalBlockers({
      dueDiligenceSummary: vendor.dueDiligenceSummary,
      residualRisk: vendor.residualRisk as RiskRating | null,
      nextReviewAt: vendor.nextReviewAt,
      riskAcceptanceStatement: statement,
    });
    if (blockers.length > 0) throw new Error(`Vendor cannot be approved: ${blockers.join(' ')}`);
  }
  const now = new Date();
  const changes: Partial<typeof vendorRiskRecords.$inferInsert> = {
    status: data.nextStatus,
    updatedBy: session.user.id,
    updatedAt: now,
  };
  if (approval) {
    changes.riskAcceptanceStatement = statement || null;
    changes.riskAcceptedBy = session.user.id;
    changes.riskAcceptedAt = now;
  }
  await db.transaction(async (tx) => {
    await tx.update(vendorRiskRecords).set(changes).where(and(
      eq(vendorRiskRecords.id, data.vendorId),
      eq(vendorRiskRecords.tenantId, vendor.tenantId),
      eq(vendorRiskRecords.engagementId, data.engagementId),
    ));
    await tx.insert(auditLog).values(auditValue(vendor, session.user.id, `vendor.${data.nextStatus}`, 'vendor_risk_record', data.vendorId, {
      from: vendor.status,
      to: data.nextStatus,
      residualRisk: vendor.residualRisk,
      riskAccepted: approval,
    }));
  });
  revalidateGovernance(data.engagementId);
}

async function changeCampaignStatus(
  campaign: Awaited<ReturnType<typeof requireCampaign>>,
  actorUserId: string,
  status: AccessReviewStatus,
  timestamps: { startedAt?: Date; completedAt?: Date },
) {
  await db.transaction(async (tx) => {
    await tx.update(accessReviewCampaigns).set({ status, ...timestamps, updatedAt: new Date() }).where(and(
      eq(accessReviewCampaigns.id, campaign.id),
      eq(accessReviewCampaigns.tenantId, campaign.tenantId),
      eq(accessReviewCampaigns.engagementId, campaign.engagementId),
    ));
    await tx.insert(auditLog).values(auditValue(campaign, actorUserId, `access_review.${status}`, 'access_review_campaign', campaign.id, {
      from: campaign.status,
      to: status,
    }));
  });
  revalidateGovernance(campaign.engagementId);
}

async function requireEngagement(engagementId: string) {
  const [row] = await db.select({ tenantId: engagements.tenantId, engagementId: engagements.id })
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!row) throw new Error('Engagement not found.');
  return row;
}

async function requirePolicy(policyId: string, engagementId: string) {
  const [row] = await db.select().from(governancePolicies).where(and(
    eq(governancePolicies.id, policyId),
    eq(governancePolicies.engagementId, engagementId),
  )).limit(1);
  if (!row) throw new Error('Policy not found.');
  return row;
}

async function requirePersonnel(personnelId: string, engagementId: string) {
  const [row] = await db.select().from(personnelAssuranceRecords).where(and(
    eq(personnelAssuranceRecords.id, personnelId),
    eq(personnelAssuranceRecords.engagementId, engagementId),
  )).limit(1);
  if (!row) throw new Error('Personnel record not found.');
  return row;
}

async function requireCampaign(campaignId: string, engagementId: string) {
  const [row] = await db.select().from(accessReviewCampaigns).where(and(
    eq(accessReviewCampaigns.id, campaignId),
    eq(accessReviewCampaigns.engagementId, engagementId),
  )).limit(1);
  if (!row) throw new Error('Access review campaign not found.');
  return row;
}

async function requireAccessReviewItem(itemId: string, engagementId: string) {
  const [row] = await db.select({
    id: accessReviewItems.id,
    tenantId: accessReviewItems.tenantId,
    engagementId: accessReviewItems.engagementId,
    campaignId: accessReviewItems.campaignId,
    campaignStatus: accessReviewCampaigns.status,
  }).from(accessReviewItems)
    .innerJoin(accessReviewCampaigns, eq(accessReviewCampaigns.id, accessReviewItems.campaignId))
    .where(and(eq(accessReviewItems.id, itemId), eq(accessReviewItems.engagementId, engagementId)))
    .limit(1);
  if (!row) throw new Error('Access review item not found.');
  return row;
}

async function requireVendor(vendorId: string, engagementId: string) {
  const [row] = await db.select().from(vendorRiskRecords).where(and(
    eq(vendorRiskRecords.id, vendorId),
    eq(vendorRiskRecords.engagementId, engagementId),
  )).limit(1);
  if (!row) throw new Error('Vendor record not found.');
  return row;
}

async function assertClientMember(userId: string, context: { tenantId: string; engagementId: string }) {
  const [member] = await db.select({ id: engagementMembers.id }).from(engagementMembers).where(and(
    eq(engagementMembers.tenantId, context.tenantId),
    eq(engagementMembers.engagementId, context.engagementId),
    eq(engagementMembers.userId, userId),
    inArray(engagementMembers.role, ['client_admin', 'client_contributor']),
    isNull(engagementMembers.deletedAt),
  )).limit(1);
  if (!member) throw new Error('Owner must be an active client member of this engagement.');
}

function permissionContext(userId: string, context: { tenantId: string; engagementId: string }) {
  return { userId, tenantId: context.tenantId, engagementId: context.engagementId };
}

function parseOptionalDate(value: string | null | undefined, timeZone: string) {
  return value ? zonedDateEndToUtc(value, timeZone) : null;
}

function auditValue(
  context: { tenantId: string; engagementId: string },
  actorUserId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  afterJson: Record<string, unknown>,
) {
  return {
    tenantId: context.tenantId,
    engagementId: context.engagementId,
    actorUserId,
    action,
    resourceType,
    resourceId,
    afterJson: afterJson as never,
  };
}

function revalidateGovernance(engagementId: string) {
  revalidatePath(`/engagements/${engagementId}/governance`);
}
