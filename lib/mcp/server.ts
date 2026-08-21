import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { createClient } from '@/app/actions/clients';
import { createEngagement, updateEngagementState } from '@/app/actions/engagements';
import {
  createEvidenceRequest,
  finaliseEvidenceUpload,
  getEvidenceDownloadUrl,
  reviewEvidence,
  startEvidenceUpload,
} from '@/app/actions/evidence';
import {
  decideApplicability,
  updateControlAssessmentRecord,
  writeImplementationStatement,
} from '@/app/actions/applicability';
import {
  generateAuditEvidencePackage,
  getAuditEvidencePackageDownloadUrl,
  updateAuditReadinessRequirement,
  upsertAuditReadinessProfile,
} from '@/app/actions/audit-readiness';
import {
  createFinding,
  recordFindingRetest,
  signOffFinding,
  updateFindingStatus,
} from '@/app/actions/findings';
import { inviteToEngagement } from '@/app/actions/invitations';
import { auditLog } from '@/db/schema/audit';
import {
  auditEvidencePackages,
  auditReadinessProfiles,
  auditReadinessRequirementEvidence,
  auditReadinessRequirements,
} from '@/db/schema/audit-readiness';
import { clients } from '@/db/schema/clients';
import { clientOrganisations, engagements, systems } from '@/db/schema/engagements';
import {
  evidenceItemControls,
  evidenceItems,
  evidenceRequestControls,
  evidenceRequests,
} from '@/db/schema/evidence';
import { findings } from '@/db/schema/findings';
import {
  engagementControls,
  frameworkControls,
  frameworkImports,
  frameworks,
} from '@/db/schema/frameworks';
import { engagementMembers } from '@/db/schema/tenants';
import { runWithMachineActor } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { buildAuditReadinessGates, type AuditRequirementStatus, type AuditType } from '@/lib/audit-readiness';
import { getEngagementCoverage } from '@/lib/assessment/coverage';
import { type McpPrincipal, requireMcpScope } from './auth';
import { ACTIONS, isPermitted } from '@/lib/rbac/matrix';
import { requirePermission, rolesForUser } from '@/lib/rbac/require';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const limit = z.number().int().min(1).max(500).default(100);
const offset = z.number().int().min(0).default(0);

