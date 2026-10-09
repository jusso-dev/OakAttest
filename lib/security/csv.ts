const FORMULA_PREFIX = /^[=+\-@]|^[\t\r]/;

export function neutraliseCsvCell(value: unknown): string {
  const raw = value == null ? '' : String(value);
  const text = FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  return [
    headers.map((header) => neutraliseCsvCell(header)).join(','),
    ...rows.map((row) => headers.map((header) => neutraliseCsvCell(row[header])).join(',')),
  ].join('\n');
}
