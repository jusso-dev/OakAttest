import crypto from 'node:crypto';

export type ProfileCatalogueControl = { controlId: string };
export type ResolvedOscalProfile = {
  title: string;
  version: string | null;
  lastModified: string | null;
  sourceSha256: string;
  controlIds: string[];
  warnings: string[];
  modifications: Record<string, unknown> | null;
};

type OscalSelector = {
  'with-ids'?: unknown;
  matching?: unknown;
  'with-child-controls'?: unknown;
};

export function resolveOscalProfile(
  document: unknown,
  catalogueControls: ProfileCatalogueControl[],
  sourceText?: string,
): ResolvedOscalProfile {
  if (!isRecord(document) || !isRecord(document.profile)) {
    throw new Error('OSCAL profile JSON must contain a profile object.');
  }
  const profile = document.profile;
  const metadata = isRecord(profile.metadata) ? profile.metadata : {};
  const imports = Array.isArray(profile.imports) ? profile.imports : [];
  if (imports.length === 0) throw new Error('OSCAL profile must contain at least one import selector.');

  const catalogueIds = catalogueControls.map((control) => control.controlId);
  const available = new Set(catalogueIds);
  const included = new Set<string>();
  const missing = new Set<string>();
  let selectorCount = 0;

  for (const candidate of imports) {
    if (!isRecord(candidate)) continue;
    if ('include-all' in candidate) {
      catalogueIds.forEach((id) => included.add(id));
      selectorCount += 1;
    }
    for (const selector of asSelectors(candidate['include-controls'])) {
      selectorCount += 1;
      selectControls(selector, catalogueIds, available, included, missing, true);
    }
    for (const selector of asSelectors(candidate['exclude-controls'])) {
      selectorCount += 1;
      selectControls(selector, catalogueIds, available, included, missing, false);
    }
  }

  if (selectorCount === 0) throw new Error('OSCAL profile has no supported include or exclude selectors.');
  const controlIds = catalogueIds.filter((id) => included.has(id));
  if (controlIds.length === 0) throw new Error('OSCAL profile resolved to zero controls in the selected catalogue revision.');
  const title = stringValue(metadata.title) ?? 'OSCAL profile';
  const modifications = isRecord(profile.modify) ? profile.modify : null;
  const warnings = missing.size > 0
    ? [`${missing.size} explicitly referenced control ID${missing.size === 1 ? ' was' : 's were'} absent from the selected base revision: ${Array.from(missing).slice(0, 20).join(', ')}`]
    : [];
  if (modifications) {
    warnings.push('OSCAL parameter and alteration directives were retained as pack metadata but were not applied to base control prose.');
  }
  return {
    title,
    version: stringValue(metadata.version),
    lastModified: stringValue(metadata['last-modified']),
    sourceSha256: crypto.createHash('sha256').update(sourceText ?? JSON.stringify(document)).digest('hex'),
    controlIds,
    warnings,
    modifications,
  };
}

export function validateCustomFrameworkDefinition(input: {
  key: string;
  label: string;
  revision: string;
  description: string;
}) {
  const key = input.key.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!/^[a-z][a-z0-9-]{2,48}$/.test(key)) {
    throw new Error('Framework key must start with a letter and contain 3–49 lowercase letters, numbers, or hyphens.');
  }
  const label = input.label.trim();
  const revision = input.revision.trim();
  const description = input.description.trim();
  if (label.length < 3 || label.length > 160) throw new Error('Framework label must contain 3–160 characters.');
  if (revision.length < 1 || revision.length > 120) throw new Error('Framework revision must contain 1–120 characters.');
  if (description.length < 20 || description.length > 4_000) throw new Error('Framework description must contain 20–4,000 characters.');
  return { key, label, revision, description };
}

export function assertFrameworkPackTransition(current: string, next: 'active' | 'retired') {
  const allowed = current === 'draft' ? ['active'] : current === 'active' ? ['retired'] : [];
  if (!allowed.includes(next)) throw new Error(`Invalid framework pack transition from ${current} to ${next}.`);
}

export function validatePackDates(effectiveAt: Date | null, expiresAt: Date | null) {
  if (effectiveAt && expiresAt && expiresAt <= effectiveAt) {
    throw new Error('Framework pack expiry must be after its effective date.');
  }
}

function selectControls(
  selector: OscalSelector,
  catalogueIds: string[],
  available: Set<string>,
  included: Set<string>,
  missing: Set<string>,
  include: boolean,
) {
  const explicit = Array.isArray(selector['with-ids'])
    ? selector['with-ids'].filter((value): value is string => typeof value === 'string')
    : [];
  const withChildren = selector['with-child-controls'] === 'yes' || selector['with-child-controls'] === true;
  for (const id of explicit) {
    if (!available.has(id)) missing.add(id);
    const selected = withChildren ? catalogueIds.filter((candidate) => candidate === id || candidate.startsWith(`${id}.`)) : [id];
    selected.forEach((candidate) => {
      if (!available.has(candidate)) return;
      if (include) included.add(candidate);
      else included.delete(candidate);
    });
  }
  const matches = Array.isArray(selector.matching) ? selector.matching : [];
  for (const match of matches) {
    if (!isRecord(match) || typeof match.pattern !== 'string') continue;
    const pattern = globPattern(match.pattern);
    catalogueIds.filter((id) => pattern.test(id)).forEach((id) => {
      if (include) included.add(id);
      else included.delete(id);
    });
  }
}

// OSCAL defines matching.pattern as a glob expression, not a regular
// expression. Anchor it so a pattern such as "ac-*" cannot select a control
// merely because that text appears in the middle of its identifier.
function globPattern(value: string): RegExp {
  const escaped = value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  const source = escaped.replace(/\*/g, '.*').replace(/\\\?/g, '.');
  return new RegExp(`^${source}$`);
}

function asSelectors(value: unknown): OscalSelector[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