export function createOakAttestMcpServer(principal: McpPrincipal): McpServer {
  const server = new McpServer(
    { name: 'oakattest-assessment-automation', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  tool(server, principal, 'get_capabilities', {
    title: 'Get OakAttest MCP capabilities',
    description: 'Describe the complete assessment automation workflow, endpoint rules, token scopes, and role boundaries.',
    inputSchema: z.object({}),
    scope: 'assessment:read',
    readOnly: true,
    handler: async () => ({
      tenantId: principal.tenantId,
      actor: principal.actor,
      scopes: principal.scopes,
      workflow: [
        'list_frameworks', 'list_clients', 'create_client', 'create_assessment',
        'list_assessments', 'get_assessment', 'update_assessment_state', 'list_controls',
        'decide_control_applicability', 'write_implementation_statement',
        'record_control_assessment', 'create_evidence_request', 'start_evidence_upload',
        'finalize_evidence_upload', 'list_evidence', 'review_evidence', 'download_evidence',
        'configure_audit_readiness', 'get_audit_readiness', 'update_audit_requirement',
        'create_finding', 'update_finding_status', 'record_finding_retest',
        'sign_off_finding', 'invite_engagement_member', 'invite_auditor',
        'generate_audit_package', 'download_audit_package',
      ],
      uploadProtocol: [
        'Call start_evidence_upload with filename, MIME type, exact byte count, declared data classification, and links. The upload is rejected above the engagement workspace classification.',
        'PUT the raw bytes to uploadUrl with every returned header.',
        'Compute SHA-256 over the exact bytes and call finalize_evidence_upload.',
      ],
      roleBoundary: 'Every tool executes as the token creator. Existing tenant and engagement RBAC remains authoritative; assessor and client evidence duties stay independent.',
    }),
  });

  tool(server, principal, 'list_frameworks', {
    title: 'List assessment frameworks',
    description: 'List frameworks and imported catalogue revisions available to this tenant before creating an assessment.',
    inputSchema: z.object({}),
    scope: 'assessment:read',
    readOnly: true,
    handler: async () => listFrameworks(principal),
  });

  tool(server, principal, 'list_clients', {
    title: 'List client organisations',
    description: 'List reusable client records available for new assessments.',
    inputSchema: z.object({ limit, offset }),
    scope: 'assessment:read',
    readOnly: true,
    handler: async ({ limit: take, offset: skip }) => listClients(principal, take, skip),
  });

  tool(server, principal, 'create_client', {
    title: 'Create a client organisation',
    description: 'Create the complete client record required before an assessment can start.',
    inputSchema: z.object({
      name: z.string().min(2).max(160),
      businessNumber: z.string().max(64).optional(),
      primaryContactName: z.string().min(2).max(160),
      primaryContactEmail: z.string().email(),
      address: z.string().max(500).optional(),
      notes: z.string().max(4000).optional(),
    }),
    scope: 'assessment:write',
    readOnly: false,
    handler: async (input) => createClient({ tenantId: principal.tenantId, ...input }),
  });

  tool(server, principal, 'list_assessments', {
    title: 'List assessments',
    description: 'List assessments visible to the token actor with framework, client, phase, and status.',
    inputSchema: z.object({ limit, offset }),
    scope: 'assessment:read',
    readOnly: true,
    handler: async ({ limit: take, offset: skip }) => listAssessments(principal, take, skip),
  });

  tool(server, principal, 'create_assessment', {
    title: 'Create an assessment',
    description: 'Create and scope a new assessment against ISO 27001, SOC 2, ISM, NIST, FedRAMP, or another loaded framework revision.',
    inputSchema: z.object({
      name: z.string().min(2).max(200),
      reference: z.string().max(60).optional(),
      clientId: uuid,
      frameworkKey: z.string().min(1),
      frameworkRevision: z.string().min(1),
      classification: z.enum(['OFFICIAL', 'OFFICIAL_SENSITIVE', 'PROTECTED', 'SECRET', 'TOP_SECRET']).default('OFFICIAL'),
      assessmentType: z.enum(['standard', 'cloud_irap']).default('standard'),
      cloudProvider: z.enum(['none', 'aws', 'azure', 'gcp']).default('none'),
      systemName: z.string().min(2),
      systemDescription: z.string().optional(),
      environment: z.string().optional(),
    }),
    scope: 'assessment:write',
    readOnly: false,
    handler: async ({ systemName, systemDescription, environment, ...input }) =>
      createEngagement({
        ...input,
        tenantId: principal.tenantId,
        system: { name: systemName, description: systemDescription, environment },
      }),
  });

  tool(server, principal, 'get_assessment', {
    title: 'Get assessment workspace',
    description: 'Get one assessment with system, client, members, evidence requests, evidence, findings, audit readiness, packages, and summary counts.',
    inputSchema: z.object({ engagementId: uuid }),
    scope: 'assessment:read',
    readOnly: true,
    handler: async ({ engagementId }) => getAssessment(principal, engagementId),
  });

  tool(server, principal, 'update_assessment_state', {
    title: 'Update assessment phase and status',
    description: 'Move an assessment through scoping, evidence, fieldwork, findings, certification, and maintenance.',
    inputSchema: z.object({
      engagementId: uuid,
      phase: z.enum(['scoping', 'evidence', 'fieldwork', 'findings', 'certification', 'maintenance']),
      status: z.enum(['draft', 'active', 'on_hold', 'completed', 'archived']),
    }),
    scope: 'assessment:write',
    readOnly: false,
    handler: updateEngagementState,
  });

  tool(server, principal, 'list_controls', {
    title: 'List assessment controls',
    description: 'List control IDs, catalogue text, applicability, implementation, assessment workpaper fields, and status.',
    inputSchema: z.object({ engagementId: uuid, limit, offset }),
    scope: 'assessment:read',
    readOnly: true,
    handler: async ({ engagementId, limit: take, offset: skip }) => listControls(principal, engagementId, take, skip),
  });

  tool(server, principal, 'decide_control_applicability', {
    title: 'Decide control applicability',
    description: 'Record the assessor applicability decision and mandatory justification for one control.',
    inputSchema: z.object({
      engagementId: uuid,
      engagementControlId: uuid,
      applicable: z.enum(['applicable', 'not_applicable', 'compensating']),
      justification: z.string().min(10).max(4000),
    }),
    scope: 'assessment:write',
    readOnly: false,
    handler: decideApplicability,
  });

  tool(server, principal, 'write_implementation_statement', {
    title: 'Write control implementation statement',
    description: 'Record the client-authored implementation statement for a control. Client-side roles only.',
    inputSchema: z.object({ engagementId: uuid, engagementControlId: uuid, statement: z.string().max(8000) }),
    scope: 'assessment:write',
    readOnly: false,
    handler: writeImplementationStatement,
  });

  tool(server, principal, 'record_control_assessment', {
    title: 'Record control assessment workpaper',
    description: 'Record methods, sampled objects, evidence quality, and limitations for a control.',
    inputSchema: z.object({
      engagementId: uuid,
      engagementControlId: uuid,
      assessmentMethods: z.string().max(1000).optional(),
      assessmentObjects: z.string().max(2000).optional(),
      evidenceQuality: z.enum(['excellent', 'good', 'fair', 'poor', 'insufficient']).optional(),
      evidenceLimitations: z.string().max(4000).optional(),
    }),
    scope: 'assessment:write',
    readOnly: false,
    handler: updateControlAssessmentRecord,
  });

  tool(server, principal, 'create_evidence_request', {
    title: 'Create an evidence request',
    description: 'Request an artifact from the client and link it to one or more framework control UUIDs.',
    inputSchema: z.object({
      engagementId: uuid,
      title: z.string().min(2).max(200),
      description: z.string().max(4000).optional(),
      artifactType: z.string().max(100).optional(),
      dueAt: z.string().datetime().optional(),
      controlIds: z.array(uuid).min(1).max(500),
    }),
    scope: 'evidence:write',
    readOnly: false,
    handler: async ({ controlIds, ...input }) => createEvidenceRequest({ ...input, ismControlIds: controlIds }),
  });

  tool(server, principal, 'start_evidence_upload', {
    title: 'Start evidence upload',
    description: 'Reserve a versioned evidence record and return a short-lived presigned PUT URL plus required headers.',
    inputSchema: z.object({
      engagementId: uuid,
      evidenceRequestId: uuid.optional(),
      filename: z.string().min(1).max(255),
      mimeType: z.string().max(120).optional(),
      sizeBytes: z.number().int().positive().max(2_000_000_000),
      dataClassification: z.enum([
        'OFFICIAL',
        'OFFICIAL_SENSITIVE',
        'PROTECTED',
        'SECRET',
        'TOP_SECRET',
      ]).describe('Declared sensitivity of the uploaded bytes. Upload is blocked above the engagement workspace classification.'),
      controlIds: z.array(uuid).max(500).optional(),
    }),
    scope: 'evidence:write',
    readOnly: false,
    handler: async ({ controlIds, ...input }) => startEvidenceUpload({ ...input, ismControlIds: controlIds }),
  });

  tool(server, principal, 'finalize_evidence_upload', {
    title: 'Finalize evidence upload',
    description: 'Verify uploaded object bytes, exact size, and SHA-256 before marking evidence usable. Mismatches are quarantined.',
    inputSchema: z.object({
      engagementId: uuid,
      evidenceItemId: uuid,
      sha256: z.string().regex(/^[a-f0-9]{64}$/i),
      description: z.string().max(2000).optional(),
    }),
    scope: 'evidence:write',
    readOnly: false,
    handler: finaliseEvidenceUpload,
  });

  tool(server, principal, 'list_evidence', {
    title: 'List evidence and requests',
    description: 'List evidence requests, uploaded versions, checksums, review states, control links, and quarantine state.',
    inputSchema: z.object({ engagementId: uuid, limit, offset }),
    scope: 'evidence:read',
    readOnly: true,
    handler: async ({ engagementId, limit: take, offset: skip }) => listEvidence(principal, engagementId, take, skip),
  });

  tool(server, principal, 'review_evidence', {
    title: 'Review evidence',
    description: 'Accept, reject, or mark finalised evidence insufficient with assessor notes.',
    inputSchema: z.object({
      engagementId: uuid,
      evidenceItemId: uuid,
      status: z.enum(['accepted', 'insufficient', 'rejected']),
      notes: z.string().max(4000).optional(),
    }),
    scope: 'evidence:write',
    readOnly: false,
    handler: reviewEvidence,
  });

  tool(server, principal, 'download_evidence', {
    title: 'Get evidence download URL',
    description: 'Return an audit-logged, five-minute download URL for verified evidence.',
    inputSchema: z.object({ engagementId: uuid, evidenceItemId: uuid }),
    scope: 'evidence:read',
    readOnly: true,
    handler: getEvidenceDownloadUrl,
  });

  tool(server, principal, 'configure_audit_readiness', {
    title: 'Configure ISO or SOC 2 audit readiness',
    description: 'Create or update the ISO 27001 Stage 1, SOC 2 Type I, or SOC 2 Type II plan and seed its complete requirement checklist.',
    inputSchema: z.object({
      engagementId: uuid,
      auditType: z.enum(['iso_27001_stage_1', 'soc_2_type_1', 'soc_2_type_2']),
      status: z.enum(['planning', 'in_progress', 'ready', 'in_audit', 'complete']),
      auditFirm: z.string().max(240).optional().nullable(),
      leadAuditor: z.string().max(240).optional().nullable(),
      scopeStatement: z.string().min(20).max(12_000),
      trustServiceCategories: z.array(z.enum(['security', 'availability', 'processing_integrity', 'confidentiality', 'privacy'])).max(5),
      periodStart: date.optional().nullable(),
      periodEnd: date.optional().nullable(),
      targetAuditDate: date,
    }),
    scope: 'audit:write',
    readOnly: false,
    handler: upsertAuditReadinessProfile,
  });

  tool(server, principal, 'get_audit_readiness', {
    title: 'Get audit readiness',
    description: 'Get checklist ownership, dates, linked evidence, live blocking gates, readiness score, and generated packages.',
    inputSchema: z.object({ engagementId: uuid }),
    scope: 'audit:read',
    readOnly: true,
    handler: async ({ engagementId }) => getAuditReadiness(principal, engagementId),
  });

  tool(server, principal, 'update_audit_requirement', {
    title: 'Update audit requirement',
    description: 'Assign, date, annotate, complete, and link verified evidence to one readiness requirement.',
    inputSchema: z.object({
      engagementId: uuid,
      requirementId: uuid,
      status: z.enum(['not_started', 'in_progress', 'blocked', 'ready', 'not_applicable']),
      ownerUserId: uuid.optional().nullable(),
      dueDate: date.optional().nullable(),
      notes: z.string().max(6000).optional().nullable(),
      evidenceItemIds: z.array(uuid).max(100).default([]),
    }),
    scope: 'audit:write',
    readOnly: false,
    handler: updateAuditReadinessRequirement,
  });

  tool(server, principal, 'create_finding', {
    title: 'Create assessment finding',
    description: 'Create a numbered non-conformance or observation linked to controls and evidence.',
    inputSchema: z.object({
      engagementId: uuid,
      type: z.enum(['non_conformance', 'observation']),
      severity: z.enum(['critical', 'high', 'medium', 'low']),
      title: z.string().min(2).max(300),
      description: z.string().min(10).max(8000),
      recommendation: z.string().max(8000).optional(),
      controlIds: z.array(uuid).max(500).optional(),
      evidenceItemIds: z.array(uuid).max(500).optional(),
    }),
    scope: 'assessment:write',
    readOnly: false,
    handler: async ({ controlIds, ...input }) => createFinding({ ...input, ismControlIds: controlIds }),
  });

  tool(server, principal, 'update_finding_status', {
    title: 'Update finding status',
    description: 'Move a finding through open, remediation, retest, closure, or accepted-risk states; closure safeguards still apply.',
    inputSchema: z.object({
      engagementId: uuid,
      findingId: uuid,
      status: z.enum(['open', 'in_progress', 'awaiting_retest', 'closed', 'accepted_risk']),
    }),
    scope: 'assessment:write',
    readOnly: false,
    handler: updateFindingStatus,
  });

  tool(server, principal, 'record_finding_retest', {
    title: 'Record finding retest',
    description: 'Record retest method, outcome, notes, linked proof evidence, and timestamp before finding closure.',
    inputSchema: z.object({
      engagementId: uuid,
      findingId: uuid,
      method: z.string().min(2).max(1000),
      result: z.enum(['passed', 'failed', 'partially_remediated']),
      notes: z.string().max(4000).optional(),
      evidenceItemIds: z.array(uuid).max(500).optional(),
      retestedAt: z.string().datetime().optional(),
    }),
    scope: 'assessment:write',
    readOnly: false,
    handler: recordFindingRetest,
  });

  tool(server, principal, 'sign_off_finding', {
    title: 'Sign off finding',
    description: 'Apply lead-assessor sign-off required by the finding closure safeguards.',
    inputSchema: z.object({ engagementId: uuid, findingId: uuid }),
    scope: 'assessment:write',
    readOnly: false,
    handler: signOffFinding,
  });

  tool(server, principal, 'invite_engagement_member', {
    title: 'Invite assessment participant',
    description: 'Invite an assessor, client administrator, client contributor, or observer so evidence and assessment duties can be completed under the correct independent role.',
    inputSchema: z.object({
      engagementId: uuid,
      email: z.string().email(),
      role: z.enum(['lead_assessor', 'assessor', 'client_admin', 'client_contributor', 'read_only_observer']),
    }),
    scope: 'assessment:write',
    readOnly: false,
    handler: inviteToEngagement,
  });

  tool(server, principal, 'invite_auditor', {
    title: 'Invite an external auditor',
    description: 'Email a 72-hour read-only observer invitation for live assessment and evidence inspection.',
    inputSchema: z.object({ engagementId: uuid, email: z.string().email() }),
    scope: 'audit:write',
    readOnly: false,
    handler: async ({ engagementId, email }) => inviteToEngagement({ engagementId, email, role: 'read_only_observer' }),
  });

  tool(server, principal, 'generate_audit_package', {
    title: 'Generate timestamped audit package',
    description: 'Generate a versioned ZIP containing verified evidence bytes, hashes, manifest, controls, findings, checklist, and audit log.',
    inputSchema: z.object({ engagementId: uuid }),
    scope: 'audit:write',
    readOnly: false,
    handler: generateAuditEvidencePackage,
  });

  tool(server, principal, 'download_audit_package', {
    title: 'Get audit package download URL',
    description: 'Return an audit-logged, five-minute download URL for a versioned audit package.',
    inputSchema: z.object({ engagementId: uuid, packageId: uuid }),
    scope: 'audit:read',
    readOnly: true,
    handler: getAuditEvidencePackageDownloadUrl,
  });

  return server;
}

type McpInputSchema = z.ZodObject<z.ZodRawShape>;

type ToolConfig<T extends McpInputSchema> = {
  title: string;
  description: string;
  inputSchema: T;
  scope: import('@/db/schema/mcp').McpScope;
  readOnly: boolean;
  handler: (input: z.output<T>) => Promise<unknown>;
};

function tool<T extends McpInputSchema>(
  server: McpServer,
  principal: McpPrincipal,
  name: string,
  config: ToolConfig<T>,
): void {
  // SDK 2.0 bundles its own Zod declaration identity; OakAttest's newer Zod
  // is runtime-compatible but TypeScript cannot unify the two private types.
  const registerTool = server.registerTool.bind(server) as unknown as (
    toolName: string,
    toolConfig: {
      title: string;
      description: string;
      inputSchema: z.ZodType;
      annotations: {
        readOnlyHint: boolean;
        destructiveHint: boolean;
        idempotentHint: boolean;
        openWorldHint: boolean;
      };
    },
    callback: (input: unknown) => Promise<CallToolResult>,
  ) => void;
  registerTool(
    name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.inputSchema,
      annotations: {
        readOnlyHint: config.readOnly,
        destructiveHint: false,
        idempotentHint: config.readOnly,
        openWorldHint: name === 'invite_auditor',
      },
    },
    async (input: unknown) => executeTool(
      principal,
      name,
      config.scope,
      () => config.handler(config.inputSchema.parse(input)),
    ),
  );
}

async function executeTool(
  principal: McpPrincipal,
  name: string,
  scope: import('@/db/schema/mcp').McpScope,
  operation: () => Promise<unknown>,
): Promise<CallToolResult> {
  const startedAt = Date.now();
  try {
    requireMcpScope(principal, scope);
    const value = await runWithMachineActor(principal.actor, operation);
    await recordToolCall(principal, name, true, Date.now() - startedAt);
    const result = { result: serialise(value) };
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result };
  } catch (error) {
    const message = safeError(error);
    await recordToolCall(principal, name, false, Date.now() - startedAt, message).catch(() => undefined);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
      isError: true as const,
    };
  }
}

