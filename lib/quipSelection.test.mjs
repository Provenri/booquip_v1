import assert from 'node:assert/strict';
import { test } from 'node:test';
import { quipInputsMatch, reconcileQuipSelection } from './quipSelection.ts';

test('refresh preserves deselected books, drops removed sources, and selects newly available sources', () => {
  assert.deepEqual(reconcileQuipSelection(['a', 'c'], ['a', 'b', 'c'], ['a', 'b', 'd']), ['a', 'd']);
  assert.deepEqual(reconcileQuipSelection([], ['a', 'b'], ['a', 'b']), []);
  assert.deepEqual(reconcileQuipSelection(['a'], ['a'], []), []);
});

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
