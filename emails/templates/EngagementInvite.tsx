import { Html, Head, Body, Container, Heading, Text, Button, Hr } from '@react-email/components';

export function EngagementInviteEmail({
  url,
  engagementName,
  inviterName,
}: {
  url: string;
  engagementName: string;
  inviterName: string;
}) {
  return (
    <Html lang="en-AU">
      <Head />
      <Body style={{ backgroundColor: '#f8fafc', fontFamily: 'sans-serif' }}>
        <Container style={{ padding: 24, maxWidth: 560 }}>
          <Heading style={{ fontSize: 20, color: '#0f172a' }}>
            You have been invited to an IRAP engagement
          </Heading>
          <Text style={{ color: '#334155' }}>
            {inviterName} has invited you to collaborate on <strong>{engagementName}</strong> in
            OakAttest, the platform their assessor firm uses for IRAP assessments.
          </Text>
          <Text style={{ color: '#334155' }}>
            Accept the invitation to set up your account. You will be asked to enrol
            multi-factor authentication and acknowledge data handling terms before you can
            upload evidence or change scope.
          </Text>
          <Button
            href={url}
            style={{
              backgroundColor: '#0f4c4a',
              color: '#ffffff',
              padding: '12px 20px',
              borderRadius: 6,
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Accept invitation
          </Button>
          <Hr style={{ marginTop: 24, borderColor: '#e2e8f0' }} />
          <Text style={{ color: '#64748b', fontSize: 12 }}>
            This invitation expires in 72 hours. If you were not expecting it, ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default EngagementInviteEmail;
