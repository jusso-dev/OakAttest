'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createMcpApiToken, revokeMcpApiToken } from '@/app/actions/mcp-tokens';
import { Button } from '@/components/ui/button';
import { ConfirmButton } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { useUserTimeZone } from '@/components/timezone/UserTimezone';

type TokenRow = {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  expiresAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

export function McpApiTokensPanel({
  tenantId,
  tokens,
  canManage,
  endpoint,
}: {
  tenantId: string;
  tokens: TokenRow[];
  canManage: boolean;
  endpoint: string;
}) {
  const router = useRouter();
  const { formatDateTime } = useUserTimeZone();
  const [name, setName] = useState('Assessment automation');
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [secret, setSecret] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function createToken() {
    setMessage(null);
    setSecret(null);
    startTransition(async () => {
      try {
        const result = await createMcpApiToken({ tenantId, name, expiresInDays });
        setSecret(result.token);
        setMessage('Token created. Copy it now; OakAttest will not show it again.');
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not create MCP token.');
      }
    });
  }

  function revokeToken(tokenId: string) {
    setMessage(null);
    startTransition(async () => {
      try {
        await revokeMcpApiToken({ tenantId, tokenId });
        setMessage('Token revoked.');
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not revoke MCP token.');
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-[var(--field-border)] bg-[var(--oak-mist)] p-3 text-sm">
        <p className="font-medium text-slate-900">Streamable HTTP endpoint</p>
        <code className="mt-1 block break-all text-xs text-slate-700">{endpoint}</code>
        <p className="mt-2 text-slate-600">
          Send the token as <code>Authorization: Bearer oak_mcp_…</code>. Tools execute as the
          token creator and keep the same assessment roles and independence controls as the UI.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_130px_auto]">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!canManage || pending}
          aria-label="MCP token name"
          placeholder="Assessment automation"
        />
        <select
          className="h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
          value={expiresInDays}
          onChange={(event) => setExpiresInDays(Number(event.target.value))}
          disabled={!canManage || pending}
          aria-label="MCP token lifetime"
        >
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
          <option value={180}>180 days</option>
          <option value={365}>365 days</option>
        </select>
        <Button
          variant="primary"
          disabled={!canManage || pending || name.trim().length < 2}
          onClick={createToken}
        >
          {pending ? 'Working…' : 'Create token'}
        </Button>
      </div>

      {!canManage && <p className="text-sm text-slate-600">Only tenant owners can manage MCP tokens.</p>}
      {message && <p className="text-sm text-slate-700">{message}</p>}
      {secret && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-950">Copy this token now</p>
          <code className="mt-2 block break-all rounded bg-white p-2 text-xs text-slate-900">
            {secret}
          </code>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-[var(--field-border)]">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-[var(--field-border)] bg-[var(--oak-mist)] text-left text-xs uppercase text-slate-600">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Token</th>
              <th className="px-3 py-2">Expires</th>
              <th className="px-3 py-2">Last used</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {tokens.length === 0 ? (
              <tr><td className="px-3 py-3 text-slate-600" colSpan={6}>No MCP tokens created.</td></tr>
            ) : tokens.map((token) => (
              <tr key={token.id} className="border-b border-[var(--field-border)] last:border-0">
                <td className="px-3 py-2 text-slate-900">{token.name}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-700">{token.tokenPrefix}…</td>
                <td className="px-3 py-2 text-slate-600">{formatDateTime(token.expiresAt)}</td>
                <td className="px-3 py-2 text-slate-600">{token.lastUsedAt ? formatDateTime(token.lastUsedAt) : 'Never'}</td>
                <td className="px-3 py-2 text-slate-700">{tokenStatus(token, formatDateTime)}</td>
                <td className="px-3 py-2 text-right">
                  {!token.revokedAt && new Date(token.expiresAt) > new Date() && (
                    <ConfirmButton
                      variant="outline"
                      size="sm"
                      disabled={!canManage || pending}
                      triggerLabel="Revoke"
                      title="Revoke MCP token?"
                      description="Connected agents will immediately lose access. This cannot be undone."
                      confirmLabel="Revoke token"
                      confirmVariant="destructive"
                      onConfirm={() => revokeToken(token.id)}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function tokenStatus(token: TokenRow, format: (value: Date) => string): string {
  if (token.revokedAt) return `Revoked ${format(token.revokedAt)}`;
  if (new Date(token.expiresAt) <= new Date()) return 'Expired';
  return 'Active';
}
