import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  parseCsv,
  parseQuestionnaireFile,
  questionsFromLines,
  questionsFromRows,
} from '@/lib/questionnaires/import';

describe('questionnaire import', () => {
  it('extracts quoted CSV questions and their metadata', async () => {
    const csv = [
      'Question ID,Section,Question',
      'A-1,Access,"Do you review privileged access, quarterly?"',
      'A-2,Access,"Are leavers removed within 24 hours?"',
    ].join('\n');

    const result = await parseQuestionnaireFile({
      buffer: Buffer.from(csv),
      filename: 'security.csv',
      mimeType: 'text/csv',
    });

    expect(result.format).toBe('csv');
    expect(result.questions).toEqual([
      {
        externalRef: 'A-1',
        section: 'Access',
        prompt: 'Do you review privileged access, quarterly?',
      },
      {
        externalRef: 'A-2',
        section: 'Access',
        prompt: 'Are leavers removed within 24 hours?',
      },
    ]);
  });

  it('extracts rows from the first XLSX worksheet', async () => {
    const zip = new JSZip();
    zip.file('xl/sharedStrings.xml', `<?xml version="1.0"?><sst>
      <si><t>Reference</t></si><si><t>Section</t></si><si><t>Question</t></si>
      <si><t>NET-1</t></si><si><t>Network</t></si><si><t>Is network access logged?</t></si>
    </sst>`);
    zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0"?><worksheet><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
      <row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="s"><v>5</v></c></row>
    </sheetData></worksheet>`);
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const result = await parseQuestionnaireFile({ buffer, filename: 'security.xlsx' });

    expect(result.format).toBe('xlsx');
    expect(result.questions).toEqual([
      { externalRef: 'NET-1', section: 'Network', prompt: 'Is network access logged?' },
    ]);
  });

  it('extracts sectioned questions from DOCX paragraphs', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="urn:w"><w:body>
      <w:p><w:r><w:t>Incident response:</w:t></w:r></w:p>
      <w:p><w:r><w:t>IR-1. Is the response plan tested annually?</w:t></w:r></w:p>
    </w:body></w:document>`);
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const result = await parseQuestionnaireFile({ buffer, filename: 'security.docx' });

    expect(result.format).toBe('docx');
    expect(result.questions).toEqual([
      {
        externalRef: 'IR-1',
        section: 'Incident response',
        prompt: 'Is the response plan tested annually?',
      },
    ]);
  });

  it('extracts text questions from a PDF', async () => {
    const result = await parseQuestionnaireFile({
      buffer: makePdf('BCP-1. Is business continuity tested annually?'),
      filename: 'security.pdf',
      mimeType: 'application/pdf',
    });

    expect(result.format).toBe('pdf');
    expect(result.questions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        externalRef: 'BCP-1',
        prompt: 'Is business continuity tested annually?',
      }),
    ]));
  });

  it('rejects unsupported, empty, malformed, and oversized input', async () => {
    await expect(parseQuestionnaireFile({ buffer: Buffer.alloc(0), filename: 'q.csv' }))
      .rejects.toThrow('empty');
    await expect(parseQuestionnaireFile({ buffer: Buffer.from('x'), filename: 'q.txt' }))
      .rejects.toThrow('CSV, XLSX, DOCX, or PDF');
    await expect(parseQuestionnaireFile({ buffer: Buffer.from('not zip'), filename: 'q.xlsx' }))
      .rejects.toThrow('not a valid Office document');
    await expect(parseQuestionnaireFile({ buffer: Buffer.alloc(8 * 1024 * 1024 + 1), filename: 'q.csv' }))
      .rejects.toThrow('8 MB');
  });

  it('handles CSV escaped quotes and non-tabular document lines', () => {
    expect(parseCsv('Question\n"Do you use ""break glass"" accounts?"')[1][0])
      .toBe('Do you use "break glass" accounts?');
    expect(questionsFromRows([['Prompt'], ['Is MFA required?']])).toHaveLength(1);
    expect(questionsFromLines(['Identity:', '1. Is MFA required?', '1. Is MFA required?']))
      .toHaveLength(2);
  });
});

function makePdf(text: string) {
  const escaped = text.replace(/([\\()])/g, '\\$1');
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
}
