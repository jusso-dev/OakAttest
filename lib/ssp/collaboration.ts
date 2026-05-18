export const SSP_SECTION_KEYS = [
  'overview',
  'classification',
  'boundary',
  'controls',
  'implementation',
  'essential_eight',
  'residual_risks',
  'annexes',
] as const;

export type SspSectionKey = (typeof SSP_SECTION_KEYS)[number];

export const SSP_REVIEW_STATUSES = [
  'draft',
  'client_ready',
  'assessor_reviewed',
  'changes_requested',
  'approved',
] as const;

export type SspReviewStatus = (typeof SSP_REVIEW_STATUSES)[number];

export type SspComment = {
  id: string;
  parentCommentId: string | null;
  status: string;
};

export type SspCommentThread = SspComment & {
  replies: SspCommentThread[];
};

export function sectionLabel(sectionKey: string): string {
  return sectionKey
    .split('_')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

export function hasGeneratedDivergence(section: {
  content: string;
  autoSummary?: string | null;
}): boolean {
  return Boolean(section.autoSummary && section.autoSummary.trim() !== section.content.trim());
}

export function buildSspCommentThreads(comments: SspComment[]): SspCommentThread[] {
  const byId = new Map<string, SspCommentThread>();
  const roots: SspCommentThread[] = [];
  for (const comment of comments) {
    byId.set(comment.id, { ...comment, replies: [] });
  }
  for (const thread of byId.values()) {
    if (thread.parentCommentId && byId.has(thread.parentCommentId)) {
      byId.get(thread.parentCommentId)!.replies.push(thread);
    } else {
      roots.push(thread);
    }
  }
  return roots;
}

export function sspSectionReadiness(
  sections: Array<{ sectionKey: string; reviewStatus: string }>,
) {
  const byKey = new Map(sections.map((section) => [section.sectionKey, section.reviewStatus]));
  const missing = SSP_SECTION_KEYS.filter((key) => !byKey.has(key));
  const notApproved = SSP_SECTION_KEYS.filter((key) => {
    const status = byKey.get(key);
    return status !== undefined && status !== 'approved';
  });
  return {
    ready: missing.length === 0 && notApproved.length === 0,
    missing,
    notApproved,
  };
}

export function canTransitionSspStatus(from: SspReviewStatus, to: SspReviewStatus): boolean {
  if (from === to) return true;
  if (to === 'approved') return from === 'assessor_reviewed';
  if (to === 'assessor_reviewed') return from === 'client_ready' || from === 'changes_requested';
  if (to === 'changes_requested') return from !== 'approved';
  if (to === 'client_ready') return from === 'draft' || from === 'changes_requested';
  if (to === 'draft') return from !== 'approved';
  return false;
}
