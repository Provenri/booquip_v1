import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { findNextBook } from './bookQueue.ts';

test('advances through the available books and wraps around', () => {
  const books = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(findNextBook(books, 'a'), books[1]);
  assert.equal(findNextBook(books, 'c'), books[0]);
});

test('does not repeat the only available book', () => {
  assert.equal(findNextBook([], 'a'), undefined);
  assert.equal(findNextBook([{ id: 'a' }], 'a'), undefined);
});

test('chooses an available book if the current selection disappeared', () => {
  const books = [{ id: 'b' }];
  assert.equal(findNextBook(books, 'a'), books[0]);
});
