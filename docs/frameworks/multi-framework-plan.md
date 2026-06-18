# OakAttest Multi-Framework Plan (OSCAL + client CSV)

Status: planning. Goal: generalise OakAttest beyond the Australian ISM + Essential Eight so it
can assess against **NIST SP 800-53, FedRAMP, SOC 2, and ISO/IEC 27001** using the same
"pull controls" pipeline, with room for more frameworks later.

Decision on record (2026-06-18): prioritise **all four** (NIST 800-53, FedRAMP, SOC 2,
ISO 27001). Order of build follows OSCAL availability (NIST/FedRAMP first — see §3).

**IRAP is not a framework.** IRAP is an assessment performed *against the ISM*. The ISM is the
framework (a control catalogue); IRAP is an engagement `assessmentType`. There is no IRAP
catalogue to pull — IRAP engagements run against the ISM framework.

**ISO 27001 and SOC 2 are client-imported, not distributed by us.** Their control text is
copyrighted (ISO Annex A; AICPA TSC). OakAttest will NOT ship or redistribute it. Instead the
**client uploads their own licensed control set via CSV** (§4.1). We provide the importer and
the CSV format; the client supplies the content they are licensed to hold.

---

## 1. What is already generic vs. ISM-welded

**Generic and reusable as-is:**
- The OSCAL catalogue parser — `lib/ism/oscal.ts` walks `catalog → groups → controls`,
  yields leaf controls with topic/subtopic (`iterateControls`), and keeps `oscalRaw` lossless.
  This is standard OSCAL 1.1 and works for any catalogue.

**Welded to ISM (must generalise):**
- Tables named `ism_controls`, `ism_imports` (`db/schema/ism.ts`); join FKs `ism_control_id`
  on `engagement_controls` (`ism.ts:65`) and on `finding_controls` (`db/schema/findings.ts`).
- `engagements.ismRevision` (`db/schema/engagements.ts:36`) — a text column, no `framework_id`.
- Source hardcoded to the ASD repo `AustralianCyberSecurityCentre/ism-oscal`
  (`lib/ism/sources.ts:1`).
- ISM-specific extraction in the importer: `extractMinClassification` and `extractEssentialEight`
  (`lib/ism/oscal.ts`), called unconditionally in `lib/ism/import.ts:35`.
- Classification model: `classificationEnum` (5 Australian markings) + `CLASSIFICATION_RANK`
  (`db/schema/enums.ts:7`).
- **Scoping rule is ISM-specific**: cumulative inclusion
  `ism_controls.min_classification_rank <= engagement.classification_rank`
  (`db/schema/ism.ts:54`, applied at engagement creation in `app/actions/engagements.ts`).
- E8 is an overlay on ISM only — `essential_eight_mapping` jsonb on `ism_controls`
  (`ism.ts:37`); strategies/maturity hardcoded in `lib/essential-eight*.ts`.

---

## 2. The hard truth: "same OSCAL standard" is NOT uniform

Pulling controls via OSCAL works cleanly for some frameworks and not others. Two independent
problems: (a) does an official OSCAL catalogue exist, and (b) what is the framework's *scoping*
model — because not all frameworks scope by an Australian-style classification rank.

| Framework | Official OSCAL? | Source | Scoping model | Snag |
|---|---|---|---|---|
| ISM / E8 | ✅ | ASD GitHub (have it) | Classification cumulative | Done |
| NIST 800-53 | ✅ | NIST publishes catalogue **and** baseline **profiles** | Baselines low/mod/high via OSCAL profile | Clean |
| FedRAMP | ✅ | GSA/FedRAMP automation repo | NIST baseline + FedRAMP overlay/profile | Clean |
| **SOC 2** | ❌ no official OSCAL | Client-supplied CSV (their licensed AICPA TSC) | Trust Service Categories (Security + chosen others) | Copyrighted → **client imports via CSV; we never ship the text** |
| **ISO/IEC 27001** | ❌ no official OSCAL | Client-supplied CSV (their licensed Annex A) | Statement of Applicability (SoA) | Copyrighted → **client imports via CSV; we never ship the text** |

Consequences:
- **NIST + FedRAMP**: slot into the OSCAL pull directly. Add an OSCAL **profile** concept to
  pick the baseline. Build these first.
