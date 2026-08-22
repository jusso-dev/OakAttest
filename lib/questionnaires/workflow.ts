export type QuestionnaireAnswerStatus = 'draft' | 'submitted' | 'approved' | 'changes_requested';

export function assertCitedAnswer(answerText: string, citationCount: number) {
  if (answerText.trim().length < 10) {
    throw new Error('Answer must contain at least 10 characters.');
  }
  if (citationCount < 1) {
    throw new Error('Answer needs at least one evidence citation before submission.');
  }
}

export function citedSourceNumbers(answerText: string, sourceCount: number) {
  const numbers = Array.from(answerText.matchAll(/\[(\d+)]/g), (match) => Number(match[1]));
  const valid = Array.from(new Set(numbers.filter((number) => number >= 1 && number <= sourceCount)));
  if (valid.length === 0) {
    throw new Error('Burl returned an uncited draft. No answer was saved; retry or draft manually.');
  }
  return valid;
}

export function assertReviewTransition(
  current: QuestionnaireAnswerStatus,
  decision: 'approved' | 'changes_requested',
  citationCount: number,
) {
  if (current !== 'submitted') throw new Error('Only submitted answers can be reviewed.');
  if (decision === 'approved' && citationCount < 1) {
    throw new Error('An uncited answer cannot be approved.');
  }
}

export function questionnaireFinalisationBlockers(
  questions: Array<{ id: string }>,
  latestAnswers: Array<{ questionId: string; status: string; citationCount: number }>,
) {
  const byQuestion = new Map(latestAnswers.map((answer) => [answer.questionId, answer]));
  return questions.flatMap((question, index) => {
    const answer = byQuestion.get(question.id);
    if (!answer) return [`Question ${index + 1} has no answer.`];
    if (answer.status !== 'approved') return [`Question ${index + 1} is not approved.`];
    if (answer.citationCount < 1) return [`Question ${index + 1} has no evidence citation.`];
    return [];
  });
}
