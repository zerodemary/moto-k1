export type WrongBook = Record<string, { streak: number; addedAt: number; wrongCount: number }>;

export function recordAnswer(book: WrongBook, id: string, correct: boolean, now = Date.now()): WrongBook {
  const entry = Object.hasOwnProperty.call(book, id) ? book[id] : undefined;
  if (correct && !entry) return book;
  const next = { ...book };
  if (!correct) {
    Object.defineProperty(next, id, { value: { streak: 0, addedAt: entry?.addedAt ?? now, wrongCount: (entry?.wrongCount ?? 0) + 1 }, enumerable: true, writable: true, configurable: true });
  } else if (entry && entry.streak + 1 >= 2) {
    delete next[id];
  } else if (entry) {
    Object.defineProperty(next, id, { value: { ...entry, streak: entry.streak + 1 }, enumerable: true, writable: true, configurable: true });
  }
  return next;
}
