import { Html, Head, Body, Container, Heading, Text, Button, Hr } from '@react-email/components';

export function MagicLinkEmail({ url }: { url: string }) {
  return (
    <Html lang="en-AU">
      <Head />
      <Body style={{ backgroundColor: '#f8fafc', fontFamily: 'sans-serif' }}>
        <Container style={{ padding: 24, maxWidth: 560 }}>
          <Heading style={{ fontSize: 20, color: '#0f172a' }}>Sign in to OakAttest</Heading>
          <Text style={{ color: '#334155' }}>
            Use the button below to sign in. This link expires in 72 hours and can be used once.
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
            Sign in
          </Button>
          <Hr style={{ marginTop: 24, borderColor: '#e2e8f0' }} />
          <Text style={{ color: '#64748b', fontSize: 12 }}>
            If you did not request this link, you can ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default MagicLinkEmail;
