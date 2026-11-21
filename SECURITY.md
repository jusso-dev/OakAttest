# Security Policy

## Supported Versions

OakAttest is currently in pre-1.0 development (`0.1.0`) and does not maintain separate release branches. Security fixes are applied to `main` and published to the `ghcr.io/jusso-dev/oakattest:main` container image.

| Version | Supported |
| --- | --- |
| `main` (latest commit and `ghcr.io/jusso-dev/oakattest:main`) | Yes |
| Earlier commits and builds | No |

Operators running self-hosted deployments should track `main` closely and apply database migrations promptly after updating.

## Reporting a Vulnerability

Do not open public GitHub issues, pull requests, or discussions for suspected security vulnerabilities.

Please report vulnerabilities privately using GitHub Private Vulnerability Reporting:

- https://github.com/jusso-dev/OakAttest/security/advisories/new

To help us investigate and resolve the issue quickly, include:

- A clear description of the vulnerability and its potential security impact.
- The affected component, route, server action, MCP tool, or CLI command.
- Step-by-step reproduction instructions or a minimal proof of concept.
- The commit SHA or container image digest tested against, along with any relevant configuration details.
- Any suggested mitigations or fixes, if known.

When testing, only target deployments you own or have explicit authorisation to test, and do not access, modify, or exfiltrate data belonging to other users or organisations.

## Expected Response Times

OakAttest is maintained on a best-effort basis. We aim to meet the following timelines (Australian Eastern Time):

- **Initial acknowledgement:** within 3 business days.
- **Triage and severity assessment:** within 7 business days.
- **Target remediation:** within 30 days for critical and high severity issues, and within 90 days for moderate and low severity issues, depending on complexity and upstream fixes.

We coordinate remediation and public disclosure through the private GitHub Security Advisory so fixes can be verified before details are published.

## Scope

### In scope

- The OakAttest web application (`app/`, `lib/`, `components/`, `proxy.ts`, `db/`), including authentication, session management, MFA, RBAC, tenant and engagement isolation, assessor/client independence guards, server actions, and API routes.
- The Streamable HTTP MCP endpoint (`/api/mcp`), including bearer token handling, host and origin validation, and audit logging.
- Evidence upload and download handling, presigned URL generation, SHA-256 verification, Trust Portal public snapshots and verification routes (`/trust`, `/verify`), and certification bundle signing.
- The standalone CLI (`tools/OakAttest.Cli`).
- Container build configuration (`Dockerfile`) and GitHub Actions workflows (`.github/workflows/`).

### Out of scope

- Deployment and infrastructure misconfigurations in operator-managed environments (for example, exposed database ports, weak deployment secrets, missing TLS termination, or overly permissive S3/R2 bucket policies).
- Denial-of-service or volumetric attacks that rely solely on missing upstream rate limiting or WAF controls outside the application.
- Automated scanner reports without a demonstrable, reproducible security impact.
- Vulnerabilities in third-party dependencies that do not affect OakAttest or have no upstream fix yet available.
- Social engineering, phishing, or physical security attacks.
- Static marketing pages under `site/` unless they introduce an exploitable client-side vulnerability.
