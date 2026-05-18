import { describe, expect, it } from 'vitest';
import {
  buildSspCommentThreads,
  canTransitionSspStatus,
  hasGeneratedDivergence,
  sspSectionReadiness,
} from '@/lib/ssp/collaboration';

describe('SSP collaboration helpers', () => {
  it('builds comment threads and supports reopenable status changes', () => {
    const threads = buildSspCommentThreads([
      { id: 'root', parentCommentId: null, status: 'resolved' },
      { id: 'reply', parentCommentId: 'root', status: 'open' },
    ]);

    expect(threads).toHaveLength(1);
    expect(threads[0].replies[0].id).toBe('reply');
    expect(canTransitionSspStatus('client_ready', 'assessor_reviewed')).toBe(true);
    expect(canTransitionSspStatus('draft', 'approved')).toBe(false);
  });

  it('reports approval readiness and generated-content divergence', () => {
    const readiness = sspSectionReadiness([
      { sectionKey: 'overview', reviewStatus: 'approved' },
      { sectionKey: 'classification', reviewStatus: 'changes_requested' },
    ]);

    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toContain('boundary');
    expect(readiness.notApproved).toEqual(['classification']);
    expect(hasGeneratedDivergence({ content: 'User edit', autoSummary: 'Generated text' })).toBe(true);
  });
});
