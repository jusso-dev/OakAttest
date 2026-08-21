import { createMcpHandler } from '@modelcontextprotocol/server';
import {
  authenticateMcpRequest,
  type McpPrincipal,
  validateMcpOriginAndHost,
} from '@/lib/mcp/auth';
import { createOakAttestMcpServer } from '@/lib/mcp/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handler = createMcpHandler(
  ({ authInfo }) => {
    const principal = authInfo?.extra?.principal as McpPrincipal | undefined;
    if (!principal) throw new Error('Authenticated MCP principal is missing.');
    return createOakAttestMcpServer(principal);
  },
  { responseMode: 'json' },
);

async function serve(request: Request): Promise<Response> {
  const transportRejection = validateMcpOriginAndHost(request);
  if (transportRejection) return transportRejection;
  const authentication = await authenticateMcpRequest(request);
  if (authentication instanceof Response) return withCors(request, authentication);
  const response = await handler.fetch(request, { authInfo: authentication.authInfo });
  return withCors(request, response);
}

export const GET = serve;
export const POST = serve;
export const DELETE = serve;
export const OPTIONS = (request: Request) => {
  const rejection = validateMcpOriginAndHost(request);
  if (rejection) return rejection;
  return withCors(request, new Response(null, { status: 204 }));
};

function withCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Allow', 'GET, POST, DELETE, OPTIONS');
  headers.set(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id',
  );
  headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  const origin = request.headers.get('origin');
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.append('Vary', 'Origin');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
