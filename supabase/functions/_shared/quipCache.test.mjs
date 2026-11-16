import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QUIP_STANCES, SINGLE_BOOK_QUIP_STYLES } from './quip.ts';
import {
  buildQuipCachePrompt,
  parseGeneratedQuipCache,
  QUIP_CACHE_PROMPT_VERSION,
  QUIP_CACHE_VARIANT_COUNT,
} from './quipCache.ts';
import {
  buildQuipCacheRows,
  hasCompleteCurrentQuipCache,
  quipCacheSourceHash,
} from '../../../pipeline/generate-quip-cache.mjs';

const book = { id: 'book-1', title: 'The Book', author: 'A. Writer', note: 'Attention shapes freedom and shared life.' };
const generated = {
  topic: 'Attention shapes freedom',
  topicReason: 'The summary directly connects attention with freedom.',
  variants: QUIP_STANCES.flatMap((stance) => SINGLE_BOOK_QUIP_STYLES.map((style) => ({
    stance: stance.id,
    style: style.id,
    reply: `${stance.id} ${style.id}: attention has a real effect.`,
  }))),
};

test('cache generation requires all nine distinct stance/style combinations', () => {
  assert.equal(QUIP_CACHE_VARIANT_COUNT, 9);
  assert.deepEqual(parseGeneratedQuipCache(generated), generated);
  assert.match(buildQuipCachePrompt(), /same chosen topic must underlie every variant/);
  assert.match(buildQuipCachePrompt(), /exactly one open-ended question/);
  assert.match(buildQuipCachePrompt(), /gentle, unmistakably playful/);

  for (const variants of [
    generated.variants.slice(0, 8),
    [...generated.variants, generated.variants[0]],
    generated.variants.map((variant, index) => index === 8 ? { ...variant, style: 'reflective' } : variant),
    generated.variants.map((variant, index) => index === 8 ? { ...variant, reply: 'x'.repeat(281) } : variant),
  ]) {
    assert.throws(() => parseGeneratedQuipCache({ ...generated, variants }));
  }
});

test('cache rows share their topic, carry versioned source hashes, and skip only complete current matrices', () => {
  const rows = buildQuipCacheRows(book, generated, 'test-model', '2026-11-16T00:00:00.000Z');
  const hash = quipCacheSourceHash(book);
  assert.equal(rows.length, 9);
  assert.ok(rows.every((row) => row.topic === generated.topic && row.topic_reason === generated.topicReason));
  assert.ok(rows.every((row) => row.source_hash === hash && row.prompt_version === QUIP_CACHE_PROMPT_VERSION));
  assert.equal(hasCompleteCurrentQuipCache(rows, hash), true);
  assert.equal(hasCompleteCurrentQuipCache(rows.slice(1), hash), false);
  assert.equal(hasCompleteCurrentQuipCache(rows, '0'.repeat(64)), false);
  assert.equal(hasCompleteCurrentQuipCache(rows.map((row) => ({ ...row, prompt_version: 'old' })), hash), false);
  assert.notEqual(hash, quipCacheSourceHash({ ...book, note: 'Updated synopsis.' }));
});
