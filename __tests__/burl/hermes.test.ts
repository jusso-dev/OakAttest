import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamBurlWithHermes } from '@/lib/burl/hermes';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe('Hermes provider', () => {
  it('uses authenticated, workspace-isolated persistent sessions and parses SSE text', async () => {
    process.env.OAK_AI_HERMES_BASE_URL = 'http://hermes.internal:8642';
    process.env.OAK_AI_HERMES_API_KEY = 'test-key';
    process.env.OAK_AI_HERMES_MODEL = 'hermes-agent';

    const fetchMock = vi.fn(async () =>
      new Response(
        [
          'data: {"choices":[{"delta":{"content":"Hello "}}]}',
          '',
          'event: hermes.tool.progress',
          'data: {"type":"hermes.tool.progress"}',
          '',
          'data: {"choices":[{"delta":{"content":"world"}}]}',
          '',
          'data: [DONE]',
          '',
        ].join('\n'),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const chunks: string[] = [];
    for await (const chunk of streamBurlWithHermes({
      messages: [
        { role: 'user', content: 'old turn' },
        { role: 'assistant', content: 'old answer' },
        { role: 'user', content: 'current turn' },
      ],
      system: 'assessment context',
      context: { tenantId: 'tenant-a', userId: 'user-a', engagementId: 'workspace-a' },
    })) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('Hello world');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe('http://hermes.internal:8642/v1/chat/completions');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-key');
    expect(new Headers(init.headers).get('X-Hermes-Session-Id')).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    expect(new Headers(init.headers).get('X-Hermes-Session-Key')).toMatch(/^oakattest-/);
    const body = JSON.parse(String(init.body)) as { messages: Array<{ content: string }> };
    expect(body.messages.map((message) => message.content)).toEqual([
      'assessment context',
      'current turn',
    ]);
  });
});
