// Thin wrapper around Paperboy so the rest of the code calls one function per
// template. Templates render via React Email components to HTML. Paperboy has
// no react field.

import { renderToStaticMarkup } from 'react-dom/server';
import { MagicLinkEmail } from './templates/MagicLink';
import { PasswordResetEmail } from './templates/PasswordReset';
import { EngagementInviteEmail } from './templates/EngagementInvite';
import { TenantInviteEmail } from './templates/TenantInvite';
import {
  TrustPortalAccessGrantedEmail,
  TrustPortalAccessRequestEmail,
} from './templates/TrustPortalAccess';

const apiKey = process.env.PAPERBOY_API_KEY;
const paperboyUrl = process.env.PAPERBOY_URL;
const from = process.env.EMAIL_FROM ?? 'OakAttest <no-reply@oakattest.example>';

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|tr|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { name?: string; code?: string; cause?: { code?: string } };
  if (err.name === 'AbortError' || err.name === 'TypeError') return true;
  const code = err.code ?? err.cause?.code;
  return (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'UND_ERR_SOCKET'
  );
}

async function postPaperboy(payload: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const url = `${(paperboyUrl ?? '').replace(/\/+$/, '')}/api/v1/emails`;
  const idempotencyKey = crypto.randomUUID();
  const body = JSON.stringify(payload);
  const maxAttempts = 4;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body,
      });

      if (response.ok) {
        return (await response.json()) as { id: string };
      }

      const detail = await response.text().catch(() => '');
      lastError = new Error(
        `Paperboy send failed: HTTP ${response.status}${detail ? ` ${detail}` : ''}`,
      );
      if (response.status !== 429 && response.status < 500) throw lastError;
    } catch (error) {
      lastError = error;
      if (error instanceof Error && error.message.startsWith('Paperboy send failed: HTTP')) {
        const status = Number(/HTTP (\d+)/.exec(error.message)?.[1] ?? 0);
        if (status !== 429 && status < 500) throw error;
      } else if (!isRetryableNetworkError(error)) {
        throw error;
      }
    }

    if (attempt < maxAttempts) await sleep(200 * 2 ** (attempt - 1));
  }

  throw lastError;
}

async function send(opts: { to: string; subject: string; react: React.ReactElement }) {
  if (!apiKey || !paperboyUrl) {
    // eslint-disable-next-line no-console
    console.info('[email:dev]', opts.subject, '->', opts.to);
    return;
  }
  const html = renderToStaticMarkup(opts.react);
  await postPaperboy({
    from,
    to: opts.to,
    subject: opts.subject,
    html,
    text: htmlToText(html),
  });
}

export async function sendPasswordResetEmail({ to, url }: { to: string; url: string }) {
  await send({
    to,
    subject: 'Reset your OakAttest password',
    react: PasswordResetEmail({ url }),
  });
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

export async function sendTrustPortalAccessRequestEmail({
  to,
  requesterEmail,
  requesterOrganisation,
  portalTitle,
}: {
  to: string;
  requesterEmail: string;
  requesterOrganisation: string;
  portalTitle: string;
}) {
  await send({
    to,
    subject: `Access requested for ${portalTitle}`,
    react: TrustPortalAccessRequestEmail({ portalTitle, requesterEmail, requesterOrganisation }),
  });
}

export async function sendTrustPortalAccessGrantedEmail({
  to,
  portalTitle,
  accessUrl,
  expiresAt,
  maxDownloads,
}: {
  to: string;
  portalTitle: string;
  accessUrl: string;
  expiresAt: string;
  maxDownloads: number;
}) {
  await send({
    to,
    subject: `Access approved for ${portalTitle}`,
    react: TrustPortalAccessGrantedEmail({ portalTitle, accessUrl, expiresAt, maxDownloads }),
  });
}
