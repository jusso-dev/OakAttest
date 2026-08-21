import type { BurlChatMessage } from './types';
import {
  hermesChatEndpoint,
  hermesSession,
  type HermesSessionContext,
} from './hermes-session';

const DEFAULT_HERMES_MODEL = 'hermes-agent';

export function hermesModelId() {
  return process.env.OAK_AI_HERMES_MODEL ?? DEFAULT_HERMES_MODEL;
}

export async function askBurlWithHermes({
  messages,
  system,
  context,
}: {
  messages: BurlChatMessage[];
  system: string;
  context: HermesSessionContext;
}) {
  const response = await callHermes({ messages, system, context, stream: false });
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const reply = payload.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error('Hermes did not return a text response.');
  return reply;
}

export async function* streamBurlWithHermes({
  messages,
  system,
  context,
}: {
  messages: BurlChatMessage[];
  system: string;
  context: HermesSessionContext;
}) {
  const response = await callHermes({ messages, system, context, stream: true });
  if (!response.body) throw new Error('Hermes did not return a response stream.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const data = line.startsWith('data:') ? line.slice(5).trim() : '';
      if (!data || data === '[DONE]') continue;
      const event = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string } }>;
      };
      const text = event.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
    if (done) break;
  }
}

async function callHermes({
  messages,
  system,
  context,
  stream,
}: {
  messages: BurlChatMessage[];
  system: string;
  context: HermesSessionContext;
  stream: boolean;
}) {
  const apiKey = process.env.OAK_AI_HERMES_API_KEY;
  if (!apiKey) throw new Error('Hermes is selected but OAK_AI_HERMES_API_KEY is not configured.');

  const configuredBaseUrl = process.env.OAK_AI_HERMES_BASE_URL;
  if (!configuredBaseUrl) {
    throw new Error('Hermes is selected but OAK_AI_HERMES_BASE_URL is not configured.');
  }
  const endpoint = hermesChatEndpoint(configuredBaseUrl);
  const session = hermesSession(context);
  const response = await fetch(endpoint, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(180_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Hermes-Session-Id': session.id,
      'X-Hermes-Session-Key': session.key,
    },
    body: JSON.stringify({
      model: hermesModelId(),
      stream,
      messages: [
        { role: 'system', content: system },
        ...messages
          .filter((message) => message.role === 'user')
          .slice(-1)
          .map((message) => ({ role: message.role, content: message.content.trim() })),
      ],
    }),
  });

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Hermes request failed (${response.status}).`);
  }
  return response;
}