- **SOC 2 + ISO 27001**: OakAttest must **not** ship the copyrighted control text. The
  **client imports their own licensed control set via CSV** (§4.1) — they hold the licence, we
  only provide the importer + format. Scoping is by selection (TSC categories / SoA), not by
  classification rank. Same schema as other frameworks; the ingest path is a client CSV upload
  into a **tenant-scoped** control set plus a per-control in/out-of-scope (SoA) selector.

This is why the model below separates **catalogue source** from **scoping strategy**.

---

## 3. Target data model

### 3.1 New: `frameworks` registry
```
frameworks
  id              uuid pk
  key             text unique         -- 'ism' | 'nist-800-53' | 'fedramp' | 'soc2' | 'iso-27001'
  label           text
  scoping_mode    text                -- 'classification' | 'baseline_profile' | 'selection'
  source_kind     text                -- 'oscal_url' | 'oscal_github_tags' | 'csv_client_import'
  source_config   jsonb               -- repo/url/profile refs, or CSV column-mapping config
  overlays        jsonb               -- e.g. ['essential-eight'] for ism, [] otherwise
  classification_scheme jsonb | null  -- ranks for 'classification' mode; null otherwise
  created_at      timestamptz
```

### 3.2 Rename + generalise the catalogue tables
- `ism_controls` → `framework_controls`, add `framework_id uuid not null fk → frameworks.id`.
  - Replace `min_classification` / `min_classification_rank` (ISM-only) with a generic
    `scope_meta jsonb` (holds min-rank for classification mode, baseline tags for NIST/FedRAMP,
    TSC category / Annex-A theme for SOC2/ISO). Keep `oscal_raw` (or `raw` for CSV-imported rows).
  - Move `essential_eight_mapping` into the generic `overlay_mappings jsonb` (populated only
    for frameworks whose `overlays` include `essential-eight`).
  - Add nullable `tenant_id`: NULL = a global/official catalogue (ISM, NIST, FedRAMP) shared by
    all tenants; SET = a client-imported private copy (ISO 27001, SOC 2) visible only to that
    tenant, so licensed content never crosses the tenant boundary.
  - Unique index becomes `(framework_id, tenant_id, control_id, revision)`.
- `ism_imports` → `framework_imports`, add `framework_id`. Unique
  `(framework_id, revision, source_sha256)`.

### 3.3 Modify the assessment linkage
- `engagements`: add `framework_id uuid fk` and rename `ism_revision` → `framework_revision`.
  Add `scope_selection jsonb` (chosen NIST baseline / SOC2 categories / ISO SoA decisions).
- `engagement_controls`: rename FK `ism_control_id` → `framework_control_id`; add denormalised
  `framework_id`. Keep the per-control assessor narrative columns as-is.
- `finding_controls`: rename `ism_control_id` → `framework_control_id`.

### 3.4 Scoping strategy (the key abstraction)
Replace the single hardcoded cumulative rule with a per-framework strategy resolved from
`frameworks.scoping_mode`, producing the initial `engagement_controls` set at creation:
- `classification` (ISM): `scope_meta.minRank <= engagement.classificationRank` (current rule).
- `baseline_profile` (NIST/FedRAMP): resolve the chosen OSCAL profile → the control IDs it
  selects → seed those.
- `selection` (SOC2/ISO): seed all controls; assessor marks in/out via SoA / TSC selection,
  with required justification (the existing `applicable` + `applicabilityJustification` columns
  already model this).

---

## 4. Ingest pipeline generalisation

- `lib/ism/` → `lib/frameworks/`. Keep the generic OSCAL parser (`oscal.ts`) unchanged.
- `sources.ts`: replace the hardcoded ASD repo with resolution from `frameworks.source_config`
  (per-framework URL / GitHub-tags pattern / authored-pack loader).
- Importer (`import.ts`): parameterise by framework. The ISM-specific extractors become a
  per-framework strategy object:
  ```
  type FrameworkIngest = {
    deriveScopeMeta(control, framework): jsonb;     // classification rank | baseline tags | category
    deriveOverlays(control, framework): jsonb;      // E8 for ism; {} otherwise
    deriveRevision(catalogue): string;
  };
  ```
  `extractMinClassification` and `extractEssentialEight` move behind the `ism` strategy.
