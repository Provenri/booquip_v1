import assert from 'node:assert/strict';
import { test } from 'node:test';
import { suggestQuipBook } from './quipSuggestion.ts';

const books = [
  { id: 'control', title: 'State Power', note: 'Surveillance shapes freedom and memory.', keywords: ['surveillance', 'social control'] },
  { id: 'focus', title: 'Focused Work', tagline: 'Attention over busyness', note: 'Deep attention makes meaningful progress possible.' },
];

test('a meaningful keyword match suggests one book and reports only matching words', () => {
  assert.deepEqual(suggestQuipBook('What does SURVEILLANCE cost us?', books), {
    bookId: 'control', matchingTopics: ['surveillance'],
  });
  assert.deepEqual(suggestQuipBook('Can focused attention improve work?', books), {
    bookId: 'focus', matchingTopics: ['focused', 'attention', 'work'],
  });
});

test('empty seeds, common words, weak description matches, and unrelated seeds have no clear match', () => {
  for (const seed of ['', '   ', 'What should people think about this book?', 'Memory', 'Ocean currents']) {
    assert.equal(suggestQuipBook(seed, books), null, seed);
  }
  assert.equal(suggestQuipBook('surveillance', []), null);
});

test('strong keyword evidence outranks description overlap and ties are independent of shelf order', () => {
  const candidates = [
    { id: 'z', title: 'Other', note: 'Social control through surveillance.' },
    ...books,
    { ...books[0], id: 'a' },
  ];
  assert.equal(suggestQuipBook('social control surveillance', candidates)?.bookId, 'a');
  assert.deepEqual(suggestQuipBook('social control surveillance', candidates),
    suggestQuipBook('social control surveillance', [...candidates].reverse()));
  assert.equal(suggestQuipBook('surveillance', [books[1]]), null);
});

test('matching tolerates accents and punctuation without changing catalog data', () => {
  const book = { id: 'ethics', title: 'Ethics', note: '', keywords: ['café culture'] };
  assert.deepEqual(suggestQuipBook('CAFE culture?', [book]), {
    bookId: 'ethics', matchingTopics: ['cafe', 'culture'],
  });
  assert.deepEqual(book.keywords, ['café culture']);
});
