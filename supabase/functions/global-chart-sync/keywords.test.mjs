import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { validKeywords } from './keywords.ts';

test('accepts three distinct concise keywords and trims them', () => {
  assert.deepEqual(validKeywords([' Courage ', 'Moral choice', 'History']), ['Courage', 'Moral choice', 'History']);
});

test('rejects missing, duplicate, malformed and oversized keywords', () => {
  assert.equal(validKeywords(['History', 'Courage']), null);
  assert.equal(validKeywords(['History', 'history', 'Courage']), null);
  assert.equal(validKeywords(['#History', 'Courage', 'War']), null);
  assert.equal(validKeywords(['a'.repeat(33), 'Courage', 'War']), null);
});
