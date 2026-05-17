import type { PackagePin } from './manifest';

// OSV.dev client. We use the querybatch endpoint which accepts up to 1000
// queries per call. The response shape is one object per input query;
// `vulns[]` is empty if there are no matches.

const ENDPOINT = 'https://api.osv.dev/v1/querybatch';

type OsvQuery = { package: { name: string; ecosystem: string }; version: string };
type OsvBatchResult = {
  results: Array<{
    vulns?: Array<{ id: string; modified?: string }>;
  }>;
};

export type OsvAdvisory = {
  id: string;
  summary: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
  cvss?: number;
  references: string[];
  fixedVersions: string[];
};

type OsvDetail = {
  id: string;
  summary?: string;
  details?: string;
  severity?: Array<{ type: string; score: string }>;
  references?: Array<{ type: string; url: string }>;
  affected?: Array<{
    ranges?: Array<{ events?: Array<{ fixed?: string }> }>;
  }>;
};

export type ScanFinding = {
  pin: PackagePin;
  advisory: OsvAdvisory;
};

// Look up advisories for a pin set. Returns one finding per (pin, advisory).
export async function scanPins(pins: PackagePin[]): Promise<ScanFinding[]> {
  if (pins.length === 0) return [];

  const queries: OsvQuery[] = pins.map((p) => ({
    package: { name: p.name, ecosystem: p.ecosystem },
    version: p.version,
  }));

  const findings: ScanFinding[] = [];
  // Batch in chunks of 800 to leave headroom.
  for (let i = 0; i < queries.length; i += 800) {
    const slice = queries.slice(i, i + 800);
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries: slice }),
    });
    if (!res.ok) {
      throw new Error(`OSV batch query failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as OsvBatchResult;
    for (let j = 0; j < data.results.length; j += 1) {
      const r = data.results[j];
      if (!r.vulns?.length) continue;
      const pin = pins[i + j];
      for (const v of r.vulns) {
        const detail = await fetchAdvisory(v.id);
        if (detail) findings.push({ pin, advisory: detail });
      }
    }
  }
  return findings;
}

async function fetchAdvisory(id: string): Promise<OsvAdvisory | null> {
  const res = await fetch(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  const d = (await res.json()) as OsvDetail;
  const cvss = extractCvss(d);
  return {
    id: d.id,
    summary: d.summary ?? d.details?.slice(0, 240) ?? id,
    severity: cvssToSeverity(cvss),
    cvss,
    references: (d.references ?? []).map((r) => r.url).slice(0, 8),
    fixedVersions: extractFixedVersions(d),
  };
}

function extractCvss(d: OsvDetail): number | undefined {
  const cvss = d.severity?.find((s) => s.type.toUpperCase().startsWith('CVSS'));
  if (!cvss) return undefined;
  const m = cvss.score.match(/CVSS:3\.[01]\/.*\/(\d+\.\d+)$/);
  if (m) return Number(m[1]);
  const direct = Number(cvss.score);
  return Number.isFinite(direct) ? direct : undefined;
}

function cvssToSeverity(score: number | undefined): OsvAdvisory['severity'] {
  if (score === undefined) return 'unknown';
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  if (score >= 0.1) return 'low';
  return 'unknown';
}

function extractFixedVersions(d: OsvDetail): string[] {
  const out = new Set<string>();
  for (const a of d.affected ?? []) {
    for (const r of a.ranges ?? []) {
      for (const e of r.events ?? []) {
        if (e.fixed) out.add(e.fixed);
      }
    }
  }
  return [...out];
}