async function recordToolCall(
  principal: McpPrincipal,
  name: string,
  succeeded: boolean,
  durationMs: number,
  error?: string,
): Promise<void> {
  await db.insert(auditLog).values({
    tenantId: principal.tenantId,
    actorType: 'integration',
    actorUserId: principal.actor.id,
    action: 'mcp.tool.call',
    resourceType: 'mcp_tool',
    resourceId: name,
    afterJson: { tokenId: principal.tokenId, succeeded, durationMs, error: error ?? null } as never,
  });
}

async function listFrameworks(principal: McpPrincipal) {
  await requirePermission(ACTIONS.engagementView, { userId: principal.actor.id, tenantId: principal.tenantId });
  const [frameworkRows, imports] = await Promise.all([
    db.select().from(frameworks).orderBy(frameworks.label),
    db
      .select({ frameworkId: frameworkImports.frameworkId, revision: frameworkImports.revision, controlCount: frameworkImports.controlCount, completedAt: frameworkImports.completedAt })
      .from(frameworkImports)
      .where(isNull(frameworkImports.tenantId))
      .orderBy(desc(frameworkImports.completedAt)),
  ]);
  const tenantImports = await db
    .select({ frameworkId: frameworkImports.frameworkId, revision: frameworkImports.revision, controlCount: frameworkImports.controlCount, completedAt: frameworkImports.completedAt })
    .from(frameworkImports)
    .where(eq(frameworkImports.tenantId, principal.tenantId))
    .orderBy(desc(frameworkImports.completedAt));
  return frameworkRows.map((framework) => ({
    ...framework,
    revisions: [...imports, ...tenantImports].filter((row) => row.frameworkId === framework.id),
  }));
}

