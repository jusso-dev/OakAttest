import JSZip from 'jszip';
import { PDFParse } from 'pdf-parse';

export const QUESTIONNAIRE_FORMATS = ['csv', 'xlsx', 'docx', 'pdf'] as const;
export type QuestionnaireFormat = (typeof QUESTIONNAIRE_FORMATS)[number];

export type ImportedQuestion = {
  externalRef: string | null;
  section: string | null;
  prompt: string;
};

const MAX_QUESTIONNAIRE_BYTES = 8 * 1024 * 1024;
const MAX_QUESTIONS = 2_000;
const HEADER_ALIASES = {
  externalRef: ['id', 'question id', 'question number', 'reference', 'ref', 'control id'],
  section: ['section', 'category', 'domain', 'topic'],
  prompt: ['question', 'prompt', 'requirement', 'query', 'question text'],
} as const;

export async function parseQuestionnaireFile({
  buffer,
  filename,
  mimeType,
}: {
  buffer: Buffer;
  filename: string;
  mimeType?: string | null;
}): Promise<{ format: QuestionnaireFormat; questions: ImportedQuestion[] }> {
  if (buffer.length === 0) throw new Error('Questionnaire file is empty.');
  if (buffer.length > MAX_QUESTIONNAIRE_BYTES) {
    throw new Error('Questionnaire files must be 8 MB or smaller.');
  }

  const format = questionnaireFormat(filename, mimeType);
  let questions: ImportedQuestion[];
  if (format === 'csv') {
    questions = questionsFromRows(parseCsv(buffer.toString('utf8')));
  } else if (format === 'xlsx') {
    questions = questionsFromRows(await parseXlsx(buffer));
  } else if (format === 'docx') {
    questions = questionsFromLines(await parseDocx(buffer));
  } else {
    questions = questionsFromLines(await parsePdf(buffer));
  }

  const deduped = deduplicateQuestions(questions);
  if (deduped.length === 0) {
    throw new Error('No questionnaire questions could be extracted from this file.');
  }
  if (deduped.length > MAX_QUESTIONS) {
    throw new Error(`Questionnaire contains ${deduped.length} questions; maximum is ${MAX_QUESTIONS}.`);
  }
  return { format, questions: deduped };
}

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const text = input.replace(/^\uFEFF/, '');

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((value) => value.trim()));
}

export function questionsFromRows(rows: string[][]): ImportedQuestion[] {
  if (rows.length === 0) return [];
  const headers = rows[0].map(normaliseHeader);
  const promptIndex = findHeader(headers, HEADER_ALIASES.prompt);
  const externalRefIndex = findHeader(headers, HEADER_ALIASES.externalRef);
  const sectionIndex = findHeader(headers, HEADER_ALIASES.section);

  if (promptIndex >= 0) {
    return rows.slice(1).flatMap((row) => {
      const prompt = cleanPrompt(row[promptIndex] ?? '');
      if (!prompt) return [];
      return [{
        externalRef: cleanOptional(row[externalRefIndex] ?? ''),
        section: cleanOptional(row[sectionIndex] ?? ''),
        prompt,
      }];
    });
  }

  return rows.flatMap((row) => {
    const cells = row.map((value) => value.trim()).filter(Boolean);
    if (cells.length === 0) return [];
    const prompt = cleanPrompt([...cells].sort((a, b) => b.length - a.length)[0]);
    if (!prompt) return [];
    const reference = cells.find((value) => value !== prompt && value.length <= 80) ?? null;
    return [{ externalRef: reference, section: null, prompt }];
  });
}

export function questionsFromLines(lines: string[]): ImportedQuestion[] {
  const questions: ImportedQuestion[] = [];
  let section: string | null = null;
  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    if (line.endsWith(':') && line.length <= 120) {
      section = line.slice(0, -1).trim() || null;
      continue;
    }
    const prompt = cleanPrompt(line);
    if (!prompt) continue;
    const referenceMatch = /^((?:[A-Za-z]{1,12}[-.]?)?\d+(?:[.\-]\d+)*)[.):\s-]+(.+)$/.exec(prompt);
    questions.push({
      externalRef: referenceMatch?.[1] ?? null,
      section,
      prompt: referenceMatch?.[2]?.trim() ?? prompt,
    });
  }
  return questions;
}

