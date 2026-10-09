/** Placeholder hash that cannot collide across evidence items. */
export function pendingEvidenceSha(evidenceItemId: string): string {
  return `pending:${evidenceItemId}`;
}
