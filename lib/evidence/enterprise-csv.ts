export type EnterpriseEvidenceSource =
  | 'm365_secure_score'
  | 'm365_entra_auth_methods'
  | 'm365_compliance_manager'
  | 'm365_defender'
  | 'google_workspace_security'
  | 'google_workspace_audit'
  | 'generic_enterprise_csv';

export type EnterpriseEvidenceFinding = {
  source: EnterpriseEvidenceSource;
  title: string;
  status?: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  summary?: string;
  evidenceQuality: 'excellent' | 'good' | 'fair';
  mappedStrategies: string[];
  mappedKeywords: string[];
};

export type EnterpriseEvidenceSummary = {
  source: EnterpriseEvidenceSource;
  rowCount: number;
  mappedStrategies: string[];
  suggestedControlKeywords: string[];
  findings: EnterpriseEvidenceFinding[];
};

type CsvRow = Record<string, string>;

const E8_STRATEGIES = [
  'application_control',
  'patch_applications',
  'configure_macro_settings',
  'user_application_hardening',
  'restrict_admin_privileges',
  'patch_operating_systems',
  'multi_factor_authentication',
  'regular_backups',
];

const RULES: Array<{
  pattern: RegExp;
  strategy?: string;
  keywords: string[];
}> = [
  {
    pattern: /\b(mfa|multi[- ]factor|2[- ]step|2sv|authenticator|authentication method|conditional access)\b/i,
    strategy: 'multi_factor_authentication',
    keywords: ['multi-factor authentication', 'authentication', 'conditional access', 'access control'],
  },
  {
    pattern: /\b(admin|administrative|administrator|privileged|global admin|role assignment|rbac|break glass)\b/i,
    strategy: 'restrict_admin_privileges',
    keywords: ['privileged access', 'administrator', 'role management', 'access control'],
  },
  {
    pattern: /\b(patch|update|vulnerab|cve|defender|exposure|endpoint|device compliance)\b/i,
    strategy: 'patch_applications',
    keywords: ['patch', 'vulnerability', 'security updates', 'endpoint security'],
  },
  {
    pattern: /\b(operating system|os update|windows update|linux update|macos update)\b/i,
    strategy: 'patch_operating_systems',
    keywords: ['operating system', 'patch', 'security updates'],
  },
  {
    pattern: /\b(macro|office macro|vba)\b/i,
    strategy: 'configure_macro_settings',
    keywords: ['macro', 'office macros'],
  },
  {
    pattern: /\b(application control|app control|allow ?list|block ?list|app locker|wdac)\b/i,
    strategy: 'application_control',
    keywords: ['application control', 'allow list', 'execution control'],
  },
  {
    pattern: /\b(hardening|browser|script|powershell|attack surface|legacy protocol|imap|pop|smtp auth)\b/i,
    strategy: 'user_application_hardening',
    keywords: ['hardening', 'browser', 'script', 'attack surface reduction'],
  },
  {
    pattern: /\b(backup|restore|recovery|retention|immutable)\b/i,
    strategy: 'regular_backups',
    keywords: ['backup', 'restore', 'recovery'],
  },
  {
    pattern: /\b(audit|log|logging|alert|monitor|investigation|sign-in|signin|login)\b/i,
    keywords: ['logging', 'monitoring', 'audit', 'security events'],
  },
  {
    pattern: /\b(dlp|data loss|sensitivity|label|information protection|purview|classification)\b/i,
    keywords: ['data loss prevention', 'information protection', 'classification'],
  },
  {
    pattern: /\b(phish|malware|safe links|safe attachments|spam|email security)\b/i,
    keywords: ['malware protection', 'email security', 'phishing'],
  },
];

export function parseEnterpriseEvidenceCsv(
  filename: string,
  content: string,
): EnterpriseEvidenceSummary {
  const csv = parseCsv(content);
  if (csv.rows.length === 0) {
    return {
      source: 'generic_enterprise_csv',
      rowCount: 0,
      mappedStrategies: [],
      suggestedControlKeywords: [],
      findings: [],
    };
  }

  const source = detectEnterpriseEvidenceSource(filename, csv.headers, csv.rows);
  const findings = csv.rows
    .slice(0, 500)
    .map((row) => toFinding(source, row))
    .filter((finding): finding is EnterpriseEvidenceFinding => finding !== null);
  const mappedStrategies = unique(findings.flatMap((f) => f.mappedStrategies));
  const suggestedControlKeywords = unique(findings.flatMap((f) => f.mappedKeywords));

  return {
    source,
    rowCount: csv.rows.length,
    mappedStrategies,
    suggestedControlKeywords,
    findings,
  };
}

