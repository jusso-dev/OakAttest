# Framework packs and custom assessments

OakAttest separates a framework (the assessment method) from a pack (an immutable,
selectable revision of its controls). Every engagement pins one active pack revision;
later imports, retirement, or replacement packs do not rewrite the assessment snapshot.

## Supported sources

| Framework | Pack source | Scope model |
| --- | --- | --- |
| ISM / Essential Eight | Platform-admin import of the official ASD OSCAL catalogue | Classification rank |
| NIST SP 800-53 | Platform-admin import of the official NIST OSCAL catalogue, followed by tenant profile selection | OSCAL profile |
| FedRAMP | Tenant upload of an official FedRAMP OSCAL profile resolved against a loaded NIST catalogue | OSCAL profile |
| PSPF | Tenant CSV import using the public-control template | Per-control selection |
| SOC 2 / ISO 27001 | Tenant CSV import of the customer's licensed control text | Per-control selection / SoA |
| Custom | Tenant control builder | Per-control selection |

NIST defines profiles as selections and modifications resolved into a catalogue. OakAttest
materialises `include-all`, `include-controls`, `exclude-controls`, exact IDs, glob matching,
and child-control selection. Parameter and prose alterations are retained in pack metadata and
flagged to the administrator; this release does not rewrite base-control prose. See the
[NIST OSCAL profile reference](https://pages.nist.gov/OSCAL-Reference/models/latest/profile/json-reference/).
FedRAMP publishes machine-readable baseline profiles through its
[automation programme](https://automate.fedramp.gov/).

The PSPF is reviewed annually. Administrators should label each imported pack with the release
year and source it from the current [PSPF annual release](https://www.protectivesecurity.gov.au/pspf-annual-release).
The bundled CSV is a format template, not a stale copy of government requirements.

## Lifecycle

- `draft`: editable and unavailable to new engagements.
- `active`: immutable and selectable between its effective and expiry instants.
- `retired`: unavailable to new engagements; existing engagements stay pinned.

Dates are entered in the administrator's saved IANA timezone and stored as UTC instants. Every
pack records source kind, SHA-256, author, approver, activation time, optional source/base
revision, and control count. Importing changed content under an existing revision is rejected.

Custom packs start as drafts. Administrators can add, replace, or remove controls, activate the
revision, and clone an active or retired revision into the next editable draft. Activated
controls cannot be edited in place.

## Tenant boundary

Official catalogues have `tenant_id = NULL` and can only be changed by a platform administrator.
Profile results, CSV imports, and custom packs carry the current tenant ID. Every list, mutation,
MCP response, and engagement-creation query accepts only global rows or the current tenant, with
the tenant pack taking precedence when the same visible revision exists. Control material is
loaded from the selected pack's scope only; global and tenant catalogues are never blended.

Tenant owners and assessor administrators manage packs. Engagement roles, client roles, and
observers cannot author or activate them.
