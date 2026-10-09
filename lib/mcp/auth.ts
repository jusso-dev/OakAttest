import crypto from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { db } from '@/lib/db/client';
import { users } from '@/db/schema/auth';
import { mcpApiTokens, type McpScope } from '@/db/schema/mcp';
import { tenants } from '@/db/schema/tenants';
import type { MachineActor } from '@/lib/auth/session';
import { tenantIpAllowlist } from '@/db/schema/auth';
import { clientIpFromHeaders, ipAllowed } from '@/lib/security/ip-allowlist';

export const MCP_TOKEN_PREFIX = 'oak_mcp_';

export type McpPrincipal = {
  tokenId: string;
  tenantId: string;
  actor: MachineActor;
  scopes: McpScope[];
  expiresAt: Date;
};

export function hashMcpToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createMcpTokenSecret(): { token: string; prefix: string; hash: string } {
  const token = `${MCP_TOKEN_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
  return { token, prefix: token.slice(0, 20), hash: hashMcpToken(token) };
}

export async function authenticateMcpRequest(
  request: Request,
): Promise<{ principal: McpPrincipal; authInfo: AuthInfo } | Response> {
  const originRejection = validateMcpOriginAndHost(request);
  if (originRejection) return originRejection;

  const authorization = request.headers.get('authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token?.startsWith(MCP_TOKEN_PREFIX)) return unauthorized();

  const now = new Date();
  const [row] = await db
    .select({
      tokenId: mcpApiTokens.id,
      tenantId: mcpApiTokens.tenantId,
      actorUserId: mcpApiTokens.actorUserId,
      scopes: mcpApiTokens.scopes,
      expiresAt: mcpApiTokens.expiresAt,
      email: users.email,
      name: users.name,
    })
    .from(mcpApiTokens)
    .innerJoin(users, eq(users.id, mcpApiTokens.actorUserId))
    .innerJoin(tenants, eq(tenants.id, mcpApiTokens.tenantId))
    .where(
      and(
        eq(mcpApiTokens.tokenHash, hashMcpToken(token)),
        isNull(mcpApiTokens.revokedAt),
        gt(mcpApiTokens.expiresAt, now),
        isNull(users.disabledAt),
        eq(users.banned, false),
        isNull(tenants.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return unauthorized();

  const allowlist = await db
    .select({ cidr: tenantIpAllowlist.cidr })
    .from(tenantIpAllowlist)
    .where(eq(tenantIpAllowlist.tenantId, row.tenantId));
  if (
    allowlist.length > 0 &&
    !ipAllowed(
      clientIpFromHeaders(request.headers),
      allowlist.map((entry) => entry.cidr),
    )
  ) {
    return Response.json({ error: 'IP address is not on the tenant allowlist.' }, { status: 403 });
  }

  await db
    .update(mcpApiTokens)
    .set({ lastUsedAt: now })
    .where(eq(mcpApiTokens.id, row.tokenId));

  const principal: McpPrincipal = {
    tokenId: row.tokenId,
    tenantId: row.tenantId,
    actor: { id: row.actorUserId, email: row.email, name: row.name, tenantId: row.tenantId },
    scopes: row.scopes,
    expiresAt: row.expiresAt,
  };
  return {
    principal,
    authInfo: {
      token,
      clientId: row.tokenId,
      scopes: row.scopes,
      expiresAt: Math.floor(row.expiresAt.getTime() / 1000),
      extra: { principal },
    },
  };
}

export function requireMcpScope(principal: McpPrincipal, scope: McpScope): void {
  if (!principal.scopes.includes(scope)) {
    throw new Error(`MCP token does not grant ${scope}.`);
  }
}

export function validateMcpOriginAndHost(request: Request): Response | null {
  const allowedHosts = csvEnv('MCP_ALLOWED_HOSTS');
  const host = request.headers.get('host')?.split(':')[0]?.toLowerCase();
  if (allowedHosts.length > 0 && (!host || !allowedHosts.includes(host))) {
    return Response.json({ error: 'Host is not allowed.' }, { status: 403 });
  }

  const origin = request.headers.get('origin');
  if (!origin) return null;
  const allowedOrigins = new Set([new URL(request.url).origin, ...csvEnv('MCP_ALLOWED_ORIGINS')]);
  if (!allowedOrigins.has(origin)) {
    return Response.json({ error: 'Origin is not allowed.' }, { status: 403 });
  }
  return null;
}

function csvEnv(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function unauthorized(): Response {
  return Response.json(
    { error: 'A valid, active OakAttest MCP bearer token is required.' },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="OakAttest MCP"' } },
  );
}
