import { PDFParse } from 'pdf-parse';

const MAX_PDF_BYTES = 12 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 24_000;

export type ExtractedPdf = {
  text: string;
  extractedCharacters: number;
  truncated: boolean;
};

export async function extractPdfText(file: File): Promise<ExtractedPdf> {
  if (file.size > MAX_PDF_BYTES) {
    throw new Error('PDF attachments are limited to 12 MB for Burl analysis.');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    const normalized = result.text.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const truncated = normalized.length > MAX_EXTRACTED_CHARS;
    const text = truncated ? normalized.slice(0, MAX_EXTRACTED_CHARS) : normalized;

    return {
      text,
      extractedCharacters: normalized.length,
      truncated,
    };
  } finally {
    await parser.destroy();
  }
}
