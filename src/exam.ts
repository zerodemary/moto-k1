import type { Question } from './types';

export const EXAM_DURATION_MS = 45 * 60 * 1000;

export function drawExam(questions: Question[], rng = Math.random, cfg = { single: 20, judge: 30 }): Question[] {
  const unique = [...new Map(questions.map(q => [q.id, q])).values()];
  return (['single', 'judge'] as const).flatMap(type => {
    const count = cfg[type];
    if (!Number.isInteger(count) || count < 0) throw new Error('抽题数量必须是非负整数');
    const pool = unique.filter(q => q.type === type);
    if (pool.length < count) throw new Error(`${type === 'single' ? '单选' : '判断'}题数量不足`);
    for (let i = pool.length - 1; i > 0; i--) {
      const value = rng();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('随机数必须在 [0, 1) 范围内');
      const j = Math.floor(value * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
  });
}

export function scoreExam(questions: Question[], answers: (number | null)[]) {
  let correct = 0;
  let unanswered = 0;
  const wrongIds: string[] = [];
  questions.forEach((q, i) => {
    const answer = answers[i];
    if (answer == null) unanswered++;
    if (answer != null && answer === q.answer) correct++;
    else wrongIds.push(q.id);
  });
  const score = correct * 2;
  return { score, correct, wrong: questions.length - correct, unanswered, passed: score >= 90, wrongIds };
}