export function detectEnterpriseEvidenceSource(
  filename: string,
  headers: string[],
  rows: CsvRow[],
): EnterpriseEvidenceSource {
  const lowerName = filename.toLowerCase();
  const headerText = headers.map(normaliseHeader).join(' ');
  const sampleText = rows.slice(0, 5).map((row) => Object.values(row).join(' ')).join(' ').toLowerCase();

  if (
    hasHeaders(headerText, ['user principal name']) &&
    /(mfa|methods registered|is mfa registered|default mfa method|capable)/i.test(headerText)
  ) {
    return 'm365_entra_auth_methods';
  }

  if (
    /(secure score|microsoft secure score|m365 secure score)/i.test(`${lowerName} ${sampleText}`) ||
    (hasHeaders(headerText, ['control']) && /(max score|score|implementation status|action type)/i.test(headerText))
  ) {
    return 'm365_secure_score';
  }

  if (
    /(compliance manager|purview|improvement action)/i.test(`${lowerName} ${sampleText}`) ||
    /(improvement action|assessment|testing status|implementation status|points achieved)/i.test(headerText)
  ) {
    return 'm365_compliance_manager';
  }

  if (
    /(defender|vulnerability management|security recommendation|exposure score)/i.test(`${lowerName} ${sampleText}`) ||
    /(recommendation|weakness|exposed devices|cve|remediation)/i.test(headerText)
  ) {
    return 'm365_defender';
  }

  if (
    hasHeaders(headerText, ['email']) &&
    /(2-step|2sv|two-step|is enrolled in 2-step verification|admin)/i.test(headerText)
  ) {
    return 'google_workspace_security';
  }

  if (
    /(google workspace|admin audit|login audit|security center|security health)/i.test(`${lowerName} ${sampleText}`) ||
    /(event name|event description|actor|ip address|login type)/i.test(headerText)
  ) {
    return 'google_workspace_audit';
  }

  return 'generic_enterprise_csv';
}

function toFinding(source: EnterpriseEvidenceSource, row: CsvRow): EnterpriseEvidenceFinding | null {
  const title = findValue(row, [
    'control',
    'control name',
    'recommendation',
    'security recommendation',
    'improvement action',
    'action',
    'name',
    'title',
    'event name',
    'user principal name',
    'email',
  ]) || 'Untitled evidence row';
  const status = findValue(row, [
    'status',
    'implementation status',
    'test status',
    'testing status',
    'state',
    'mfa registered',
    'is mfa registered',
    'mfa capable',
    '2-step verification enrollment',
    '2-step verification enforcement',
    'is enrolled in 2-step verification',
  ]);
  const summary = summaryForSource(source, row);
  const text = `${sourceHint(source)} ${title} ${status ?? ''} ${summary ?? ''} ${Object.values(row).join(' ')}`;
  const mapped = mapTextToControls(text);

  if (mapped.strategies.length === 0 && mapped.keywords.length === 0 && source === 'generic_enterprise_csv') {
    return null;
  }

  return {
    source,
    title,
    status,
    severity: severityForRow(row, status),
    summary,
    evidenceQuality: qualityForSource(source),
    mappedStrategies: mapped.strategies,
    mappedKeywords: mapped.keywords,
  };
}

function sourceHint(source: EnterpriseEvidenceSource): string {
  switch (source) {
    case 'm365_entra_auth_methods':
      return 'multi-factor authentication authentication methods';
    case 'google_workspace_security':
      return '2-step verification multi-factor authentication administrator security health';
    case 'google_workspace_audit':
      return 'audit logging login security event monitoring';
    case 'm365_defender':
      return 'vulnerability management endpoint patch security recommendation';
    case 'm365_compliance_manager':
      return 'compliance control test status policy evidence';
    case 'm365_secure_score':
      return 'secure score control recommendation';
    default:
      return '';
  }
}

