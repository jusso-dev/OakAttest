// Manifest parsers. Convert package-manager lockfiles into the
// `{ ecosystem, name, version }` shape that OSV.dev expects.
//
// We support the formats called out in §9.9: npm, Python, Ruby, Go, Rust,
// Java (Maven), PHP, Docker base images. Each parser is intentionally
// shallow — we read the top-level resolved versions and the transitive
// closure where the lockfile spells it out.

export type PackagePin = {
  ecosystem: string;
  name: string;
  version: string;
};

export function parseManifest(filename: string, content: string): PackagePin[] {
  const lower = filename.toLowerCase();
  if (lower.endsWith('package-lock.json') || lower.endsWith('npm-shrinkwrap.json')) {
    return parseNpmLock(content);
  }
  if (lower.endsWith('package.json')) {
    return parsePackageJson(content);
  }
  if (lower.endsWith('requirements.txt')) {
    return parseRequirementsTxt(content);
  }
  if (lower.endsWith('pipfile.lock')) {
    return parsePipfileLock(content);
  }
  if (lower.endsWith('gemfile.lock')) {
    return parseGemfileLock(content);
  }
  if (lower.endsWith('go.sum') || lower.endsWith('go.mod')) {
    return lower.endsWith('go.sum') ? parseGoSum(content) : parseGoMod(content);
  }
  if (lower.endsWith('cargo.lock')) {
    return parseCargoLock(content);
  }
  if (lower.endsWith('composer.lock')) {
    return parseComposerLock(content);
  }
  if (lower.endsWith('pom.xml')) {
    return parsePomXml(content);
  }
  if (lower === 'dockerfile' || lower.endsWith('/dockerfile')) {
    return parseDockerfile(content);
  }
  // CycloneDX / SPDX SBOM.
  if (lower.endsWith('.sbom.json') || lower.endsWith('cyclonedx.json')) {
    return parseCycloneDx(content);
  }
  if (lower.endsWith('.spdx.json')) {
    return parseSpdxJson(content);
  }
  throw new Error(`Unsupported manifest filename: ${filename}`);
}

function parseNpmLock(content: string): PackagePin[] {
  const json = JSON.parse(content);
  const out: PackagePin[] = [];
  if (json.packages) {
    for (const [path, info] of Object.entries(json.packages) as Array<[string, { version?: string }]>) {
      if (!path || path === '' || !info?.version) continue;
      const name = path.startsWith('node_modules/')
        ? path.slice('node_modules/'.length).replace(/\/node_modules\//g, '>')
        : path;
      // Skip nested duplicates: keep the top-level resolution.
      out.push({ ecosystem: 'npm', name, version: info.version });
    }
  } else if (json.dependencies) {
    walkDeps(json.dependencies, out);
  }
  return dedupe(out);
}

function walkDeps(deps: Record<string, { version?: string; dependencies?: Record<string, unknown> }>, out: PackagePin[], prefix = '') {
  for (const [name, info] of Object.entries(deps)) {
    if (info?.version) out.push({ ecosystem: 'npm', name: prefix + name, version: info.version });
    if (info?.dependencies) {
      walkDeps(info.dependencies as never, out, '');
    }
  }
}

function parsePackageJson(content: string): PackagePin[] {
  const json = JSON.parse(content);
  const out: PackagePin[] = [];
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
    if (!json[field]) continue;
    for (const [name, version] of Object.entries(json[field] as Record<string, string>)) {
      const cleaned = String(version).replace(/^[\^~>=<\s]+/, '');
      if (cleaned) out.push({ ecosystem: 'npm', name, version: cleaned });
    }
  }
  return dedupe(out);
}

function parseRequirementsTxt(content: string): PackagePin[] {
  const out: PackagePin[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.split('#')[0].trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^([A-Za-z0-9_\-.]+)\s*==\s*([^\s;]+)/);
    if (m) out.push({ ecosystem: 'PyPI', name: m[1], version: m[2] });
  }
  return dedupe(out);
}

function parsePipfileLock(content: string): PackagePin[] {
  const json = JSON.parse(content);
  const out: PackagePin[] = [];
  for (const section of ['default', 'develop']) {
    const deps = json[section] ?? {};
    for (const [name, info] of Object.entries(deps as Record<string, { version?: string }>)) {
      const v = info?.version?.replace(/^==/, '');
      if (v) out.push({ ecosystem: 'PyPI', name, version: v });
    }
  }
  return dedupe(out);
}

function parseGemfileLock(content: string): PackagePin[] {
  const out: PackagePin[] = [];
  // Gemfile.lock has a lowercase `specs:` line under each source section,
  // then a list of `<name> (<version>)` lines at 4-space indent (with
  // transitive deps at 6+ spaces). We keep only the 4-space rows.
  const lines = content.split(/\r?\n/);
  let inSpecs = false;
  for (const line of lines) {
    if (/^\s*specs:\s*$/.test(line)) {
      inSpecs = true;
      continue;
    }
    if (inSpecs && /^\S/.test(line)) {
      inSpecs = false;
      continue;
    }
    if (!inSpecs) continue;
    const m = line.match(/^ {4}([a-zA-Z0-9_\-.]+) \(([^)]+)\)/);
    if (m) out.push({ ecosystem: 'RubyGems', name: m[1], version: m[2] });
  }
  return dedupe(out);
}

