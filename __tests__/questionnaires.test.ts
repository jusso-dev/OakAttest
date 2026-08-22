import { describe, expect, it } from 'vitest';
import {
  assertCitedAnswer,
  assertReviewTransition,
  citedSourceNumbers,
  questionnaireFinalisationBlockers,
} from '@/lib/questionnaires/workflow';

describe('questionnaire answer workflow', () => {
  it('requires an answer and evidence citation before submission', () => {
    expect(() => assertCitedAnswer('Supported by access review records.', 1)).not.toThrow();
    expect(() => assertCitedAnswer('Too short', 1)).toThrow('10 characters');
    expect(() => assertCitedAnswer('A complete answer without evidence.', 0)).toThrow('citation');
  });

  it('accepts only valid Burl citation markers', () => {
    expect(citedSourceNumbers('MFA is enforced [2], with quarterly review [1].', 2)).toEqual([2, 1]);
    expect(() => citedSourceNumbers('MFA is enforced.', 2)).toThrow('uncited');
    expect(() => citedSourceNumbers('Unsupported source [8].', 2)).toThrow('uncited');
  });

  it('permits human review only from submitted state and blocks uncited approval', () => {
    expect(() => assertReviewTransition('submitted', 'approved', 1)).not.toThrow();
    expect(() => assertReviewTransition('submitted', 'changes_requested', 0)).not.toThrow();
    expect(() => assertReviewTransition('draft', 'approved', 1)).toThrow('submitted');
    expect(() => assertReviewTransition('submitted', 'approved', 0)).toThrow('uncited');
  });

  it('blocks finalisation until every latest answer is approved and cited', () => {
    const questions = [{ id: 'q1' }, { id: 'q2' }];
    expect(questionnaireFinalisationBlockers(questions, [
      { questionId: 'q1', status: 'approved', citationCount: 1 },
      { questionId: 'q2', status: 'submitted', citationCount: 1 },
    ])).toEqual(['Question 2 is not approved.']);
    expect(questionnaireFinalisationBlockers(questions, [
      { questionId: 'q1', status: 'approved', citationCount: 1 },
      { questionId: 'q2', status: 'approved', citationCount: 1 },
    ])).toEqual([]);
  });
});