async function parseXlsx(buffer: Buffer): Promise<string[][]> {
  const zip = await loadOfficeArchive(buffer, 'XLSX');
  const sheetPath = Object.keys(zip.files)
    .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
    .sort()[0];
  if (!sheetPath) throw new Error('XLSX has no readable worksheet.');

  const sharedStringsXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  const sharedStrings = sharedStringsXml
    ? xmlBlocks(sharedStringsXml, 'si').map((block) => xmlText(block))
    : [];
  const sheetXml = await zip.file(sheetPath)!.async('string');
  return xmlBlocks(sheetXml, 'row').map((rowXml) => {
    const values: string[] = [];
    for (const match of rowXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const attributes = match[1];
      const body = match[2];
      const ref = /\br="([A-Z]+)\d+"/i.exec(attributes)?.[1] ?? '';
      const column = spreadsheetColumnIndex(ref);
      const type = /\bt="([^"]+)"/i.exec(attributes)?.[1] ?? '';
      const raw = type === 'inlineStr'
        ? xmlText(body)
        : decodeXml(/<v[^>]*>([\s\S]*?)<\/v>/i.exec(body)?.[1] ?? '');
      values[column] = type === 's' ? sharedStrings[Number(raw)] ?? '' : raw;
    }
    return values;
  });
}

async function parseDocx(buffer: Buffer): Promise<string[]> {
  const zip = await loadOfficeArchive(buffer, 'DOCX');
  const document = await zip.file('word/document.xml')?.async('string');
  if (!document) throw new Error('DOCX has no readable document body.');
  return xmlBlocks(document, 'w:p').map((paragraph) => xmlText(paragraph)).filter(Boolean);
}

async function parsePdf(buffer: Buffer): Promise<string[]> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text.split(/\r?\n/);
  } catch {
    throw new Error('PDF questionnaire text could not be extracted. Use a text-based PDF.');
  } finally {
    await parser.destroy();
  }
}

async function loadOfficeArchive(buffer: Buffer, label: 'XLSX' | 'DOCX') {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error(`${label} questionnaire is not a valid Office document.`);
  }

  const maxUncompressedBytes = 32 * 1024 * 1024;
  let uncompressedBytes = 0;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const size = (entry as JSZip.JSZipObject & { _data?: { uncompressedSize?: number } })._data
      ?.uncompressedSize ?? 0;
    uncompressedBytes += size;
    if (uncompressedBytes > maxUncompressedBytes) {
      throw new Error(
        `${label} questionnaire uncompressed contents exceed 32 MB and were rejected before extraction.`,
      );
    }
  }

  return zip;
}

function questionnaireFormat(filename: string, mimeType?: string | null): QuestionnaireFormat {
  const extension = filename.toLowerCase().split('.').pop();
  if (extension && QUESTIONNAIRE_FORMATS.includes(extension as QuestionnaireFormat)) {
    return extension as QuestionnaireFormat;
  }
  if (mimeType === 'text/csv') return 'csv';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  throw new Error('Questionnaire format must be CSV, XLSX, DOCX, or PDF.');
}

function xmlBlocks(xml: string, tag: string) {
  const escaped = tag.replace(':', '\\:');
  return Array.from(xml.matchAll(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'gi')))
    .map((match) => match[1]);
}

function xmlText(xml: string) {
  return Array.from(xml.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/gi))
    .map((match) => decodeXml(match[1]))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeXml(value: string) {
  return value
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function spreadsheetColumnIndex(reference: string) {
  let result = 0;
  for (const character of reference.toUpperCase()) {
    result = result * 26 + character.charCodeAt(0) - 64;
  }
  return Math.max(result - 1, 0);
}

function normaliseHeader(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function findHeader(headers: string[], aliases: readonly string[]) {
  return headers.findIndex((header) => aliases.includes(header));
}

function cleanOptional(value: string) {
  const cleaned = value.replace(/\s+/g, ' ').trim().slice(0, 240);
  return cleaned || null;
}

function cleanPrompt(value: string) {
  const cleaned = value
    .replace(/^\s*(?:[-*•]|\d+[.)]|[A-Za-z][.)])\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^--?\s*\d+\s+of\s+\d+\s*--?$/i.test(cleaned)) return '';
  return cleaned.length >= 5 ? cleaned.slice(0, 4_000) : '';
}

function deduplicateQuestions(questions: ImportedQuestion[]) {
  const seen = new Map<string, number>();
  return questions.map((question) => {
    const key = question.prompt.toLocaleLowerCase('en-AU');
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);
    if (occurrence === 1) return question;
    return { ...question, prompt: `${question.prompt} (${occurrence})` };
  });
}
