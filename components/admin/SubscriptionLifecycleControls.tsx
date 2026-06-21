'use client';

import { useRouter } from 'next/navigation';
import { ConfirmButton } from '@/components/ui/confirm-dialog';
import {
  suspendTenantSubscription,
  cancelTenantSubscription,
  reinstateTenantSubscription,
} from '@/app/actions/partners';

// Manual subscription lifecycle controls. Each transition is audited server-side.
// `cancelled` is terminal — reinstating requires a new Marketplace subscription.
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
        Subscription is cancelled (terminal). Reinstating requires a new Marketplace subscription.
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
          description="Suspending starts the grace window; writes are blocked once it expires. You can reinstate later."
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
          description="Restores the subscription to active and lifts write blocks."
          confirmLabel="Reinstate"
          confirmVariant="primary"
          onConfirm={() => run(() => reinstateTenantSubscription({ tenantId }))}
        />
      )}
      <ConfirmButton
        variant="destructive"
        triggerLabel="Cancel subscription"
        title="Cancel subscription?"
        description="This is terminal — the subscription cannot be reinstated without a new Marketplace subscription. The tenant loses access when access state blocks."
        confirmLabel="Cancel subscription"
        onConfirm={() => run(() => cancelTenantSubscription({ tenantId }))}
      />
    </div>
  );
}
