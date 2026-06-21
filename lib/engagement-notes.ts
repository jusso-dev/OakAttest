import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { engagementNotes } from '@/db/schema/collaboration';
import { engagementMembers } from '@/db/schema/tenants';
import { tenantMembers } from '@/db/schema/tenants';
import { users } from '@/db/schema/auth';
import type { Role } from '@/lib/rbac/matrix';
import { createNotifications } from './notifications';
import { listWatcherIds } from './engagement-watch';

export type Audience = 'assessor' | 'client';
export type DirectoryUser = { id: string; name: string; email: string };

const ASSESSOR_ROLES: Role[] = ['tenant_owner', 'assessor_admin', 'lead_assessor', 'assessor'];
const CLIENT_ROLES: Role[] = ['client_admin', 'client_contributor'];
const MAX_NOTE_LENGTH = 10_000;

// Which threads a set of roles can see. Assessor-side roles see the team thread;
// client-side roles see the client thread. A user can hold both.
export function visibleAudiences(roles: Role[]): Audience[] {
  const out: Audience[] = [];
  if (roles.some((r) => ASSESSOR_ROLES.includes(r))) out.push('assessor');
  if (roles.some((r) => CLIENT_ROLES.includes(r))) out.push('client');
  return out;
}

export function canPostToAudience(roles: Role[], audience: Audience): boolean {
  return visibleAudiences(roles).includes(audience);
}

export type SerializedNote = {
  id: string;
  audience: Audience;
  body: string;
  mentionedUserIds: string[];
  createdAt: string;
  author: { id: string; name: string | null; email: string };
};

export async function listEngagementNotes(
  engagementId: string,
  audiences: Audience[],
): Promise<SerializedNote[]> {
  if (audiences.length === 0) return [];
  const rows = await db
    .select({
      id: engagementNotes.id,
      audience: engagementNotes.audience,
      body: engagementNotes.body,
      mentionedUserIds: engagementNotes.mentionedUserIds,
      createdAt: engagementNotes.createdAt,
      authorId: users.id,
      authorName: users.name,
      authorEmail: users.email,
    })
    .from(engagementNotes)
    .innerJoin(users, eq(users.id, engagementNotes.authorId))
    .where(
      and(
        eq(engagementNotes.engagementId, engagementId),
        inArray(engagementNotes.audience, audiences),
      ),
    )
    .orderBy(asc(engagementNotes.createdAt));
  return rows.map((r) => ({
    id: r.id,
    audience: r.audience as Audience,
    body: r.body,
    mentionedUserIds: r.mentionedUserIds ?? [],
    createdAt: r.createdAt.toISOString(),
    author: { id: r.authorId, name: r.authorName, email: r.authorEmail },
  }));
}

// Candidate @mention targets for an audience: assessor thread → engagement
// assessor members + tenant admins; client thread → engagement client members.
export async function getMentionDirectory(
  engagementId: string,
  tenantId: string,
  audience: Audience,
): Promise<DirectoryUser[]> {
  const wantedRoles = audience === 'assessor' ? ASSESSOR_ROLES : CLIENT_ROLES;
  const engRows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: engagementMembers.role })
    .from(engagementMembers)
    .innerJoin(users, eq(users.id, engagementMembers.userId))
    .where(eq(engagementMembers.engagementId, engagementId));

  const byId = new Map<string, DirectoryUser>();
  for (const r of engRows) {
    if (wantedRoles.includes(r.role as Role)) {
      byId.set(r.id, { id: r.id, name: r.name ?? r.email, email: r.email });
    }
  }

  if (audience === 'assessor') {
    const tenantRows = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(tenantMembers)
      .innerJoin(users, eq(users.id, tenantMembers.userId))
      .where(eq(tenantMembers.tenantId, tenantId));
    for (const r of tenantRows) byId.set(r.id, { id: r.id, name: r.name ?? r.email, email: r.email });
  }

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function createEngagementNote(opts: {
  engagementId: string;
  tenantId: string;
  authorId: string;
  authorName: string;
  audience: Audience;
  body: string;
  mentionedUserIds: string[];
}): Promise<SerializedNote> {
  const body = opts.body.trim();
  if (!body) throw new Error('Note cannot be empty.');
  if (body.length > MAX_NOTE_LENGTH) throw new Error('Note is too long.');

  // Only keep mentions that are valid targets for this thread's audience, so a
  // forged id cannot notify someone outside the thread.
  const directory = await getMentionDirectory(opts.engagementId, opts.tenantId, opts.audience);
  const allowed = new Set(directory.map((d) => d.id));
  const mentionedUserIds = Array.from(new Set(opts.mentionedUserIds)).filter((id) => allowed.has(id));

  const [note] = await db
    .insert(engagementNotes)
    .values({
      engagementId: opts.engagementId,
      tenantId: opts.tenantId,
      authorId: opts.authorId,
      audience: opts.audience,
      body,
      mentionedUserIds,
    })
    .returning();

  const link = `/engagements/${opts.engagementId}/overview`;

  // @mentions → direct notifications.
  await createNotifications(
    mentionedUserIds.map((userId) => ({
      userId,
      tenantId: opts.tenantId,
      engagementId: opts.engagementId,
      type: 'mention',
      title: `${opts.authorName} mentioned you`,
      body: body.slice(0, 280),
      link,
      actorUserId: opts.authorId,
    })),
  );

  // Assessor-thread posts also notify engagement watchers (minus the author and
  // anyone already pinged by a mention). Only watchers who can SEE the assessor
  // thread are notified — never leak assessor content to a client-side watcher.
  if (opts.audience === 'assessor') {
    const allowedWatchers = new Set(allowed); // assessor-side directory ids
    const watchers = (await listWatcherIds(opts.engagementId)).filter((id) =>
      allowedWatchers.has(id),
    );
    const already = new Set([...mentionedUserIds, opts.authorId]);
    await createNotifications(
      watchers
        .filter((id) => !already.has(id))
        .map((userId) => ({
          userId,
          tenantId: opts.tenantId,
          engagementId: opts.engagementId,
          type: 'note',
          title: `${opts.authorName} posted in the team thread`,
          body: body.slice(0, 280),
          link,
          actorUserId: opts.authorId,
        })),
    );
  }

  return {
    id: note.id,
    audience: opts.audience,
    body: note.body,
    mentionedUserIds,
    createdAt: note.createdAt.toISOString(),
    author: { id: opts.authorId, name: opts.authorName, email: '' },
  };
}
