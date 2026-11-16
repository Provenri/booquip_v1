import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QUIP_STANCES, SINGLE_BOOK_QUIP_STYLES } from '../supabase/functions/_shared/quip.ts';
import { QUIP_CACHE_PROMPT_VERSION } from '../supabase/functions/_shared/quipCache.ts';
import {
  buildQuipCacheRows,
  generateQuipCache,
  hasCompleteCurrentQuipCache,
  quipCacheSourceHash,
  requestQuipCache,
} from './generate-quip-cache.mjs';

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

function fakeClient(existingRows = []) {
  const saved = [];
  return {
    saved,
    from(table) {
      assert.equal(table, 'quip_book_drafts');
      return {
        select() {
          return {
            eq() {
              return Promise.resolve({ data: existingRows, error: null });
            },
          };
        },
        async upsert(rows, options) {
          assert.equal(options.onConflict, 'book_id,stance,style');
          saved.push(...rows);
          return { error: null };
        },
      };
    },
  };
}

function mockedFetch(content = generated) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return Response.json({
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }],
    });
  };
  return { calls, fetchImpl };
}

test('one API request returns one grounded topic and all validated variants', async () => {
  const { calls, fetchImpl } = mockedFetch();
  const result = await requestQuipCache(book, { apiKey: 'test-key', model: 'test-model', fetchImpl });
  assert.deepEqual(result, generated);
  assert.equal(calls.length, 1);
  const request = JSON.parse(calls[0].init.body);
  assert.equal(request.model, 'test-model');
  assert.deepEqual(request.response_format, { type: 'json_object' });
  assert.deepEqual(JSON.parse(request.messages[1].content), {
    title: book.title, author: book.author, shortTake: book.note,
  });
  assert.match(calls[0].init.headers.Authorization, /^Bearer test-key$/);
});

test('cache generation skips current books and upserts complete output for stale entries', async () => {
  const rows = buildQuipCacheRows(book, generated, 'test-model', '2026-11-16T00:00:00.000Z');
  const client = fakeClient(rows);
  const unusedFetch = async () => { throw new Error('Current cache must skip inference.'); };
  const skipped = await generateQuipCache({
    books: [book], client, apiKey: 'test-key', model: 'test-model', fetchImpl: unusedFetch,
    logger: { log() {}, error() {} },
  });
  assert.deepEqual(skipped, { books: 1, generated: 0, skipped: 1, failed: 0 });
  assert.equal(client.saved.length, 0);

  const staleClient = fakeClient(rows.map((row) => ({ ...row, prompt_version: 'old' })));
  const { calls, fetchImpl } = mockedFetch();
  const result = await generateQuipCache({
    books: [book], client: staleClient, apiKey: 'test-key', model: 'test-model', fetchImpl,
    logger: { log() {}, error() {} },
  });
  assert.deepEqual(result, { books: 1, generated: 1, skipped: 0, failed: 0 });
  assert.equal(calls.length, 1);
  assert.equal(staleClient.saved.length, 9);
  assert.ok(staleClient.saved.every((row) => row.prompt_version === QUIP_CACHE_PROMPT_VERSION));
});

test('invalid model output leaves existing cache untouched and reports a failure', async () => {
  const incomplete = { ...generated, variants: generated.variants.slice(0, 8) };
  const client = fakeClient();
  const { fetchImpl } = mockedFetch(incomplete);
  const errors = [];
  const result = await generateQuipCache({
    books: [book], client, apiKey: 'test-key', model: 'test-model', fetchImpl,
    logger: { log() {}, error(message) { errors.push(message); } },
  });
  assert.deepEqual(result, { books: 1, generated: 0, skipped: 0, failed: 1 });
  assert.equal(client.saved.length, 0);
  assert.match(errors[0], /invalid Quip cache result/);
});

test('a summary hash changes when the source book summary changes', () => {
  assert.notEqual(quipCacheSourceHash(book), quipCacheSourceHash({ ...book, note: 'New summary.' }));
  assert.equal(hasCompleteCurrentQuipCache([], quipCacheSourceHash(book)), false);
});