async function listClients(principal: McpPrincipal, take: number, skip: number) {
  await requirePermission(ACTIONS.clientView, { userId: principal.actor.id, tenantId: principal.tenantId });
  return db
    .select()
    .from(clients)
    .where(and(eq(clients.tenantId, principal.tenantId), isNull(clients.deletedAt)))
    .orderBy(clients.name)
    .limit(take)
    .offset(skip);
}

async function listAssessments(principal: McpPrincipal, take: number, skip: number) {
  const rows = await db
    .select({
      id: engagements.id,
      name: engagements.name,
      reference: engagements.reference,
      phase: engagements.phase,
      status: engagements.status,
      frameworkKey: frameworks.key,
      frameworkLabel: frameworks.label,
      frameworkRevision: engagements.frameworkRevision,
      clientName: clientOrganisations.name,
      targetCertificationAt: engagements.targetCertificationAt,
      updatedAt: engagements.updatedAt,
    })
    .from(engagements)
    .innerJoin(frameworks, eq(frameworks.id, engagements.frameworkId))
    .leftJoin(clientOrganisations, eq(clientOrganisations.engagementId, engagements.id))
    .where(and(eq(engagements.tenantId, principal.tenantId), isNull(engagements.deletedAt)))
    .orderBy(desc(engagements.updatedAt));
  const visible = [];
  for (const row of rows) {
    const roles = await rolesForUser({ userId: principal.actor.id, tenantId: principal.tenantId, engagementId: row.id });
    if (roles.some((role) => isPermitted(ACTIONS.engagementView, role))) visible.push(row);
  }
  return visible.slice(skip, skip + take);
}

