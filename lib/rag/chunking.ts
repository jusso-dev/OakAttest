const CHUNK_CHARACTERS = 2_800;
const CHUNK_OVERLAP = 320;
export const MAX_SEARCH_DOCUMENT_BYTES = 24 * 1024 * 1024;

export function chunkDocumentText(text: string) {
  const normalized = normalizeDocumentText(text);
  if (!normalized) return [];
  if (normalized.length <= CHUNK_CHARACTERS) return [normalized];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + CHUNK_CHARACTERS, normalized.length);
    if (end < normalized.length) {
      const paragraphBreak = normalized.lastIndexOf('\n\n', end);
      const sentenceBreak = normalized.lastIndexOf('. ', end);
      const candidate = Math.max(paragraphBreak, sentenceBreak);
      if (candidate > start + CHUNK_CHARACTERS / 2) end = candidate + 1;
    }
    chunks.push(normalized.slice(start, end).trim());
    if (end >= normalized.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }
  return chunks.filter(Boolean);
}

export function normalizeDocumentText(value: string) {
  return value
    .replace(/\u0000/g, '')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[\t ]{2,}/g, ' ')
    .trim();
}
