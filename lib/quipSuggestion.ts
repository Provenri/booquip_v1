import type { Book } from './books.ts';

const COMMON_WORDS = new Set(('the and for that this with from are was were have has had not but you your our their they them its into about what when where which who why how can could would should does did just than then also some more most very will all any book books think want make people').split(' '));

function words(text: string): string[] {
  return [...new Set(text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [])].filter((word) => word.length >= 3 && !COMMON_WORDS.has(word));
}

export type QuipBookSuggestion = { bookId: string; matchingTopics: string[] };

export function suggestQuipBook(seed: string, books: readonly Book[]): QuipBookSuggestion | null {
  const seedWords = words(seed);
  if (seedWords.length === 0) return null;
  const ranked = books.map((book) => {
    const keywords = new Set(words((book.keywords ?? []).join(' ')));
    const description = new Set(words(`${book.title} ${book.tagline ?? ''} ${book.note}`));
    const matchingTopics = seedWords.filter((word) => keywords.has(word) || description.has(word));
    const score = matchingTopics.reduce((sum, word) => sum + (keywords.has(word) ? 3 : 1), 0);
    return { bookId: book.id, matchingTopics, score };
  }).filter((candidate) => candidate.score >= 2)
    .sort((left, right) => right.score - left.score || (left.bookId < right.bookId ? -1 : left.bookId > right.bookId ? 1 : 0));
  const best = ranked[0];
  return best ? { bookId: best.bookId, matchingTopics: best.matchingTopics.slice(0, 3) } : null;
}
