export type EvidenceStorageState = 'pending' | 'finalised' | 'quarantined';

export type EvidenceStorageStateInput = {
  storageVerifiedAt?: Date | string | null;
  quarantinedAt?: Date | string | null;
};

export function evidenceStorageState(item: EvidenceStorageStateInput): EvidenceStorageState {
  if (item.quarantinedAt) return 'quarantined';
  if (item.storageVerifiedAt) return 'finalised';
  return 'pending';
}

export function assertEvidenceFinalised(item: EvidenceStorageStateInput): void {
  const state = evidenceStorageState(item);
  if (state === 'pending') {
    throw new Error('Evidence upload has not been verified yet.');
  }
  if (state === 'quarantined') {
    throw new Error('Evidence upload is quarantined and cannot be used.');
  }
}
