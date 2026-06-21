'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmButton } from '@/components/ui/confirm-dialog';
import { changeTenantMemberRole, removeTenantMember } from '@/app/actions/tenants';

type TenantRole = 'tenant_owner' | 'assessor_admin';

// Role change + remove controls for one tenant member. Shown only to owners.
export function MemberRowControls({
  tenantId,
  userId,
  role,
  memberLabel,
}: {
  tenantId: string;
  userId: string;
  role: TenantRole;
  memberLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeRole(next: TenantRole) {
    if (next === role) return;
    setBusy(true);
    setError(null);
    try {
      await changeTenantMemberRole({ tenantId, userId, role: next });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    await removeTenantMember({ tenantId, userId });
    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <select
        value={role}
        disabled={busy}
        onChange={(e) => changeRole(e.target.value as TenantRole)}
        className="h-8 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-2 text-xs text-slate-950 disabled:opacity-70"
        aria-label={`Role for ${memberLabel}`}
      >
        <option value="tenant_owner">Tenant owner</option>
        <option value="assessor_admin">Assessor admin</option>
      </select>
      <ConfirmButton
        size="sm"
        variant="destructive"
        triggerLabel="Remove"
        title="Remove member?"
        description={`Remove ${memberLabel} from this organisation? They lose access immediately. This cannot remove the last owner.`}
        confirmLabel="Remove member"
        onConfirm={remove}
      />
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
