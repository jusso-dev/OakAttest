// Vulnerability scan importers for §9.8 fieldwork. Each parser takes the
// raw file content and yields normalised findings with severity, CVSS, host,
// plugin id, and a free-text title we can map to controls in the worksheet.

export type ScanFinding = {
  host?: string;
  service?: string;
  pluginId: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  cvssScore?: number;
  description?: string;
  solution?: string;
  references?: string[];
  source: 'nessus' | 'rapid7' | 'qualys' | 'generic';
};

export function detectScanFormat(filename: string, content: string): ScanFinding['source'] {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.nessus') || /<NessusClientData/i.test(content)) return 'nessus';
  if (lower.includes('rapid7') || /^Plugin Name,Severity/i.test(content)) return 'rapid7';
  if (lower.includes('qualys') || /^IP,DNS,Vulnerability/i.test(content)) return 'qualys';
  return 'generic';
}

export function parseScan(filename: string, content: string): ScanFinding[] {
  const format = detectScanFormat(filename, content);
  switch (format) {
    case 'nessus':
      return parseNessus(content);
    case 'rapid7':
      return parseRapid7Csv(content);
    case 'qualys':
      return parseQualysCsv(content);
    default:
      return parseGenericCsv(content);
  }
}

// .nessus is XML. We do a defensive regex pull to avoid a full XML parser
// dependency. Real production code would use fast-xml-parser.
function parseNessus(xml: string): ScanFinding[] {
  const out: ScanFinding[] = [];
  // Each <ReportItem ...> block.
  const items = xml.match(/<ReportItem[\s\S]*?<\/ReportItem>/g) ?? [];
  for (const block of items) {
    const attr = (name: string) => block.match(new RegExp(`${name}="([^"]*)"`))?.[1];
    const tag = (name: string) =>
      block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1];
    const pluginId = attr('pluginID') ?? '';
    const title = attr('pluginName') ?? 'Untitled';
    const sevRaw = attr('severity');
    const sev = mapNumericSeverity(sevRaw);
    const cvssTag = tag('cvss3_base_score') ?? tag('cvss_base_score');
    const description = tag('description');
    const solution = tag('solution');
    const cvssScore = cvssTag ? Number(cvssTag) : undefined;
    out.push({
      pluginId,
      title,
      severity: sev,
      cvssScore: Number.isFinite(cvssScore) ? cvssScore : undefined,
      description,
      solution,
      source: 'nessus',
    });
  }
  return out;
}

function mapNumericSeverity(s?: string): ScanFinding['severity'] {
  switch (s) {
    case '4':
      return 'critical';
    case '3':
      return 'high';
    case '2':
      return 'medium';
    case '1':
      return 'low';
    default:
      return 'info';
  }
}

function parseRapid7Csv(content: string): ScanFinding[] {
  return parseCsvWithMap(content, (row) => ({
    host: row.IP ?? row.Asset ?? undefined,
    pluginId: row['Vulnerability ID'] ?? row['CVE ID'] ?? row.Plugin ?? '',
    title: row['Plugin Name'] ?? row.Title ?? 'Untitled',
    severity: mapTextSeverity(row.Severity ?? row['Risk Score']),
    cvssScore: parseScore(row.CVSS ?? row['CVSS Score']),
    description: row.Description,
    solution: row.Solution,
    source: 'rapid7' as const,
  }));
}

function parseQualysCsv(content: string): ScanFinding[] {
  return parseCsvWithMap(content, (row) => ({
    host: row.IP ?? row.DNS,
    pluginId: row.QID ?? row.CVE ?? '',
    title: row.Vulnerability ?? row.Title ?? 'Untitled',
    severity: mapNumericSeverity(row.Severity),
    cvssScore: parseScore(row['CVSS3 Score'] ?? row.CVSS),
    description: row.Threat,
    solution: row.Solution,
    source: 'qualys' as const,
  }));
}

function parseGenericCsv(content: string): ScanFinding[] {
  return parseCsvWithMap(content, (row) => ({
    host: row.host ?? row.asset ?? row.IP,
    pluginId: row.plugin_id ?? row.cve ?? row.id ?? '',
    title: row.title ?? row.name ?? row.vulnerability ?? 'Untitled',
    severity: mapTextSeverity(row.severity ?? row.risk),
    cvssScore: parseScore(row.cvss ?? row.score),
    description: row.description ?? row.threat,
    solution: row.solution ?? row.remediation,
    source: 'generic' as const,
  }));
}

function parseScore(input?: string): number | undefined {
  if (!input) return undefined;
  const n = Number(input);
  return Number.isFinite(n) ? n : undefined;
}

function mapTextSeverity(input?: string): ScanFinding['severity'] {
  if (!input) return 'info';
  const lower = input.toLowerCase().trim();
  if (lower.startsWith('crit')) return 'critical';
  if (lower.startsWith('high')) return 'high';
  if (lower.startsWith('med')) return 'medium';
  if (lower.startsWith('low')) return 'low';
  return 'info';
}

// Tiny RFC-4180-ish CSV reader sufficient for vendor exports.
function parseCsvWithMap<T>(content: string, fn: (row: Record<string, string>) => T): T[] {
  const lines = splitCsv(content);
  if (lines.length === 0) return [];
  const headers = lines[0];
  return lines.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i += 1) obj[headers[i]] = row[i] ?? '';
    return fn(obj);
  });
}

function splitCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < content.length; i += 1) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"' && content[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\r') {
      // skip
    } else if (c === '\n') {
      row.push(cell);
      cell = '';
      if (row.some((v) => v.length > 0)) rows.push(row);
      row = [];
    } else {
      cell += c;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((v) => v.length > 0)) rows.push(row);
  }
  return rows;
}
