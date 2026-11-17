import assert from 'node:assert/strict';
import { test } from 'node:test';
import { quipInputsMatch, quipRefinementStatus } from './quipSelection.ts';

test('draft results become stale when seed, trend context, selected books, stance, or style change', () => {
  const generated = { seed: 'A seed', trendTopicId: null, bookIds: ['a', 'b'], stance: 'neutral', style: 'natural' };
  assert.equal(quipInputsMatch(generated, { ...generated, bookIds: ['b', 'a'] }), true);
  assert.equal(quipInputsMatch(null, generated), false);
  for (const change of [
    { seed: 'A different seed' }, { trendTopicId: 'another-trend' },
    { bookIds: ['a'] }, { bookIds: ['a', 'b', 'c'] }, { bookIds: ['a', 'c'] }, { bookIds: ['a', 'a'] },
    { stance: 'cons' }, { style: 'witty' },
  ]) {
    assert.equal(quipInputsMatch(generated, { ...generated, ...change }), false);
  }
});

test('a generated draft becomes stale when switching from one selected book to another', () => {
  const generated = { seed: 'A seed', trendTopicId: null, bookIds: ['book-a'], stance: 'neutral', style: 'natural' };
  assert.equal(quipInputsMatch(generated, { ...generated, bookIds: ['book-b'] }), false);
});

test('refinement requires a matching eligible shelf book and protects an existing thought', () => {
  const variant = { book_id: 'a', reply: 'A ready-made Quip' };
  assert.equal(quipRefinementStatus('', variant, 'a', true), 'ready');
  assert.equal(quipRefinementStatus(variant.reply, variant, 'a', true), 'ready');
  assert.equal(quipRefinementStatus('My existing thought', variant, 'a', true), 'confirm');
  assert.equal(quipRefinementStatus('', variant, 'a', false), 'unavailable');
  assert.equal(quipRefinementStatus('', variant, 'b', true), 'unavailable');
  assert.equal(quipRefinementStatus('', { ...variant, reply: ' ' }, 'a', true), 'unavailable');
});