- Add a profile resolver for OSCAL `baseline_profile` frameworks (NIST/FedRAMP).
- Add a **client CSV importer** for `selection` frameworks (SOC2/ISO) — the client uploads
  their own licensed control set; we never fetch or ship the copyrighted text (§4.1).
- `scripts/ism-import.ts` → `scripts/framework-import.ts <frameworkKey> [revision]`.

### 4.1 Client CSV import (ISO 27001, SOC 2)

The client — who holds the licence to the standard — uploads a CSV; OakAttest maps it into
**tenant-scoped** `framework_controls` rows for that tenant's framework revision. We ship the
format + a template, never the content.

Minimum columns (header row required):

| Column | Required | Notes |
|---|---|---|
| `control_id` | yes | e.g. `A.5.1` (ISO), `CC6.1` (SOC 2) |
| `title` | yes | short control name |
| `description` | yes | control text — supplied by the client from their licensed copy |
| `topic` / `category` | no | grouping (ISO theme / TSC category) |
| `guidance` | no | implementation guidance |
| `default_applicable` | no | `true`/`false` seed for the SoA selector |

Import rules:
- Upload is **per tenant** and gated by the `ISO27001` / `SOC2` feature. Imported rows carry the
  tenant's `tenant_id`, so one client's licensed copy is never shared with another tenant.
- Validate headers; reject on missing required columns; report row-level errors.
- Re-import upserts by `control_id` within the revision (client can correct/extend).
- Record the import in `framework_imports` (filename + sha256 + row count + who).
- Provide a downloadable CSV template per framework.

---

## 5. UI / API surface

- `/admin/ism` → `/admin/frameworks` (list installed frameworks + per-framework import panel).
- `/api/ism/releases/sync` → `/api/frameworks/[key]/releases/sync`.
- New-engagement form: add a **framework selector** before the revision/baseline picker, then
  a framework-appropriate scope control (classification | baseline | TSC/SoA selection).
- E8 views render only when `engagement.framework_id` resolves to a framework whose `overlays`
  include `essential-eight` (i.e. ISM today).
- Per-framework reassessment cadence: extend `tenants.compliancePolicy.reassessmentMonths`
  (already keyed by string) to key by framework as well as classification.

---

## 6. Phased rollout (zero-downtime, ISM stays working throughout)

**Phase 1 — Foundation (no behaviour change).** Add `frameworks` + new generic columns
alongside the existing tables. Seed one `frameworks` row: `ism`. Backfill `framework_id`
onto existing `ism_controls`/engagements. Keep dual-write so current ISM flows are untouched.

**Phase 2 — Cutover ISM to the generic tables.** Migrate reads/writes to
`framework_controls`/`framework_imports`; rename FKs. ISM becomes "just another framework"
with `scoping_mode='classification'` and the E8 overlay. Retire `ism_*` tables. Add the
isolation/regression tests.

**Phase 3 — NIST 800-53 + FedRAMP.** Implement `baseline_profile` scoping + OSCAL profile
resolver. Wire their official OSCAL sources. First true multi-framework engagements.

**Phase 4 — SOC 2 + ISO 27001.** Implement `selection` scoping (TSC categories / SoA) and the
**client CSV importer** (§4.1) with tenant-scoped control rows. Ship CSV templates, not control
text. Add framework-specific report/SSP section sets.

---

## 7. Effort & risk summary

| Item | Effort | Risk |
|---|---|---|
| `frameworks` registry + generic columns | Medium | Low |
| Rename `ism_*` + FK migration (dual-write, backfill) | Medium | Medium (data migration) |
| Scoping-strategy abstraction | Medium | Low |
| NIST + FedRAMP importers (OSCAL profiles) | Medium | Low — official OSCAL exists |
| SOC 2 + ISO 27001 client CSV import + SoA + tenant-scoped rows | Medium-High | Low on copyright — **client supplies the text**; effort is import/validation + SoA UI |
| UI: framework selector, conditional E8, per-framework cadence | Medium | Low |
| Tests (ingest per framework, scoping, isolation) | Medium | Low |

Copyright handled by design: SOC 2 (AICPA TSC) and ISO 27001 (Annex A) control text is
copyrighted, so OakAttest never ships or redistributes it — the **client imports their own
licensed copy via CSV** into a tenant-scoped table (§4.1). We provide only the importer, the
CSV format, and a template. NIST/FedRAMP remain official-OSCAL pulls; ISM/E8 unchanged.
