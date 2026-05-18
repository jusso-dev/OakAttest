'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  registerTenantKmsSigningKey,
  revokeTenantSigningKey,
} from '@/app/actions/signing-keys';

type SigningKeyRow = {
  id: string;
  keyType: string;
  kmsKeyArn: string | null;
  fingerprint: string;
  createdAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
};

export function SigningKeysPanel({
  tenantId,
  keys,
  canManage,
}: {
  tenantId: string;
  keys: SigningKeyRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [kmsKeyArn, setKmsKeyArn] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function register() {
    setMessage(null);
    startTransition(async () => {
      try {
        await registerTenantKmsSigningKey({ tenantId, kmsKeyArn });
        setKmsKeyArn('');
        setMessage('Signing key registered.');
        router.refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Could not register signing key.');
      }
    });
  }

  function revoke(keyId: string) {
    setMessage(null);
    startTransition(async () => {
      try {
        await revokeTenantSigningKey({ tenantId, keyId });
        setMessage('Signing key revoked.');
        router.refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Could not revoke signing key.');
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Input
          value={kmsKeyArn}
          onChange={(event) => setKmsKeyArn(event.target.value)}
          disabled={!canManage || isPending}
          placeholder="arn:aws:kms:ap-southeast-2:123456789012:key/..."
          aria-label="AWS KMS signing key ARN"
        />
        <Button
          variant="primary"
          disabled={!canManage || isPending || kmsKeyArn.length === 0}
          onClick={register}
        >
          {isPending ? 'Saving...' : 'Register key'}
        </Button>
      </div>
      {!canManage && (
        <p className="text-sm text-slate-600">Only tenant owners can register or revoke signing keys.</p>
      )}
      {message && <p className="text-sm text-slate-700">{message}</p>}

      <div className="overflow-hidden rounded-md border border-[var(--field-border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--field-border)] bg-[var(--oak-mist)] text-left text-xs uppercase text-slate-600">
              <th className="px-3 py-2">Fingerprint</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-slate-600" colSpan={4}>
                  No tenant signing keys registered.
                </td>
              </tr>
            ) : (
              keys.map((key) => (
                <tr key={key.id} className="border-b border-[var(--field-border)] last:border-0">
                  <td className="max-w-[260px] px-3 py-2">
                    <span className="block truncate font-mono text-xs text-slate-900">
                      {key.fingerprint}
                    </span>
                    <span className="block truncate text-xs text-slate-600">
                      {key.kmsKeyArn ?? key.keyType}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{statusForKey(key)}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {new Date(key.createdAt).toLocaleDateString('en-AU')}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!key.revokedAt && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canManage || isPending}
                        onClick={() => revoke(key.id)}
                      >
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function statusForKey(key: SigningKeyRow): string {
  if (key.revokedAt) return `Revoked ${new Date(key.revokedAt).toLocaleDateString('en-AU')}`;
  if (key.rotatedAt) return `Rotated ${new Date(key.rotatedAt).toLocaleDateString('en-AU')}`;
  return 'Active';
}
