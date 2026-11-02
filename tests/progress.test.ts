import { afterEach, expect, it, vi } from 'vitest';
import { emptyProgress, exportProgress, importProgress, mergeDefaults, loadProgress, saveProgress } from '../src/progress';

const example = () => ({ ...emptyProgress('bank-v1'), chapterPos: { 第一章: 4 }, answered: { a: { choice: 0, correct: false } }, wrongBook: { a: { streak: 1, addedAt: 100, wrongCount: 2 } }, exams: [{ at: 200, score: 90, passed: true, durationMs: 1000, questionIds: ['a', 'b'], answers: [0, null] }] });
afterEach(() => vi.unstubAllGlobals());
it('导出导入完整往返', () => {
  const p = example();
  const imported = importProgress(exportProgress(p));
  expect(imported).toEqual(p);
  expect(imported).not.toBe(p);
});
it('默认状态互相独立，支持补全缺省字段', () => {
  const p = emptyProgress('v1');
  p.chapterPos.a = 1;
  expect(emptyProgress('v1').chapterPos).toEqual({});
  expect(mergeDefaults({ bankVersion: 'v2' })).toEqual(emptyProgress('v2'));
  expect(mergeDefaults({}, 'v3')).toEqual(emptyProgress('v3'));
});
it.each(['bad json', 'null', '[]', '{}', '42', JSON.stringify({ ...example(), version: 2 }), JSON.stringify({ ...example(), bankVersion: 1 }), JSON.stringify({ ...example(), chapterPos: { a: -1 } }), JSON.stringify({ ...example(), answered: { a: { choice: 0, correct: 'yes' } } }), JSON.stringify({ ...example(), wrongBook: { a: { streak: 0 } } }), JSON.stringify({ ...example(), exams: [{}] }), JSON.stringify({ ...example(), exams: [{ ...example().exams[0], answers: [0] }] })])('非法输入抛中文错误: %s', text => {
  expect(() => importProgress(text)).toThrow(/[\u4e00-\u9fff]/);
});
it('无localStorage时在内存保存和加载，返回独立对象', () => {
  vi.stubGlobal('localStorage', undefined);
  const p = example();
  saveProgress(p);
  p.chapterPos.第一章 = 99;
  expect(loadProgress()).toEqual(example());
  loadProgress().chapterPos.第一章 = 99;
  expect(loadProgress()).toEqual(example());
});
it('使用约定存储键，并安全处理损坏的存储', () => {
  const setItem = vi.fn();
  const getItem = vi.fn(() => exportProgress(example()));
  vi.stubGlobal('localStorage', { setItem, getItem });
  saveProgress(example());
  expect(setItem).toHaveBeenCalledWith('moto-k1:progress', exportProgress(example()));
  expect(loadProgress()).toEqual(example());
  expect(getItem).toHaveBeenCalledWith('moto-k1:progress');
  getItem.mockReturnValue('broken');
  expect(loadProgress()).toEqual(emptyProgress(''));
});
it('localStorage访问失败时回退内存', () => {
  vi.stubGlobal('localStorage', { setItem() { throw new Error('禁用'); }, getItem() { throw new Error('禁用'); } });
  saveProgress(example());
  expect(loadProgress()).toEqual(example());
});
