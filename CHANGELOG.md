# Changelog

## Unreleased

### Milestone 2 — full platform build

**Schema completions** (`db/migrations/0001_milestone2.sql`)

- Boundaries: `system_boundaries` (versioned graph), `boundary_change_requests`.
- Evidence: `evidence_requests` + control join, `evidence_items` (versioned,
  SHA-256), `evidence_item_controls`.
- Findings: `findings` (auto-numbered FND-### per engagement),
  `finding_controls`, `finding_evidence`, `remediation_actions`.
- Essential Eight: `essential_eight_assessments`, `essential_eight_history`.
- SSP: `ssp_sections`, `ssp_exports` (PDF, versioned, hash-pinned).
- Interviews: `interviews`, `interview_controls`.
- Certification: `certification_reports`, `residual_risks`,
  `tenant_signing_keys`.
- CVE: `cve_scans`, `cve_scan_findings`.
- Invitations: `engagement_invitations`.

**Boundary builder** (§9.3)

- React Flow visual editor with component types, environment, owner, notes.
- Versioning: each save increments the version and supersedes the previous.
- Lock workflow: lead assessor locks; later edits go through a Boundary
  Change Request which a reviewer signs off.

**Applicability worksheet** (§9.4)

- Per-control table with assessor applicability decision + required
  justification, and client-authored implementation statement.

**Evidence workflow** (§9.7)

- Evidence requests tied to one or more controls, with artifact type and due
  date.
- Presigned S3 uploads (`lib/storage/s3.ts`) with SSE-KMS support; client
  computes SHA-256 in the browser, server verifies and finalises.
- Versioning: re-uploading the same filename chains via `supersedes_id`.
- Review actions: accepted / insufficient / rejected, audit-logged.
- Short-lived presigned download URLs, audit-logged.
- Virus scanning intentionally omitted — left to COTS at the bucket layer.

**Findings register** (§9.10)

- CRUD with severity, type, status, and recommendation (informational only;
  remediation guidance is gated client-side by the independence guard).
- Remediation actions are client-owned with owner, due date, and
  proof-of-fix evidence linking.
- Sign-off restricted to `lead_assessor`.

**Essential Eight** (§9.6)

- One row per strategy with current vs target maturity, remediation plan,
  and history. Recharts trend chart over time.

**SSP generation** (§9.5)

- `@react-pdf/renderer` produces a versioned, classification-banner-styled
  PDF with all eight sections drawn from boundary, applicability,
  implementation statements, Essential Eight, and residual risks.
- Upload to S3 with SHA-256, presigned download.

**Certification package** (§9.11)

- Draft → sign workflow. The signed bundle is a zip containing the
  certification PDF, findings register CSV, evidence index CSV, audit log
  CSV, and a manifest with the bundle SHA-256.
- HMAC-SHA-256 signature in dev; KMS-backed signing wired (uses
  `tenantSigningKeys.kmsKeyArn` when present).
- Public verification page at `/verify/[token]` exposes only safe fields.

**Interviews + fieldwork** (§9.8)

- Schedule interviews with attendees, purpose, duration; record notes and
  observations; export to `.ics` via `/api/interviews/[id]/ics`.

**CVE scan as evidence** (§9.9)

- Manifest parsers for npm, Python (`requirements.txt`, `Pipfile.lock`),
  Ruby (`Gemfile.lock`), Go (`go.sum`/`go.mod`), Rust (`Cargo.lock`), PHP
  (`composer.lock`), Java (`pom.xml`), Dockerfile base images, CycloneDX
  and SPDX SBOM JSON.
- Queries OSV.dev `querybatch`; fetches per-advisory detail for severity,
  CVSS, fix versions, and references.
- Auto-drafts an observation linked to patching controls when there are
  high/critical findings; the assessor promotes to non-conformance.
- Signed point-in-time hash recorded on the scan; before/after scan pairs
  prove remediation.

**Invitations**

- `engagement_invitations` flow with magic-link-style accept page at
  `/invite/[token]`; tenant invitations also accepted via the same page.

**Onboarding**

- `/onboarding` lets a brand-new user create a tenant; the `(app)` layout
  redirects users with no tenant membership.

**Tenant admin** (§10, §12)

- `/admin/branding` for product name, primary/accent colours, logo URL.
- `/admin/ip-allowlist` for per-tenant assessor IP CIDRs.
- `/admin/compliance` lists certified engagements with re-assessment
  countdowns derived from classification.

**Command palette** (§10)

- `⌘K` / `Ctrl+K` opens a fuzzy switcher across engagements, admin, and
  audit.

**Tests**

- New: `__tests__/cve/manifest.test.ts` (5 manifest parsers covered).
- New: `__tests__/boundary/schema.test.ts` (Zod boundary validation).
- All 23 tests passing.

**Build**

- 26 routes; `tsc --noEmit` clean; `next build` succeeds with the proxy
  middleware (renamed from middleware.ts per Next.js 16 deprecation).

### Milestone 3 polish

- Vulnerability scan import (Nessus `.nessus`, Rapid7 CSV, Qualys CSV,
  generic CSV) — `lib/scans/parse.ts` + `importVulnScan` server action +
  fieldwork upload widget. Drafts an observation per critical/high entry,
  linked to patching controls.
- Findings register CSV export at `/api/engagements/[id]/findings/csv`.
- Data handling and chain-of-custody acknowledgement at `/terms`; the
  `(app)` layout redirects to it on first sign-in (§5, §9.2).
- New tests: `__tests__/scans/parse.test.ts` (Nessus XML, Qualys CSV,
  generic CSV). 27/27 passing.

### Known follow-ups (out of scope)

- **Passkey enrolment UI.** The better-auth 1.6 distribution does not bundle
  a passkey plugin and there is no separate `@better-auth/passkey` package
  installed. The `passkeys` table is in place. Re-enable when the upstream
  plugin lands.
- **DOCX SSP export.** Only PDF is generated. Word output requires either a
  templating engine (docxtemplater) or a wrapper around LibreOffice headless
  — left as a follow-up.
- **Inline SSP commenting.** The `ssp_sections` table supports per-section
  content; threaded comments on a section are not yet implemented.
- **Failed-login lockout enforcement.** BetterAuth's built-in rate limiter
  (configured `max: 30/min`) covers the practical case. The dedicated
  `login_attempts` table is in place; explicit 5-attempt enforcement that
  populates it is a separate wiring step.
- **Per-role session length override.** BetterAuth is configured with an 8h
  default. The shorter 4h client cap requires a `customSession` plugin
  override at sign-in time; not yet wired.

## Milestone 1 — see prior commits

(Auth, RBAC, tenants, engagements, ISM ingestion, append-only audit log,
five-phase stepper, evidence request scaffold, findings scaffold.)
