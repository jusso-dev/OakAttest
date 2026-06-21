'use client';

import { useRouter } from 'next/navigation';
import { ConfirmButton } from '@/components/ui/confirm-dialog';
import { revokePartnerInvitation } from '@/app/actions/partner-invitations';

export function RevokeInviteButton({
  partnerId,
  invitationId,
  email,
}: {
  partnerId: string;
  invitationId: string;
  email: string;
}) {
  const router = useRouter();
  return (
    <ConfirmButton
      size="sm"
      variant="destructive"
      triggerLabel="Revoke"
      title="Revoke invitation?"
      description={`Revoke the pending invitation for ${email}? The link will stop working. You can send a new one later.`}
      confirmLabel="Revoke invite"
      onConfirm={async () => {
        await revokePartnerInvitation({ partnerId, invitationId });
        router.refresh();
      }}
    />
  );
}
