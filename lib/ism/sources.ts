const repo = 'AustralianCyberSecurityCentre/ism-oscal';
const rawBase = `https://raw.githubusercontent.com/${repo}`;
const apiBase = `https://api.github.com/repos/${repo}`;
const catalogName = 'ISM_catalog.json';

export type IsmRelease = {
  name: string;
  catalogUrl: string;
};

export function latestIsmCatalogUrl(): string {
  return process.env.ISM_OSCAL_URL ?? `${rawBase}/main/${catalogName}`;
}

export function releaseIsmCatalogUrl(release: string): string {
  const tag = release.startsWith('v') ? release : `v${release}`;
  return `${rawBase}/refs/tags/${encodeURIComponent(tag)}/${catalogName}`;
}

export async function listIsmReleases(limit = 20): Promise<IsmRelease[]> {
  const res = await fetch(`${apiBase}/tags?per_page=${limit}`, {
    headers: { Accept: 'application/vnd.github+json' },
    next: { revalidate: 60 * 60 * 6 },
  });
  if (!res.ok) {
    throw new Error(`Failed to load ACSC ISM OSCAL releases: ${res.status}`);
  }

  const tags = (await res.json()) as Array<{ name: string }>;
  return tags
    .filter((tag) => /^v\d{4}\.\d{2}\.\d{1,2}$/.test(tag.name))
    .map((tag) => ({ name: tag.name, catalogUrl: releaseIsmCatalogUrl(tag.name) }));
}

export async function fetchIsmCatalog(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ISM OSCAL catalog from ${url}: ${res.status}`);
  }
  return res.json();
}
