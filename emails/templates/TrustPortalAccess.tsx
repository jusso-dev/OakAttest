import { Body, Button, Container, Head, Heading, Hr, Html, Text } from '@react-email/components';

const bodyStyle = { backgroundColor: '#f6f8f4', fontFamily: 'sans-serif' };
const containerStyle = { padding: 24, maxWidth: 560 };
const textStyle = { color: '#334155' };

export function TrustPortalAccessRequestEmail({
  portalTitle,
  requesterEmail,
  requesterOrganisation,
}: {
  portalTitle: string;
  requesterEmail: string;
  requesterOrganisation: string;
}) {
  return (
    <Html lang="en-AU">
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading style={{ fontSize: 20, color: '#0f172a' }}>Trust Portal access requested</Heading>
          <Text style={textStyle}>
            {requesterEmail} from <strong>{requesterOrganisation}</strong> requested controlled
            access to the signed assessment PDF published through <strong>{portalTitle}</strong>.
          </Text>
          <Text style={textStyle}>Review the request in the engagement Trust Portal workspace.</Text>
          <Hr style={{ marginTop: 24, borderColor: '#cbd5e1' }} />
          <Text style={{ color: '#64748b', fontSize: 12 }}>No assessment evidence or bundle was disclosed by this request.</Text>
        </Container>
      </Body>
    </Html>
  );
}

export function TrustPortalAccessGrantedEmail({
  portalTitle,
  accessUrl,
  expiresAt,
  maxDownloads,
}: {
  portalTitle: string;
  accessUrl: string;
  expiresAt: string;
  maxDownloads: number;
}) {
  return (
    <Html lang="en-AU">
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading style={{ fontSize: 20, color: '#0f172a' }}>Controlled artefact access approved</Heading>
          <Text style={textStyle}>
            Your request for <strong>{portalTitle}</strong> was approved. This link downloads the
            signed assessment PDF and can be used {maxDownloads} time{maxDownloads === 1 ? '' : 's'}.
          </Text>
          <Button
            href={accessUrl}
            style={{ backgroundColor: '#0f3f2c', color: '#fffefa', padding: '12px 20px', borderRadius: 6, textDecoration: 'none', fontWeight: 600 }}
          >
            Download signed PDF
          </Button>
          <Text style={textStyle}>Access expires {new Date(expiresAt).toUTCString()}.</Text>
          <Hr style={{ marginTop: 24, borderColor: '#cbd5e1' }} />
          <Text style={{ color: '#64748b', fontSize: 12 }}>Do not forward this access link. Each download is recorded in the issuer’s immutable audit log.</Text>
        </Container>
      </Body>
    </Html>
  );
}
