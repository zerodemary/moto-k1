import type { WrongBook } from './wrongbook';

export type ExamRecord = { at: number; score: number; passed: boolean; durationMs: number; questionIds: string[]; answers: (number | null)[] };
export type Progress = { version: 1; bankVersion: string; chapterPos: Record<string, number>; answered: Record<string, { choice: number; correct: boolean }>; wrongBook: WrongBook; exams: ExamRecord[] };

export function emptyProgress(bankVersion: string): Progress {
  return { version: 1, bankVersion, chapterPos: {}, answered: {}, wrongBook: {}, exams: [] };
}

const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const integer = (v: unknown): v is number => nonnegative(v) && Number.isInteger(v);
const record = (v: unknown, check: (entry: unknown) => boolean) => object(v) && Object.values(v).every(check);

/** 补全缺省字段；已提供的字段仍需符合结构。 */
export function mergeDefaults(value: Partial<Progress>, bankVersion = ''): Progress {
  if (!object(value)) throw new Error('进度数据格式无效');
  const p = { ...emptyProgress(bankVersion), ...value };
  if (p.version !== 1 || typeof p.bankVersion !== 'string'
    || !record(p.chapterPos, integer)
    || !record(p.answered, e => object(e) && integer(e.choice) && typeof e.correct === 'boolean')
    || !record(p.wrongBook, e => object(e) && integer(e.streak) && e.streak < 2 && nonnegative(e.addedAt) && integer(e.wrongCount) && e.wrongCount > 0)
    || !Array.isArray(p.exams) || !p.exams.every(e => object(e) && nonnegative(e.at) && integer(e.score) && e.score <= 100 && typeof e.passed === 'boolean' && nonnegative(e.durationMs)
      && Array.isArray(e.questionIds) && e.questionIds.every(id => typeof id === 'string')
      && Array.isArray(e.answers) && e.answers.every(a => a === null || integer(a)) && e.answers.length === e.questionIds.length)) {
    throw new Error('进度数据结构无效或版本不支持');
  }
  return p;
}

export function exportProgress(p: Progress): string {
  return JSON.stringify(mergeDefaults(p));
}

export function importProgress(text: string): Progress {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('进度数据不是有效的 JSON'); }
  if (!object(value) || !['version', 'bankVersion', 'chapterPos', 'answered', 'wrongBook', 'exams'].every(key => Object.prototype.hasOwnProperty.call(value, key))) {
    throw new Error('进度数据缺少必要字段');
  }
  return mergeDefaults(value);
}

const STORAGE_KEY = 'moto-k1:progress';
let memory: string | null = null;

export function saveProgress(p: Progress): void {
  const text = exportProgress(p);
  memory = text;
  try { globalThis.localStorage?.setItem(STORAGE_KEY, text); } catch { /* 使用内存回退 */ }
}

export function loadProgress(): Progress {
  let text = memory;
  try { text = globalThis.localStorage?.getItem(STORAGE_KEY) ?? memory; } catch { /* 使用内存回退 */ }
  if (text === null) return emptyProgress('');
  try { return importProgress(text); } catch { return emptyProgress(''); }
}
