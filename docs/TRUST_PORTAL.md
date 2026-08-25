# Trust Portal

The Trust Portal exposes a deliberately constrained public view of a signed assessment artefact.
It is not a live window into an engagement and does not publish evidence, findings, system details,
private bundles, or assessor working papers.

## Publication flow

1. A lead assessor generates and signs a certification report.
2. A client administrator configures the public wording under the engagement's **Trust Portal** page.
3. The client administrator selects the signed report, sets an expiry in their saved timezone, confirms
   that the release is PUBLIC, and publishes it.
4. OakAttest freezes the approved wording and verification metadata into an immutable snapshot, hashes
   it with SHA-256, and points the public slug to that version.
5. A later publication supersedes the public pointer without rewriting prior versions. Disabling the
   portal revokes the current version.

Only `client_admin` may configure, publish, disable, or decide controlled-access requests. This keeps
internet publication and risk disclosure with the client organisation rather than the assessor.

## Public boundary

The public `/trust/{slug}` route reads only the immutable snapshot. Publication fails unless the source
report is signed, current, non-revoked, and has complete verification metadata. Publication expiry may
not exceed the report validity date. Known Australian protective markings (`OFFICIAL: Sensitive`,
`PROTECTED`, `SECRET`, and `TOP SECRET`) are rejected from public narrative fields.

The public record links to `/verify/{token}` for independent signature and bundle-hash verification. It
does not offer a public bundle or PDF download.

## Controlled PDF access

Visitors can request the signed PDF with an email, organisation, and purpose. A client administrator may
deny the request or approve an expiring link with a bounded download count. Only a SHA-256 hash of the
link token is stored. Every request, decision, revocation, portal view, and successful download is audited.
Visitor IP addresses are represented by a keyed HMAC fingerprint rather than stored in raw form.

At download time OakAttest rechecks the current portal pointer, publication expiry, report signature and
revocation state, grant expiry, and remaining download count. It then issues a 60-second S3 presigned URL.

## Deployment requirements

- `BETTER_AUTH_URL` must be the externally reachable Assessment Platform URL so access emails contain a
  valid link.
- `BETTER_AUTH_SECRET` must be configured and kept stable; it keys privacy-preserving visitor fingerprints.
- Email delivery is optional in development. Production approval links require working Paperboy settings.
- S3 access uses the host IAM role through the AWS SDK default credential provider chain. Do not set static
  AWS access keys in Coolify.
