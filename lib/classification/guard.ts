import type { Classification } from '@/db/schema/enums';
import { CLASSIFICATION_RANK } from '@/db/schema/enums';

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  OFFICIAL: 'OFFICIAL',
  OFFICIAL_SENSITIVE: 'OFFICIAL: Sensitive',
  PROTECTED: 'PROTECTED',
  SECRET: 'SECRET',
  TOP_SECRET: 'TOP SECRET',
};

export function classificationAllowed(
  workspaceClassification: Classification,
  dataClassification: Classification,
) {
  return CLASSIFICATION_RANK[dataClassification] <= CLASSIFICATION_RANK[workspaceClassification];
}

export function assertClassificationAllowed(
  workspaceClassification: Classification,
  dataClassification: Classification,
) {
  if (classificationAllowed(workspaceClassification, dataClassification)) return;

  throw new Error(
    `Upload blocked: this ${CLASSIFICATION_LABELS[workspaceClassification]} workspace cannot store ${CLASSIFICATION_LABELS[dataClassification]} data. Move the work to an appropriately accredited workspace; uploading it here would breach the workspace data-handling boundary.`,
  );
}
