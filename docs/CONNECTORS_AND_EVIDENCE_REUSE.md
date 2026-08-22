# Assurance connectors and evidence reuse

OakAttest's connector engine records immutable, timestamped machine observations. A connector result is
supporting evidence, not an assessor verdict: it never changes applicability, implementation status, a
finding, or certification readiness automatically.

## AWS Security Hub connector

The first provider adapter reads AWS Security Hub CSPM through a customer-owned IAM role. OakAttest stores
only the role ARN, AWS region, and a random per-connector external ID. It never asks for or persists an AWS
access key, secret key, or session token.

The deployment identity needs permission to call `sts:AssumeRole` for customer connector roles. Each
customer role trust policy must name `AWS_CONNECTOR_PRINCIPAL_ARN` and require the external ID displayed by
the connector page. OakAttest also supplies an inline STS session policy that limits the temporary session
to these read-only calls:

- `sts:GetCallerIdentity`
- `securityhub:DescribeHub`
- `securityhub:GetEnabledStandards`
- `securityhub:GetFindings`

Connection testing activates the connector. Active connectors run on their configured interval; the
in-process scheduler checks due rows every five minutes by default (`ASSURANCE_CONNECTOR_CRON`). Each run
records the provider test key, outcome, narrative, bounded machine data, observation time, and a deterministic
SHA-256. A user maps stable test keys to the controls they support.

The initial tests verify that Security Hub CSPM is enabled, at least one enabled standard is ready, and no
active high or critical findings are returned. The finding result is deliberately aggregate and does not
copy resource details into OakAttest.

## Common-control mapping

A tenant may document directional relationships between two catalogue controls as `equivalent`,
`supporting`, or `partial`, with a rationale. The mapping is not a cross-framework compliance decision; it
explains why already-reviewed evidence might support a target control.

## Evidence reuse boundary

Evidence reuse links an immutable source evidence version to a target control without copying S3 bytes.
OakAttest permits a proposal only when:

- source and target belong to the same tenant and the same non-null registered client;
- the proposing user can view the source assessment and work in the target assessment;
- an assessor accepted the source evidence and its object/checksum verification completed;
- the evidence is not quarantined;
- the target workspace classification permits the evidence classification; and
- a future review or expiry date is supplied in the user's saved timezone.

Client contributors and assessors may propose reuse. Only assessor roles who can also inspect the source
assessment may approve it; assessor roles may reject it without source access. Downloads
recheck every boundary above and write an audit event before issuing a five-minute S3 URL. A later rejection,
revocation, source review change, quarantine, expiry, membership change, or classification mismatch prevents
continued use.
