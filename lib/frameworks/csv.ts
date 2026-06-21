// Minimal RFC 4180-ish CSV parser + control-set mapper for client framework
// imports (SOC 2 / ISO 27001). The client supplies their licensed control text;
// we only provide the format. See docs/frameworks/multi-framework-plan.md §4.1.

export type ParsedControlRow = {
  controlId: string;
  title: string;
  description: string;
  topic: string | null;
  guidance: string | null;
  defaultApplicable: boolean | null;
};

export type CsvParseResult = {
  rows: ParsedControlRow[];
  errors: string[];
};

// Required + optional headers. `category` is accepted as an alias for `topic`.
const REQUIRED = ['control_id', 'title', 'description'] as const;

function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  // Strip a UTF-8 BOM if present.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      // ignore; handled by \n
    } else if (ch === '\n') {
      row.push(field);
      records.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  // Trailing field/row (no final newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }
  return records;
}

function toBool(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (v === '') return null;
  if (['true', 'yes', 'y', '1'].includes(v)) return true;
  if (['false', 'no', 'n', '0'].includes(v)) return false;
  return null;
}

export function parseControlCsv(text: string): CsvParseResult {
  const records = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  const errors: string[] = [];
  if (records.length === 0) {
    return { rows: [], errors: ['The file is empty.'] };
  }

  const header = records[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const missing = REQUIRED.filter((h) => idx(h) === -1);
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [`Missing required column(s): ${missing.join(', ')}. Expected a header row with ${REQUIRED.join(', ')}.`],
    };
  }

  const topicIdx = idx('topic') !== -1 ? idx('topic') : idx('category');
  const guidanceIdx = idx('guidance');
  const defaultApplicableIdx = idx('default_applicable');

  const rows: ParsedControlRow[] = [];
  const seen = new Set<string>();
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const line = r + 1;
    const controlId = (rec[idx('control_id')] ?? '').trim();
    const title = (rec[idx('title')] ?? '').trim();
    const description = (rec[idx('description')] ?? '').trim();
    if (!controlId || !title || !description) {
      errors.push(`Row ${line}: control_id, title and description are required.`);
      continue;
    }
    if (seen.has(controlId)) {
      errors.push(`Row ${line}: duplicate control_id '${controlId}'.`);
      continue;
    }
    seen.add(controlId);
    rows.push({
      controlId,
      title,
      description,
      topic: topicIdx !== -1 ? (rec[topicIdx] ?? '').trim() || null : null,
      guidance: guidanceIdx !== -1 ? (rec[guidanceIdx] ?? '').trim() || null : null,
      defaultApplicable:
        defaultApplicableIdx !== -1 ? toBool(rec[defaultApplicableIdx] ?? '') : null,
    });
  }

  return { rows, errors };
}
