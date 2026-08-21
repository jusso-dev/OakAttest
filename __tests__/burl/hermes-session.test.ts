import { describe, expect, it } from 'vitest';
import { hermesChatEndpoint, hermesSession } from '@/lib/burl/hermes-session';

describe('Hermes persistent session scoping', () => {
  it('builds the documented chat-completions endpoint', () => {
    expect(hermesChatEndpoint('http://hermes.internal:8642').toString()).toBe(
      'http://hermes.internal:8642/v1/chat/completions',
    );
    expect(hermesChatEndpoint('https://hermes.example/v1').toString()).toBe(
      'https://hermes.example/v1/chat/completions',
    );
  });

  it('keeps memory stable within a user workspace and isolated across workspaces', () => {
    const first = hermesSession({ tenantId: 'tenant-a', userId: 'user-a', engagementId: 'one' });
    const resumed = hermesSession({ tenantId: 'tenant-a', userId: 'user-a', engagementId: 'one' });
    const otherWorkspace = hermesSession({
      tenantId: 'tenant-a',
      userId: 'user-a',
      engagementId: 'two',
    });

    expect(resumed).toEqual(first);
    expect(otherWorkspace).not.toEqual(first);
    expect(first.key).not.toContain('tenant-a');
  });
});
