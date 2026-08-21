import { createHash } from 'node:crypto';
import { v5 as uuidv5 } from 'uuid';

export type HermesSessionContext = {
  tenantId: string;
  userId: string;
  engagementId?: string;
};

export function hermesChatEndpoint(configured: string) {
  const url = new URL(configured);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('OAK_AI_HERMES_BASE_URL must be an HTTP(S) URL without embedded credentials.');
  }
  const pathname = url.pathname.replace(/\/+$/, '');
  url.pathname = pathname.endsWith('/v1/chat/completions')
    ? pathname
    : pathname.endsWith('/v1')
      ? `${pathname}/chat/completions`
      : `${pathname}/v1/chat/completions`;
  return url;
}

export function hermesSession(context: HermesSessionContext) {
  const scope = [context.tenantId, context.userId, context.engagementId ?? 'general'].join(':');
  const digest = createHash('sha256').update(scope).digest('hex');
  const key = `oakattest-${digest}`;
  return { key, id: uuidv5(key, uuidv5.URL) };
}