async function getAssessment(principal: McpPrincipal, engagementId: string) {
  await assertEngagementAccess(principal, engagementId, ACTIONS.engagementView);
  const [engagement, client, system, members, requestRows, evidenceRows, findingRows, profile, packageRows] = await Promise.all([
    db.select().from(engagements).where(and(eq(engagements.id, engagementId), eq(engagements.tenantId, principal.tenantId))).limit(1),
    db.select().from(clientOrganisations).where(eq(clientOrganisations.engagementId, engagementId)).limit(1),
    db.select().from(systems).where(eq(systems.engagementId, engagementId)).limit(1),
    db.select({ userId: engagementMembers.userId, role: engagementMembers.role, joinedAt: engagementMembers.joinedAt }).from(engagementMembers).where(and(eq(engagementMembers.engagementId, engagementId), isNull(engagementMembers.deletedAt))),
    db.select().from(evidenceRequests).where(and(eq(evidenceRequests.engagementId, engagementId), eq(evidenceRequests.tenantId, principal.tenantId))).orderBy(desc(evidenceRequests.createdAt)),
    db.select().from(evidenceItems).where(and(eq(evidenceItems.engagementId, engagementId), eq(evidenceItems.tenantId, principal.tenantId))).orderBy(desc(evidenceItems.uploadedAt)),
    db.select().from(findings).where(and(eq(findings.engagementId, engagementId), eq(findings.tenantId, principal.tenantId))).orderBy(findings.sequence),
    db.select().from(auditReadinessProfiles).where(and(eq(auditReadinessProfiles.engagementId, engagementId), eq(auditReadinessProfiles.tenantId, principal.tenantId))).limit(1),
    db.select().from(auditEvidencePackages).where(and(eq(auditEvidencePackages.engagementId, engagementId), eq(auditEvidencePackages.tenantId, principal.tenantId))).orderBy(desc(auditEvidencePackages.version)),
  ]);
  if (!engagement[0]) throw new Error('Assessment not found.');
  const controlRows = await db.select({ id: engagementControls.id, status: engagementControls.status, applicable: engagementControls.applicable }).from(engagementControls).where(eq(engagementControls.engagementId, engagementId));
  return {
    engagement: engagement[0], client: client[0] ?? null, system: system[0] ?? null, members,
    summary: {
      controls: controlRows.length,
      controlsImplemented: controlRows.filter((row) => row.status === 'implemented').length,
      evidenceRequests: requestRows.length,
      evidenceItems: evidenceRows.length,
      acceptedEvidence: evidenceRows.filter((row) => row.reviewStatus === 'accepted').length,
      openFindings: findingRows.filter((row) => row.status !== 'closed' && row.status !== 'accepted_risk').length,
    },
    evidenceRequests: requestRows,
    evidence: evidenceRows,
    findings: findingRows,
    auditReadinessProfile: profile[0] ?? null,
    auditPackages: packageRows,
  };
}

