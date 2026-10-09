import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { users } from '@/db/schema/auth';
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
import { OperationalGrcWorkspace } from '@/components/governance/OperationalGrcWorkspace';
import { requireEngagementPage } from '@/lib/auth/engagement-access';
import { userTimeZone } from '@/lib/auth/user-timezone';
import { db } from '@/lib/db/client';
import { governanceOverdueItems } from '@/lib/governance/workflow';
import { ACTIONS, isPermitted } from '@/lib/rbac/matrix';
import { requirePermission, rolesForUser } from '@/lib/rbac/require';
import { formatDateInput } from '@/lib/timezone';

export default async function GovernancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: engagementId } = await params;
  const { session } = await requireEngagementPage(engagementId);
  const [engagement] = await db.select({ tenantId: engagements.tenantId }).from(engagements)
    .where(eq(engagements.id, engagementId)).limit(1);
  if (!engagement) throw new Error('Engagement not found.');
  await requirePermission(ACTIONS.governanceView, {
    userId: session.user.id,
    tenantId: engagement.tenantId,
    engagementId,
  });

  const [roles, timeZone, policies, attestations, personnel, campaigns, reviewItems, vendors, members] = await Promise.all([
    rolesForUser({ userId: session.user.id, tenantId: engagement.tenantId, engagementId }),
    userTimeZone(session.user.id),
    db.select().from(governancePolicies).where(and(
      eq(governancePolicies.tenantId, engagement.tenantId),
      eq(governancePolicies.engagementId, engagementId),
    )).orderBy(desc(governancePolicies.createdAt)),
    db.select({
      id: policyAttestations.id,
      policyId: policyAttestations.policyId,
      policyTitle: governancePolicies.title,
      policyVersion: policyAttestations.policyVersion,
      userId: policyAttestations.userId,
      userName: users.name,
      userEmail: users.email,
      status: policyAttestations.status,
      dueAt: policyAttestations.dueAt,
      acceptedAt: policyAttestations.acceptedAt,
    }).from(policyAttestations)
      .innerJoin(governancePolicies, eq(governancePolicies.id, policyAttestations.policyId))
      .innerJoin(users, eq(users.id, policyAttestations.userId))
      .where(and(
        eq(policyAttestations.tenantId, engagement.tenantId),
        eq(policyAttestations.engagementId, engagementId),
      )).orderBy(asc(policyAttestations.dueAt)),
    db.select().from(personnelAssuranceRecords).where(and(
      eq(personnelAssuranceRecords.tenantId, engagement.tenantId),
      eq(personnelAssuranceRecords.engagementId, engagementId),
    )).orderBy(asc(personnelAssuranceRecords.personName)),
    db.select().from(accessReviewCampaigns).where(and(
      eq(accessReviewCampaigns.tenantId, engagement.tenantId),
      eq(accessReviewCampaigns.engagementId, engagementId),
    )).orderBy(desc(accessReviewCampaigns.createdAt)),
    db.select().from(accessReviewItems).where(and(
      eq(accessReviewItems.tenantId, engagement.tenantId),
      eq(accessReviewItems.engagementId, engagementId),
    )).orderBy(asc(accessReviewItems.createdAt)),
    db.select().from(vendorRiskRecords).where(and(
      eq(vendorRiskRecords.tenantId, engagement.tenantId),
      eq(vendorRiskRecords.engagementId, engagementId),
    )).orderBy(asc(vendorRiskRecords.vendorName)),
    db.select({ id: users.id, name: users.name, email: users.email })
      .from(engagementMembers)
      .innerJoin(users, eq(users.id, engagementMembers.userId))
      .where(and(
        eq(engagementMembers.tenantId, engagement.tenantId),
        eq(engagementMembers.engagementId, engagementId),
        eq(engagementMembers.role, 'client_admin'),
        isNull(engagementMembers.deletedAt),
      )),
  ]);

  const contributorMembers = await db.select({ id: users.id, name: users.name, email: users.email })
    .from(engagementMembers)
    .innerJoin(users, eq(users.id, engagementMembers.userId))
    .where(and(
      eq(engagementMembers.tenantId, engagement.tenantId),
      eq(engagementMembers.engagementId, engagementId),
      eq(engagementMembers.role, 'client_contributor'),
      isNull(engagementMembers.deletedAt),
    ));
  const memberMap = new Map([...members, ...contributorMembers].map((member) => [member.id, {
    id: member.id,
    label: member.name ? `${member.name} (${member.email})` : member.email,
  }]));
  const overdue = governanceOverdueItems({
    now: new Date(),
    policies,
    attestations: attestations.map((attestation) => ({
      id: attestation.id,
      policyTitle: attestation.policyTitle,
      status: attestation.status,
      dueAt: attestation.dueAt,
    })),
    personnel,
    accessReviews: campaigns,
    vendors,
  });
  const permissions = {
    canWritePolicy: roles.some((role) => isPermitted(ACTIONS.policyWrite, role)),
    canApprovePolicy: roles.some((role) => isPermitted(ACTIONS.policyApprove, role)),
    canAcceptPolicy: roles.some((role) => isPermitted(ACTIONS.policyAccept, role)),
    canManagePersonnel: roles.some((role) => isPermitted(ACTIONS.personnelManage, role)),
    canManageAccessReviews: roles.some((role) => isPermitted(ACTIONS.accessReviewManage, role)),
    canManageVendors: roles.some((role) => isPermitted(ACTIONS.vendorManage, role)),
    canAcceptVendorRisk: roles.some((role) => isPermitted(ACTIONS.vendorRiskAccept, role)),
  };

  return <OperationalGrcWorkspace
    engagementId={engagementId}
    currentUserId={session.user.id}
    timeZone={timeZone}
    permissions={permissions}
    members={Array.from(memberMap.values()).sort((a, b) => a.label.localeCompare(b.label))}
    overdue={overdue.map((item) => ({ ...item, dueAt: item.dueAt.toISOString() }))}
    summary={{
      publishedPolicies: policies.filter((policy) => policy.status === 'published').length,
      pendingAttestations: attestations.filter((attestation) => attestation.status === 'pending').length,
      personnelExceptions: personnel.filter((record) => record.screeningStatus === 'pending' || record.screeningStatus === 'expired' || (record.employmentStatus === 'terminated' && !record.offboardingCompletedAt)).length,
      openAccessDecisions: reviewItems.filter((item) => item.decision === 'pending' || item.remediationStatus === 'open').length,
      vendorsNeedingAction: vendors.filter((vendor) => !['monitoring', 'closed'].includes(vendor.status)).length,
    }}
    policies={policies.map((policy) => ({
      ...policy,
      reviewDueAt: policy.reviewDueAt.toISOString(),
      reviewDate: formatDateInput(policy.reviewDueAt, timeZone),
      approvedAt: policy.approvedAt?.toISOString() ?? null,
      publishedAt: policy.publishedAt?.toISOString() ?? null,
      retiredAt: policy.retiredAt?.toISOString() ?? null,
      createdAt: policy.createdAt.toISOString(),
      updatedAt: policy.updatedAt.toISOString(),
    }))}
    attestations={attestations.map((attestation) => ({
      ...attestation,
      dueAt: attestation.dueAt.toISOString(),
      acceptedAt: attestation.acceptedAt?.toISOString() ?? null,
      userLabel: attestation.userName ? `${attestation.userName} (${attestation.userEmail})` : attestation.userEmail,
    }))}
    personnel={personnel.map((record) => ({
      ...record,
      screeningExpiresDate: record.screeningExpiresAt ? formatDateInput(record.screeningExpiresAt, timeZone) : '',
      trainingDueDate: record.trainingDueAt ? formatDateInput(record.trainingDueAt, timeZone) : '',
      offboardingDueDate: record.offboardingDueAt ? formatDateInput(record.offboardingDueAt, timeZone) : '',
      screeningExpiresAt: record.screeningExpiresAt?.toISOString() ?? null,
      trainingDueAt: record.trainingDueAt?.toISOString() ?? null,
      trainingCompletedAt: record.trainingCompletedAt?.toISOString() ?? null,
      offboardingDueAt: record.offboardingDueAt?.toISOString() ?? null,
      offboardingCompletedAt: record.offboardingCompletedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    }))}
    campaigns={campaigns.map((campaign) => ({
      ...campaign,
      dueAt: campaign.dueAt.toISOString(),
      startedAt: campaign.startedAt?.toISOString() ?? null,
      completedAt: campaign.completedAt?.toISOString() ?? null,
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
      items: reviewItems.filter((item) => item.campaignId === campaign.id).map((item) => ({
        ...item,
        decidedAt: item.decidedAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    }))}
    vendors={vendors.map((vendor) => ({
      ...vendor,
      contractExpiryDate: vendor.contractExpiresAt ? formatDateInput(vendor.contractExpiresAt, timeZone) : '',
      nextReviewDate: vendor.nextReviewAt ? formatDateInput(vendor.nextReviewAt, timeZone) : '',
      contractExpiresAt: vendor.contractExpiresAt?.toISOString() ?? null,
      nextReviewAt: vendor.nextReviewAt?.toISOString() ?? null,
      lastAssessedAt: vendor.lastAssessedAt?.toISOString() ?? null,
      riskAcceptedAt: vendor.riskAcceptedAt?.toISOString() ?? null,
      createdAt: vendor.createdAt.toISOString(),
      updatedAt: vendor.updatedAt.toISOString(),
    }))}
  />;
}
