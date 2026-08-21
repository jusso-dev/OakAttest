# OakAttest assessment MCP

OakAttest exposes a Streamable HTTP Model Context Protocol endpoint at:

```text
https://YOUR-OAKATTEST-HOST/api/mcp
```

It lets an external agent run an assessment from client setup through audit-package handoff without bypassing OakAttest controls.

## Connect

1. Sign in as a tenant owner and open **Tenant admin → Agent automation (MCP)**.
2. Create a named token and copy it immediately. OakAttest stores only its SHA-256 digest.
3. Configure the agent with the endpoint and bearer header:

```json
{
  "mcpServers": {
    "oakattest": {
      "type": "http",
      "url": "https://oakattest.example.com/api/mcp",
      "headers": {
        "Authorization": "Bearer oak_mcp_REDACTED"
      }
    }
  }
}
```

The endpoint supports current MCP Streamable HTTP and a stateless legacy fallback. It uses JSON responses suitable for horizontally scaled Next.js deployments.

## End-to-end workflow

The server exposes tools to:

- discover frameworks and catalogue revisions;
- create complete clients and assessments;
- manage assessment phase/status and inspect the workspace;
- decide control applicability and record implementation/workpaper detail;
- request, upload, checksum-verify, review, and download versioned evidence;
- configure ISO/IEC 27001 Stage 1, SOC 2 Type I, and SOC 2 Type II readiness;
- assign requirements and link verified evidence;
- create and manage findings;
- invite external auditors as read-only observers; and
- generate and download timestamped ZIP packages containing evidence bytes, hashes, controls, findings, checklist, audit log, and manifest.

Call `get_capabilities` first for the authoritative tool order and upload protocol.

## Security model

- Tokens are tenant-scoped, revocable, expiring, and stored only as SHA-256 digests.
- Each token acts as its creator. Current tenant and engagement permissions remain authoritative.
- Assessor/client independence is preserved. An assessor token can request and review evidence but cannot impersonate a client contributor to author statements or upload client evidence.
- Every MCP tool call is appended to the audit log with token ID, actor, success state, and duration. Domain actions keep their detailed audit events.
- Evidence finalisation downloads and hashes stored bytes before the item becomes usable.
- Errors redact bearer-token material.
- Browser origins are same-origin by default. `MCP_ALLOWED_ORIGINS` adds trusted cross-origin clients.
- `MCP_ALLOWED_HOSTS` enforces a production DNS-rebinding host allowlist.

## Evidence upload

1. Call `start_evidence_upload` with exact filename, MIME type, byte length, optional request, and control UUIDs.
2. `PUT` raw bytes to `uploadUrl` with every returned header.
3. Compute SHA-256 over those exact bytes.
4. Call `finalize_evidence_upload` with the evidence item ID and digest.

Upload URLs expire after ten minutes. Download URLs expire after five minutes.

## Operations

Apply database migration `0018_mcp_api_tokens` before issuing tokens. The endpoint uses the Node.js runtime for assessment actions, ZIP generation, S3, and request-local actor isolation.

Recommended production settings:

```dotenv
MCP_ALLOWED_HOSTS=oakattest.example.com
MCP_ALLOWED_ORIGINS=https://trusted-agent-console.example.com
```

Non-browser MCP clients normally omit `Origin` and authenticate only with the bearer token.