async function listControls(principal: McpPrincipal, engagementId: string, take: number, skip: number) {
  await assertEngagementAccess(principal, engagementId, ACTIONS.engagementView);
  return db
    .select({
      engagementControlId: engagementControls.id,
      frameworkControlId: engagementControls.frameworkControlId,
      controlId: engagementControls.controlId,
      revision: engagementControls.revision,
      topic: frameworkControls.topic,
      section: frameworkControls.section,
      description: frameworkControls.description,
      guidance: frameworkControls.guidance,
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
    .innerJoin(frameworkControls, eq(frameworkControls.id, engagementControls.frameworkControlId))
    .where(and(eq(engagementControls.engagementId, engagementId), eq(engagementControls.tenantId, principal.tenantId)))
    .orderBy(engagementControls.controlId)
    .limit(take)
    .offset(skip);
}

async function listEvidence(principal: McpPrincipal, engagementId: string, take: number, skip: number) {
  await assertEngagementAccess(principal, engagementId, ACTIONS.evidenceView);
  const [requests, items, requestLinks, itemLinks] = await Promise.all([
    db.select().from(evidenceRequests).where(and(eq(evidenceRequests.engagementId, engagementId), eq(evidenceRequests.tenantId, principal.tenantId))).orderBy(desc(evidenceRequests.createdAt)).limit(take).offset(skip),
    db.select().from(evidenceItems).where(and(eq(evidenceItems.engagementId, engagementId), eq(evidenceItems.tenantId, principal.tenantId))).orderBy(desc(evidenceItems.uploadedAt)).limit(take).offset(skip),
    db.select().from(evidenceRequestControls).innerJoin(evidenceRequests, eq(evidenceRequests.id, evidenceRequestControls.evidenceRequestId)).where(and(eq(evidenceRequests.engagementId, engagementId), eq(evidenceRequests.tenantId, principal.tenantId))),
    db.select().from(evidenceItemControls).innerJoin(evidenceItems, eq(evidenceItems.id, evidenceItemControls.evidenceItemId)).where(and(eq(evidenceItems.engagementId, engagementId), eq(evidenceItems.tenantId, principal.tenantId))),
  ]);
  return { requests, items, requestControlLinks: requestLinks, itemControlLinks: itemLinks };
}

async function getAuditReadiness(principal: McpPrincipal, engagementId: string) {
  await assertEngagementAccess(principal, engagementId, ACTIONS.auditReadinessView);
  const [profile] = await db.select().from(auditReadinessProfiles).where(and(eq(auditReadinessProfiles.engagementId, engagementId), eq(auditReadinessProfiles.tenantId, principal.tenantId))).limit(1);
  if (!profile) return { configured: false };
  const [requirements, links, packages, controlRows, evidenceRows, coverage] = await Promise.all([
    db.select().from(auditReadinessRequirements).where(eq(auditReadinessRequirements.profileId, profile.id)).orderBy(asc(auditReadinessRequirements.category), asc(auditReadinessRequirements.title)),
    db.select().from(auditReadinessRequirementEvidence).where(and(eq(auditReadinessRequirementEvidence.engagementId, engagementId), eq(auditReadinessRequirementEvidence.tenantId, principal.tenantId))),
    db.select().from(auditEvidencePackages).where(and(eq(auditEvidencePackages.engagementId, engagementId), eq(auditEvidencePackages.tenantId, principal.tenantId))).orderBy(desc(auditEvidencePackages.version)),
    db.select({ id: engagementControls.id }).from(engagementControls).where(eq(engagementControls.engagementId, engagementId)),
    db.select({ reviewStatus: evidenceItems.reviewStatus }).from(evidenceItems).where(and(eq(evidenceItems.engagementId, engagementId), eq(evidenceItems.tenantId, principal.tenantId), isNull(evidenceItems.quarantinedAt))),
    getEngagementCoverage(engagementId),
  ]);
  const gates = buildAuditReadinessGates({
    engagementId,
    auditType: profile.auditType as AuditType,
    scopeStatement: profile.scopeStatement,
    targetAuditAt: profile.targetAuditAt,
    periodStart: profile.periodStart,
    periodEnd: profile.periodEnd,
    requirementStatuses: requirements.map((row) => row.status as AuditRequirementStatus),
    controlCount: controlRows.length,
    acceptedEvidenceCount: evidenceRows.filter((row) => row.reviewStatus === 'accepted').length,
    coverageBlockerKeys: coverage.blockers.map((blocker) => blocker.key),
  });
  return { configured: true, profile, requirements, requirementEvidenceLinks: links, gates, ready: gates.every((gate) => gate.ready), packages };
}

async function assertEngagementAccess(
  principal: McpPrincipal,
  engagementId: string,
  action: typeof ACTIONS.engagementView | typeof ACTIONS.evidenceView | typeof ACTIONS.auditReadinessView,
): Promise<void> {
  const [row] = await db.select({ id: engagements.id }).from(engagements).where(and(eq(engagements.id, engagementId), eq(engagements.tenantId, principal.tenantId), isNull(engagements.deletedAt))).limit(1);
  if (!row) throw new Error('Assessment not found.');
  await requirePermission(action, { userId: principal.actor.id, tenantId: principal.tenantId, engagementId });
}

function serialise(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function safeError(error: unknown): string {
  if (!(error instanceof Error)) return 'Tool failed.';
  return error.message.replace(/oak_mcp_[A-Za-z0-9_-]+/g, '[redacted token]').slice(0, 2000);
}
