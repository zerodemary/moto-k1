import { expect, it } from 'vitest';
import { recordAnswer } from '../src/wrongbook';

it('答错收录，连续答对两次移出，更新不可变', () => {
  const initial = {};
  const first = recordAnswer(initial, 'a', false, 100);
  expect(first).toEqual({ a: { streak: 0, addedAt: 100, wrongCount: 1 } });
  const second = recordAnswer(first, 'a', true);
  expect(second.a.streak).toBe(1);
  expect(recordAnswer(second, 'a', true)).toEqual({});
  expect(initial).toEqual({});
  expect(first.a.streak).toBe(0);
  expect(second.a.streak).toBe(1);
});
it('再次答错重置streak，累加次数，保留收录时间', () => {
  const book = recordAnswer(recordAnswer({}, 'a', false, 100), 'a', true);
  expect(recordAnswer(book, 'a', false, 200)).toEqual({ a: { streak: 0, addedAt: 100, wrongCount: 2 } });
  expect(book.a).toEqual({ streak: 1, addedAt: 100, wrongCount: 1 });
  expect(recordAnswer(book, 'b', true)).toBe(book);
});
it('支持与对象原型属性同名的题目id', () => {
  const book = recordAnswer({}, '__proto__', false, 1);
  expect(Object.keys(book)).toEqual(['__proto__']);
  expect(recordAnswer(recordAnswer(book, '__proto__', true), '__proto__', true)).toEqual({});
});
