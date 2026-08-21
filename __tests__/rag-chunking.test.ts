import { describe, expect, it } from 'vitest';
import { chunkDocumentText, normalizeDocumentText } from '@/lib/rag/chunking';

describe('RAG document chunking', () => {
  it('normalises untrusted document text before indexing', () => {
    expect(normalizeDocumentText('alpha\u0000   beta\n\n\n\ngamma')).toBe('alpha beta\n\ngamma');
  });

  it('creates bounded, overlapping chunks without dropping content boundaries', () => {
    const text = Array.from({ length: 140 }, (_, index) => `Paragraph ${index}. Evidence detail.`).join(
      '\n\n',
    );
    const chunks = chunkDocumentText(text);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 2_800)).toBe(true);
    expect(chunks.join(' ')).toContain('Paragraph 0.');
    expect(chunks.join(' ')).toContain('Paragraph 139.');
  });
});