function parseGoMod(content: string): PackagePin[] {
  const out: PackagePin[] = [];
  for (const line of content.split(/\r?\n/)) {
    const m = line.trim().match(/^([\w./\-]+)\s+v[^\s]+/);
    if (m) {
      const [name, version] = m[0].split(/\s+/);
      out.push({ ecosystem: 'Go', name, version });
    }
  }
  return dedupe(out);
}

function parseGoSum(content: string): PackagePin[] {
  const out: PackagePin[] = [];
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([\w./\-]+)\s+(v[^\s]+)/);
    if (m && !m[2].endsWith('/go.mod')) {
      out.push({ ecosystem: 'Go', name: m[1], version: m[2] });
    }
  }
  return dedupe(out);
}

function parseCargoLock(content: string): PackagePin[] {
  const out: PackagePin[] = [];
  let name: string | null = null;
  for (const line of content.split(/\r?\n/)) {
    const n = line.match(/^name\s*=\s*"([^"]+)"/);
    const v = line.match(/^version\s*=\s*"([^"]+)"/);
    if (n) name = n[1];
    if (v && name) {
      out.push({ ecosystem: 'crates.io', name, version: v[1] });
      name = null;
    }
  }
  return dedupe(out);
}

function parseComposerLock(content: string): PackagePin[] {
  const json = JSON.parse(content);
  const out: PackagePin[] = [];
  for (const section of ['packages', 'packages-dev'] as const) {
    for (const pkg of (json[section] ?? []) as Array<{ name?: string; version?: string }>) {
      if (pkg.name && pkg.version) {
        out.push({ ecosystem: 'Packagist', name: pkg.name, version: pkg.version.replace(/^v/, '') });
      }
    }
  }
  return dedupe(out);
}

function parsePomXml(content: string): PackagePin[] {
  const out: PackagePin[] = [];
  const deps = content.match(/<dependency>([\s\S]*?)<\/dependency>/g) ?? [];
  for (const d of deps) {
    const g = d.match(/<groupId>([^<]+)<\/groupId>/)?.[1];
    const a = d.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1];
    const v = d.match(/<version>([^<]+)<\/version>/)?.[1];
    if (g && a && v && !v.startsWith('${')) {
      out.push({ ecosystem: 'Maven', name: `${g}:${a}`, version: v });
    }
  }
  return dedupe(out);
}

function parseDockerfile(content: string): PackagePin[] {
  const out: PackagePin[] = [];
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*FROM\s+([^\s:]+):([^\s]+)/i);
    if (m) {
      out.push({ ecosystem: 'OCI', name: m[1], version: m[2] });
    }
  }
  return dedupe(out);
}

function parseCycloneDx(content: string): PackagePin[] {
  const json = JSON.parse(content);
  const out: PackagePin[] = [];
  for (const c of (json.components ?? []) as Array<{
    name?: string;
    version?: string;
    purl?: string;
  }>) {
    if (c.name && c.version && c.purl) {
      const ecosystem = c.purl.startsWith('pkg:npm/')
        ? 'npm'
        : c.purl.startsWith('pkg:pypi/')
          ? 'PyPI'
          : c.purl.startsWith('pkg:gem/')
            ? 'RubyGems'
            : c.purl.startsWith('pkg:maven/')
              ? 'Maven'
              : c.purl.startsWith('pkg:cargo/')
                ? 'crates.io'
                : c.purl.startsWith('pkg:composer/')
                  ? 'Packagist'
                  : c.purl.startsWith('pkg:golang/')
                    ? 'Go'
                    : 'unknown';
      out.push({ ecosystem, name: c.name, version: c.version });
    }
  }
  return dedupe(out);
}

function parseSpdxJson(content: string): PackagePin[] {
  const json = JSON.parse(content);
  const out: PackagePin[] = [];
  for (const p of (json.packages ?? []) as Array<{ name?: string; versionInfo?: string; externalRefs?: Array<{ referenceLocator?: string }> }>) {
    if (!p.name || !p.versionInfo) continue;
    const purl = p.externalRefs?.find((r) => r.referenceLocator?.startsWith('pkg:'))?.referenceLocator;
    const ecosystem = purl?.startsWith('pkg:npm/')
      ? 'npm'
      : purl?.startsWith('pkg:pypi/')
        ? 'PyPI'
        : 'unknown';
    out.push({ ecosystem, name: p.name, version: p.versionInfo });
  }
  return dedupe(out);
}

function dedupe(pins: PackagePin[]): PackagePin[] {
  const seen = new Set<string>();
  const out: PackagePin[] = [];
  for (const p of pins) {
    const key = `${p.ecosystem}:${p.name}@${p.version}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}
