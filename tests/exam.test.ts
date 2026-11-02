import { describe, expect, it } from 'vitest';
import { drawExam, scoreExam, EXAM_DURATION_MS } from '../src/exam';
import type { Question } from '../src/types';

const questions: Question[] = Array.from({ length: 80 }, (_, i) => ({ id: `${i}`, type: i < 35 ? 'single' : 'judge', stem: '题目', options: ['是', '否'], answer: 0, explanation: '', chapter: '第一章' }));

describe('抽题', () => {
  it('按类型抽取50道不重复题目，不修改原数组', () => {
    const before = structuredClone(questions);
    const result = drawExam(questions, () => 0.5);
    expect(result).toHaveLength(50);
    expect(result.slice(0, 20).every(q => q.type === 'single')).toBe(true);
    expect(result.slice(20).every(q => q.type === 'judge')).toBe(true);
    expect(new Set(result.map(q => q.id)).size).toBe(50);
    expect(questions).toEqual(before);
    expect(drawExam(questions, () => 0.5)).toEqual(result);
    expect(drawExam(questions, () => 0)).not.toEqual(result);
  });
  it('支持自定义数量并按id去重', () => {
    const result = drawExam([...questions, questions[0]], () => 0, { single: 3, judge: 2 });
    expect(result.map(q => q.type)).toEqual(['single', 'single', 'single', 'judge', 'judge']);
    expect(new Set(result.map(q => q.id)).size).toBe(5);
  });
  it('任意题型不足时抛错', () => {
    expect(() => drawExam(questions.filter(q => q.type === 'judge'))).toThrow('单选题数量不足');
    expect(() => drawExam(questions.filter(q => q.type === 'single'))).toThrow('判断题数量不足');
    expect(() => drawExam(Array(50).fill(questions[0]))).toThrow();
  });
});

describe('评分', () => {
  const exam = drawExam(questions, () => 0);
  it.each([[0, 100, true], [5, 90, true], [6, 88, false]])('错%d题得%d分', (wrong, score, passed) => {
    const result = scoreExam(exam, exam.map((_, i) => i < wrong ? 1 : 0));
    expect(result).toEqual({ score, correct: 50 - wrong, wrong, unanswered: 0, passed, wrongIds: exam.slice(0, wrong).map(q => q.id) });
  });
  it('null和缺省答案均按未答、答错统计', () => {
    expect(scoreExam(exam, [null, 0])).toEqual({ score: 2, correct: 1, wrong: 49, unanswered: 49, passed: false, wrongIds: exam.filter((_, i) => i !== 1).map(q => q.id) });
    expect(EXAM_DURATION_MS).toBe(2_700_000);
  });
});
