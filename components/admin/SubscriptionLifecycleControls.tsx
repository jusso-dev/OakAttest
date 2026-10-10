'use client';

import { useRouter } from 'next/navigation';
import { ConfirmButton } from '@/components/ui/confirm-dialog';
import {
  suspendTenantSubscription,
  cancelTenantSubscription,
  reinstateTenantSubscription,
} from '@/app/actions/partners';

// Manual subscription lifecycle controls. Each transition is audited server-side.
// Status changes are recorded only. They do not remove access.
export function SubscriptionLifecycleControls({
  tenantId,
  status,
}: {
  tenantId: string;
  status: string;
}) {
  const router = useRouter();
  const isCancelled = status === 'cancelled';
  const isSuspended = status === 'suspended';

  async function run(fn: () => Promise<unknown>) {
    await fn();
    router.refresh();
  }

  if (isCancelled) {
    return (
      <p className="text-sm text-slate-600">
        Subscription is marked cancelled. Access is unchanged.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {!isSuspended && (
        <ConfirmButton
          variant="outline"
          triggerLabel="Suspend"
          title="Suspend subscription?"
          description="Marks the subscription suspended. Access stays open. You can reinstate later."
          confirmLabel="Suspend"
          confirmVariant="primary"
          onConfirm={() => run(() => suspendTenantSubscription({ tenantId }))}
        />
      )}
      {isSuspended && (
        <ConfirmButton
          variant="primary"
          triggerLabel="Reinstate"
          title="Reinstate subscription?"
          description="Marks the subscription active again. Access was not removed."
          confirmLabel="Reinstate"
          confirmVariant="primary"
          onConfirm={() => run(() => reinstateTenantSubscription({ tenantId }))}
        />
      )}
      <ConfirmButton
        variant="destructive"
        triggerLabel="Cancel subscription"
        title="Cancel subscription?"
        description="Marks the subscription cancelled. Tenant data and access stay in place."
        confirmLabel="Cancel subscription"
        onConfirm={() => run(() => cancelTenantSubscription({ tenantId }))}
      />
    </div>
  );
}
