import { describe, expect, it } from 'vitest';
import {
  InMemoryTransport,
  LATEST_PROTOCOL_VERSION,
  type JSONRPCMessage,
} from '@modelcontextprotocol/server';
import { MCP_SCOPES } from '@/db/schema/mcp';
import { createMcpTokenSecret, hashMcpToken } from '@/lib/mcp/auth';
import { createOakAttestMcpServer } from '@/lib/mcp/server';

const principal = {
  tokenId: '00000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000002',
  actor: {
    id: '00000000-0000-4000-8000-000000000003',
    email: 'agent@example.com',
    name: 'Assessment agent',
    tenantId: '00000000-0000-4000-8000-000000000002',
  },
  scopes: [...MCP_SCOPES],
  expiresAt: new Date('2030-01-01T00:00:00.000Z'),
};

describe('MCP bearer tokens', () => {
  it('creates one-way token material with a safe display prefix', () => {
    const first = createMcpTokenSecret();
    const second = createMcpTokenSecret();

    expect(first.token).toMatch(/^oak_mcp_[A-Za-z0-9_-]{43}$/);
    expect(first.prefix).toBe(first.token.slice(0, 20));
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.hash).toBe(hashMcpToken(first.token));
    expect(first.token).not.toBe(second.token);
    expect(first.hash).not.toBe(second.hash);
  });
});

describe('OakAttest MCP server', () => {
  it('registers the end-to-end assessment and evidence tools with schemas', () => {
    const server = createOakAttestMcpServer(principal);
    const expectedTools = [
      'get_capabilities',
      'list_frameworks',
      'create_client',
      'create_assessment',
      'get_assessment',
      'list_controls',
      'decide_control_applicability',
      'create_evidence_request',
      'start_evidence_upload',
      'finalize_evidence_upload',
      'review_evidence',
      'configure_audit_readiness',
      'update_audit_requirement',
      'create_finding',
      'record_finding_retest',
      'sign_off_finding',
      'invite_engagement_member',
      'invite_auditor',
      'generate_audit_package',
      'download_audit_package',
    ];

    for (const name of expectedTools) {
      expect(server.toolInputSchemaJson(name), `${name} should be registered`).toBeDefined();
    }
  });

  it('completes MCP initialization and advertises the full tool catalogue', async () => {
    const server = createOakAttestMcpServer(principal);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const responses = new Map<number, JSONRPCMessage>();
    const waiters = new Map<number, (message: JSONRPCMessage) => void>();
    clientTransport.onmessage = (message) => {
      if (!('id' in message) || typeof message.id !== 'number') return;
      responses.set(message.id, message);
      waiters.get(message.id)?.(message);
    };

    await server.connect(serverTransport);
    await clientTransport.start();
    await clientTransport.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'oakattest-test-agent', version: '1.0.0' },
      },
    });
    const initialized = await responseFor(1, responses, waiters);
    expect('result' in initialized && initialized.result).toMatchObject({
      serverInfo: { name: 'oakattest-assessment-automation' },
    });

    await clientTransport.send({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    });
    await clientTransport.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const toolsResponse = await responseFor(2, responses, waiters);
    expect('result' in toolsResponse && toolsResponse.result).toMatchObject({
      tools: expect.arrayContaining([
        expect.objectContaining({ name: 'create_assessment' }),
        expect.objectContaining({ name: 'finalize_evidence_upload' }),
        expect.objectContaining({ name: 'generate_audit_package' }),
      ]),
    });

    await clientTransport.close();
    await server.close();
  });
});

function responseFor(
  id: number,
  responses: Map<number, JSONRPCMessage>,
  waiters: Map<number, (message: JSONRPCMessage) => void>,
): Promise<JSONRPCMessage> {
  const existing = responses.get(id);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for MCP response ${id}`)), 2000);
    waiters.set(id, (message) => {
      clearTimeout(timeout);
      resolve(message);
    });
  });
}