function summaryForSource(source: EnterpriseEvidenceSource, row: CsvRow): string | undefined {
  const parts: string[] = [];
  const add = (label: string, value?: string) => {
    if (value) parts.push(`${label}: ${value}`);
  };

  if (source === 'm365_secure_score') {
    add('Category', findValue(row, ['control category', 'category']));
    add('Score', scoreText(row));
    add('User impact', findValue(row, ['user impact']));
  } else if (source === 'm365_entra_auth_methods') {
    add('User', findValue(row, ['user principal name', 'email']));
    add('Methods', findValue(row, ['methods registered', 'auth methods', 'default mfa method']));
    add('MFA capable', findValue(row, ['mfa capable', 'is capable']));
  } else if (source === 'm365_compliance_manager') {
    add('Solution', findValue(row, ['solution', 'solutions', 'service']));
    add('Group', findValue(row, ['group', 'category']));
    add('Status', findValue(row, ['test status', 'testing status', 'implementation status']));
  } else if (source === 'm365_defender') {
    add('Affected', findValue(row, ['exposed devices', 'devices', 'affected assets']));
    add('Remediation', findValue(row, ['remediation', 'recommended action']));
    add('Score', scoreText(row));
  } else if (source === 'google_workspace_security' || source === 'google_workspace_audit') {
    add('Actor', findValue(row, ['actor', 'email', 'user', 'user email']));
    add('Event', findValue(row, ['event description', 'description']));
    add('Date', findValue(row, ['date', 'time', 'event time']));
  }

  return parts.length > 0 ? parts.join(' | ') : undefined;
}

function scoreText(row: CsvRow): string | undefined {
  const score = findValue(row, ['score', 'points achieved', 'current score']);
  const max = findValue(row, ['max score', 'points available', 'max points']);
  if (score && max) return `${score}/${max}`;
  return score ?? max;
}

function severityForRow(row: CsvRow, status?: string): EnterpriseEvidenceFinding['severity'] {
  const explicit = findValue(row, ['severity', 'risk', 'priority', 'impact']);
  const normalStatus = status?.trim().toLowerCase();
  if (
    normalStatus &&
    /^(false|no|disabled|not enrolled|not enforced|not registered|not capable)$/.test(normalStatus)
  ) {
    return 'high';
  }
  if (normalStatus && /^(true|yes|enabled|enrolled|enforced|registered|capable)$/.test(normalStatus)) {
    return 'info';
  }
  const text = `${explicit ?? ''} ${status ?? ''} ${Object.values(row).join(' ')}`.toLowerCase();
  if (/\b(critical|failed high|high risk|not enforced|disabled|not registered|non[- ]compliant)\b/.test(text)) {
    return 'high';
  }
  if (/\b(high|failed medium|medium risk|partially|not capable|in progress|warning)\b/.test(text)) {
    return 'medium';
  }
  if (/\b(low|informational|passed|complete|enabled|enforced|registered)\b/.test(text)) {
    return 'info';
  }
  return 'low';
}

function qualityForSource(source: EnterpriseEvidenceSource): EnterpriseEvidenceFinding['evidenceQuality'] {
  if (
    source === 'm365_secure_score' ||
    source === 'm365_entra_auth_methods' ||
    source === 'm365_compliance_manager' ||
    source === 'google_workspace_security'
  ) {
    return 'good';
  }
  if (source === 'm365_defender' || source === 'google_workspace_audit') return 'excellent';
  return 'fair';
}

function mapTextToControls(text: string): { strategies: string[]; keywords: string[] } {
  const strategies: string[] = [];
  const keywords: string[] = [];

  for (const rule of RULES) {
    if (!rule.pattern.test(text)) continue;
    if (rule.strategy && E8_STRATEGIES.includes(rule.strategy)) strategies.push(rule.strategy);
    keywords.push(...rule.keywords);
  }

  return { strategies: unique(strategies), keywords: unique(keywords) };
}

function parseCsv(content: string): { headers: string[]; rows: CsvRow[] } {
  const rows = splitCsv(content);
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => h.trim());
  return {
    headers,
    rows: rows.slice(1).map((row) => {
      const obj: CsvRow = {};
      for (let i = 0; i < headers.length; i += 1) obj[headers[i]] = row[i]?.trim() ?? '';
      return obj;
    }),
  };
}

function splitCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    if (inQuotes) {
      if (char === '"' && content[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\r') {
      // ignore CR in CRLF
    } else if (char === '\n') {
      row.push(cell);
      cell = '';
      if (row.some((value) => value.trim().length > 0)) rows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim().length > 0)) rows.push(row);
  }

  return rows;
}

function findValue(row: CsvRow, names: string[]): string | undefined {
  const entries = Object.entries(row);
  for (const name of names) {
    const found = entries.find(([key]) => normaliseHeader(key) === normaliseHeader(name))?.[1];
    if (found) return found;
  }
  return undefined;
}

function normaliseHeader(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasHeaders(headerText: string, expected: string[]): boolean {
  return expected.every((header) => headerText.includes(normaliseHeader(header)));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}
