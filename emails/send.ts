// Thin wrapper around Resend so the rest of the code calls one function per
// template. Templates render via React Email components.

import { Resend } from 'resend';
import { MagicLinkEmail } from './templates/MagicLink';
import { EngagementInviteEmail } from './templates/EngagementInvite';
import { TenantInviteEmail } from './templates/TenantInvite';

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM ?? 'OakAttest <no-reply@oakattest.example>';

const resend = apiKey ? new Resend(apiKey) : null;

async function send(opts: { to: string; subject: string; react: React.ReactElement }) {
  if (!resend) {
    // eslint-disable-next-line no-console
    console.info('[email:dev]', opts.subject, '->', opts.to);
    return;
  }
  await resend.emails.send({ from, to: opts.to, subject: opts.subject, react: opts.react });
}

export async function sendMagicLinkEmail({ to, url }: { to: string; url: string }) {
  await send({
    to,
    subject: 'Your OakAttest sign-in link',
    react: MagicLinkEmail({ url }),
  });
}

export async function sendEngagementInviteEmail({
  to,
  url,
  engagementName,
  inviterName,
}: {
  to: string;
  url: string;
  engagementName: string;
  inviterName: string;
}) {
  await send({
    to,
    subject: `${inviterName} has invited you to ${engagementName} on OakAttest`,
    react: EngagementInviteEmail({ url, engagementName, inviterName }),
  });
}

export async function sendTenantInviteEmail({
  to,
  url,
  tenantName,
  inviterName,
}: {
  to: string;
  url: string;
  tenantName: string;
  inviterName: string;
}) {
  await send({
    to,
    subject: `${inviterName} has invited you to ${tenantName} on OakAttest`,
    react: TenantInviteEmail({ url, tenantName, inviterName }),
  });
}
