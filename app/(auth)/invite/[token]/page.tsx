import { notFound } from 'next/navigation';
import { getInvitationDetails } from '@/app/actions/invitations';
import { AcceptForm } from './AcceptForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Accept invitation · OakAttest' };

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await getInvitationDetails(token);
  if (!invitation) notFound();

  if (invitation.revokedAt) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invitation revoked</CardTitle>
          <CardDescription>
            This invitation has been cancelled. Ask the sender for a new one.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (invitation.acceptedAt) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Already accepted</CardTitle>
          <CardDescription>
            This invitation has already been used. Sign in to continue.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (invitation.expiresAt < new Date()) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invitation expired</CardTitle>
          <CardDescription>Ask the sender for a fresh invitation.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const title =
    invitation.kind === 'engagement'
      ? 'Engagement invitation'
      : invitation.kind === 'partner'
        ? 'MSP partner invitation'
        : 'Tenant invitation';
  const description =
    invitation.kind === 'engagement'
      ? `${invitation.tenantName} has invited you to ${invitation.engagementName} as ${invitation.role}.`
      : invitation.kind === 'partner'
        ? `${invitation.tenantName} has invited you to manage their MSP workspace as ${invitation.role.replace('_', ' ')}.`
        : `${invitation.tenantName} has invited you to join as ${invitation.role}.`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {description}{' '}
          Sign in or create an account with <strong>{invitation.email}</strong> to accept.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AcceptForm token={token} kind={invitation.kind} />
      </CardContent>
    </Card>
  );
}
