import Link from 'next/link';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { auditLog } from '@/db/schema/audit';
import { users } from '@/db/schema/auth';
import { getSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { requirePermission, PermissionDeniedError } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Audit log · OakAttest' };

type SortKey = 'createdAt' | 'action' | 'resourceType' | 'actorEmail' | 'actorIp';
type SortDirection = 'asc' | 'desc';

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    action?: string;
    resourceType?: string;
    actorType?: string;
    actor?: string;
    from?: string;
    to?: string;
    sort?: string;
    dir?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const session = (await getSession())!;
  const tenant = await resolveActiveTenant(session.user.id);
  if (!tenant) redirect('/onboarding');

  try {
    await requirePermission(ACTIONS.auditView, {
      userId: session.user.id,
      tenantId: tenant.tenantId,
    });
  } catch (err) {
    if (err instanceof PermissionDeniedError) redirect('/dashboard');
    throw err;
  }

  const filters = await searchParams;
  const query = first(filters.q).trim();
  const action = first(filters.action);
  const resourceType = first(filters.resourceType);
  const actorType = first(filters.actorType);
  const actor = first(filters.actor);
  const from = first(filters.from);
  const to = first(filters.to);
  const sort = parseSort(first(filters.sort));
  const dir = parseDirection(first(filters.dir));
  const pageSize = parsePageSize(first(filters.pageSize));
  const page = parsePage(first(filters.page));

  const conditions: SQL[] = [eq(auditLog.tenantId, tenant.tenantId)];
  if (action) conditions.push(eq(auditLog.action, action));
  if (resourceType) conditions.push(eq(auditLog.resourceType, resourceType));
  if (actorType && isActorType(actorType)) conditions.push(eq(auditLog.actorType, actorType));
  if (actor) conditions.push(ilike(users.email, `%${actor}%`));
  const fromDate = parseDateStart(from);
  if (fromDate) conditions.push(gte(auditLog.createdAt, fromDate));
  const toDate = parseDateEnd(to);
  if (toDate) conditions.push(lte(auditLog.createdAt, toDate));
  if (query) {
    const pattern = `%${query}%`;
    const search = or(
      ilike(auditLog.action, pattern),
      ilike(auditLog.resourceType, pattern),
      ilike(auditLog.resourceId, pattern),
      ilike(auditLog.actorIp, pattern),
      ilike(auditLog.message, pattern),
      ilike(users.email, pattern),
      ilike(users.name, pattern),
      sql`${auditLog.actorUserId}::text ilike ${pattern}`,
      sql`${auditLog.engagementId}::text ilike ${pattern}`,
    );
    if (search) conditions.push(search);
  }

  const where = and(...conditions);
  const orderColumn = sortColumn(sort);
  const order = dir === 'asc' ? asc(orderColumn) : desc(orderColumn);
  const [{ value: total }] = await db
    .select({ value: count() })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(where);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const rows = await db
    .select({
      id: auditLog.id,
      createdAt: auditLog.createdAt,
      actorType: auditLog.actorType,
      action: auditLog.action,
      resourceType: auditLog.resourceType,
      resourceId: auditLog.resourceId,
      engagementId: auditLog.engagementId,
      actorUserId: auditLog.actorUserId,
      actorEmail: users.email,
      actorName: users.name,
      actorIp: auditLog.actorIp,
      message: auditLog.message,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(where)
    .orderBy(order, desc(auditLog.createdAt))
    .limit(pageSize)
    .offset((safePage - 1) * pageSize);

  const [actions, resourceTypes] = await Promise.all([
    db
      .selectDistinct({ value: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.tenantId, tenant.tenantId))
      .orderBy(auditLog.action),
    db
      .selectDistinct({ value: auditLog.resourceType })
      .from(auditLog)
      .where(eq(auditLog.tenantId, tenant.tenantId))
      .orderBy(auditLog.resourceType),
  ]);

  const baseParams = {
    q: query,
    action,
    resourceType,
    actorType,
    actor,
    from,
    to,
    sort,
    dir,
    pageSize: String(pageSize),
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header>
        <p className="text-xs uppercase text-slate-600">Tenant admin</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Audit log</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Search and filters</CardTitle>
          <CardDescription>
            Filter tenant activity by action, resource, actor type, actor ID, and date range.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <input type="hidden" name="sort" value={sort} />
            <input type="hidden" name="dir" value={dir} />
            <div className="space-y-1.5">
              <label htmlFor="q" className="text-xs font-medium uppercase text-slate-600">
                Search
              </label>
              <input
                id="q"
                name="q"
                defaultValue={query}
                placeholder="Action, resource, email, IP, message"
                className="h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="action" className="text-xs font-medium uppercase text-slate-600">
                Action
              </label>
              <select
                id="action"
                name="action"
                defaultValue={action}
                className="h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950"
              >
                <option value="">All actions</option>
                {actions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.value}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="resourceType"
                className="text-xs font-medium uppercase text-slate-600"
              >
                Resource
              </label>
              <select
                id="resourceType"
                name="resourceType"
                defaultValue={resourceType}
                className="h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950"
              >
                <option value="">All resources</option>
                {resourceTypes.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.value}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="actorType" className="text-xs font-medium uppercase text-slate-600">
                Actor type
              </label>
              <select
                id="actorType"
                name="actorType"
                defaultValue={actorType}
                className="h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950"
              >
                <option value="">All actor types</option>
                <option value="user">User</option>
                <option value="system">System</option>
                <option value="integration">Integration</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="actor" className="text-xs font-medium uppercase text-slate-600">
                Actor email
              </label>
              <input
                id="actor"
                name="actor"
                defaultValue={actor}
                placeholder="name@example.com"
                className="h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="from" className="text-xs font-medium uppercase text-slate-600">
                From
              </label>
              <input
                id="from"
                name="from"
                type="date"
                defaultValue={from}
                className="h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="to" className="text-xs font-medium uppercase text-slate-600">
                To
              </label>
              <input
                id="to"
                name="to"
                type="date"
                defaultValue={to}
                className="h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="pageSize" className="text-xs font-medium uppercase text-slate-600">
                Page size
              </label>
              <select
                id="pageSize"
                name="pageSize"
                defaultValue={String(pageSize)}
                className="h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950"
              >
                <option value="25">25 rows</option>
                <option value="50">50 rows</option>
                <option value="100">100 rows</option>
              </select>
            </div>
            <div className="flex items-end gap-2 lg:col-span-4">
              <button
                type="submit"
                className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--oak-shield)] px-4 text-sm font-medium text-white hover:bg-[var(--oak-shield-hover)]"
              >
                Apply filters
              </button>
              <Link
                href="/admin/audit"
                className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-4 text-sm font-medium text-slate-900 hover:bg-[var(--oak-mist)]"
              >
                Reset
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>
            Showing {rows.length === 0 ? 0 : (safePage - 1) * pageSize + 1}-
            {(safePage - 1) * pageSize + rows.length} of {total} matching entries.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--field-border)] text-left text-xs uppercase text-slate-600">
                  <SortableTh label="When" column="createdAt" current={sort} dir={dir} params={baseParams} />
                  <SortableTh label="Action" column="action" current={sort} dir={dir} params={baseParams} />
                  <SortableTh label="Resource" column="resourceType" current={sort} dir={dir} params={baseParams} />
                  <th className="py-2 pr-3">Engagement</th>
                  <SortableTh label="Actor" column="actorEmail" current={sort} dir={dir} params={baseParams} />
                  <th className="py-2 pr-3">Actor type</th>
                  <SortableTh label="IP" column="actorIp" current={sort} dir={dir} params={baseParams} />
                  <th className="py-2 pr-3">Message</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--field-border)]">
                    <td className="py-2 pr-3 whitespace-nowrap text-slate-600">
                      {new Date(r.createdAt).toLocaleString('en-AU')}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{r.action}</td>
                    <td className="py-2 pr-3 text-slate-700">
                      {r.resourceType}
                      {r.resourceId ? ` · ${r.resourceId.slice(0, 8)}` : ''}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-slate-600">
                      {r.engagementId?.slice(0, 8) ?? '—'}
                    </td>
                    <td className="py-2 pr-3 text-slate-700">
                      {r.actorEmail ?? r.actorName ?? 'system'}
                    </td>
                    <td className="py-2 pr-3 text-slate-700">{r.actorType}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-slate-600">
                      {r.actorIp ?? '—'}
                    </td>
                    <td className="max-w-[280px] truncate py-2 pr-3 text-slate-700">
                      {r.message ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && (
              <p className="px-3 py-6 text-sm text-slate-600">No audit entries yet.</p>
            )}
          </div>
          <div className="flex flex-col gap-3 border-t border-[var(--field-border)] pt-3 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Page {safePage} of {totalPages}
            </p>
            <div className="flex gap-2">
              <PageLink
                disabled={safePage <= 1}
                href={auditHref({ ...baseParams, page: String(safePage - 1) })}
              >
                Previous
              </PageLink>
              <PageLink
                disabled={safePage >= totalPages}
                href={auditHref({ ...baseParams, page: String(safePage + 1) })}
              >
                Next
              </PageLink>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SortableTh({
  label,
  column,
  current,
  dir,
  params,
}: {
  label: string;
  column: SortKey;
  current: SortKey;
  dir: SortDirection;
  params: Record<string, string>;
}) {
  const active = current === column;
  const nextDir: SortDirection = active && dir === 'asc' ? 'desc' : 'asc';
  return (
    <th className="py-2 pr-3">
      <Link
        href={auditHref({ ...params, sort: column, dir: nextDir, page: '1' })}
        className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-950"
      >
        {label}
        <span className="text-slate-500">{active ? (dir === 'asc' ? '↑' : '↓') : '↕'}</span>
      </Link>
    </th>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="inline-flex h-8 items-center rounded-md border border-[var(--field-border)] px-3 text-slate-400">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex h-8 items-center rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-slate-900 hover:bg-[var(--oak-mist)]"
    >
      {children}
    </Link>
  );
}

function auditHref(params: Record<string, string>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `/admin/audit?${qs}` : '/admin/audit';
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function parseSort(value: string): SortKey {
  if (
    value === 'action' ||
    value === 'resourceType' ||
    value === 'actorEmail' ||
    value === 'actorIp'
  ) {
    return value;
  }
  return 'createdAt';
}

function parseDirection(value: string): SortDirection {
  return value === 'asc' ? 'asc' : 'desc';
}

function parsePage(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parsePageSize(value: string) {
  const parsed = Number.parseInt(value, 10);
  return [25, 50, 100].includes(parsed) ? parsed : 25;
}

function sortColumn(sort: SortKey) {
  switch (sort) {
    case 'action':
      return auditLog.action;
    case 'resourceType':
      return auditLog.resourceType;
    case 'actorEmail':
      return users.email;
    case 'actorIp':
      return auditLog.actorIp;
    case 'createdAt':
    default:
      return auditLog.createdAt;
  }
}

function parseDateStart(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateEnd(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isActorType(value: string): value is 'user' | 'system' | 'integration' {
  return value === 'user' || value === 'system' || value === 'integration';
}
