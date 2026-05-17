import { db } from '@/lib/db/client';
import { auditLog } from '@/db/schema/audit';

// Append-only audit log writer (§6, §15). The DB role separation in
// `db/migrations/post/audit_log_grants.sql` enforces that the app role can
// only INSERT into this table — there is no application code path that
// updates or deletes audit rows.

export type AuditEntry = {
  tenantId?: string | null;
  engagementId?: string | null;
  actorUserId?: string | null;
  actorIp?: string | null;
  actorUserAgent?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  beforeJson?: unknown;
  afterJson?: unknown;
  message?: string | null;
  actorType?: 'user' | 'system' | 'integration';
};

export async function recordAudit(entry: AuditEntry) {
  await db.insert(auditLog).values({
    tenantId: entry.tenantId ?? null,
    engagementId: entry.engagementId ?? null,
    actorType: entry.actorType ?? 'user',
    actorUserId: entry.actorUserId ?? null,
    actorIp: entry.actorIp ?? null,
    actorUserAgent: entry.actorUserAgent ?? null,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? null,
    beforeJson: entry.beforeJson as never,
    afterJson: entry.afterJson as never,
    message: entry.message ?? null,
  });
}
