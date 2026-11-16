import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOOK_ON_RAMP_CACHE_VERSION, parseBookOnRamp } from '../supabase/functions/_shared/bookOnRamp.ts';
import { bookOnRampSourceHash, generateBookOnRamps, loadCatalogBooks, requestBookOnRamp } from './generate-book-on-ramps.mjs';

const book = { id: 'book-a', title: 'Book A', author: 'A. Writer', published_year: 2000, note: 'Attention shapes freedom.' };
const reply = 'Attention shapes how we use our freedom. What deserves yours today?';
const logger = { log() {}, error() {} };

function clientWithCache(cache = null, saveError = null) {
  const saved = [];
  return {
    saved,
    from(table) {
      assert.equal(table, 'book_on_ramp_cache');
      return { select() { return { eq() { return { async maybeSingle() { return { data: cache, error: null }; } }; } }; } };
    },
    async rpc(name, payload) {
      assert.equal(name, 'save_book_on_ramp_cache');
      saved.push(payload);
      return { error: saveError };
    },
  };
}

function openAi(content = reply, finishReason = 'stop') {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return Response.json({ choices: [{ finish_reason: finishReason, message: { content } }] });
    },
  };
}

test('one request uses book details and rejects invalid or incomplete model output', async () => {
  const { calls, fetchImpl } = openAi();
  assert.equal(await requestBookOnRamp(book, { apiKey: 'key', model: 'model', fetchImpl }), reply);
  const request = JSON.parse(calls[0].init.body);
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(request.messages[1].content), {
    title: book.title, author: book.author, year: book.published_year, shortTake: book.note,
  });
  assert.throws(() => parseBookOnRamp(' '), /invalid/);
  assert.throws(() => parseBookOnRamp(Array(71).fill('word').join(' ')), /70 words/);
  assert.equal(parseBookOnRamp(Array(70).fill('word').join(' ')).split(' ').length, 70);
  await assert.rejects(requestBookOnRamp(book, { apiKey: 'key', model: 'model', ...openAi(reply, 'length') }), /complete/);
  await assert.rejects(requestBookOnRamp(book, {
    apiKey: 'key', model: 'model', fetchImpl: async () => new Response(null, { status: 401 }),
  }), /HTTP 401/);
});

test('current reads are skipped, stale reads and forced reads are generated', async () => {
  const hash = bookOnRampSourceHash(book);
  const client = clientWithCache({ source_hash: hash, prompt_version: BOOK_ON_RAMP_CACHE_VERSION });
  const api = openAi();
  assert.deepEqual(await generateBookOnRamps({ books: [book], client, apiKey: 'key', model: 'model', ...api, logger }),
    { books: 1, generated: 0, skipped: 1, failed: 0 });
  assert.equal(api.calls.length, 0);
  assert.deepEqual(await generateBookOnRamps({ books: [book], client, apiKey: 'key', model: 'model', force: true, ...api, logger }),
    { books: 1, generated: 1, skipped: 0, failed: 0 });
  assert.equal(client.saved[0].p_source_hash, hash);
  assert.equal(client.saved[0].p_on_ramp, reply);
  assert.equal(client.saved[0].p_published_year, book.published_year);
  const staleClient = clientWithCache({ source_hash: hash, prompt_version: 'old' });
  assert.equal((await generateBookOnRamps({ books: [book], client: staleClient, apiKey: 'key', model: 'model', ...api, logger })).generated, 1);
  assert.notEqual(hash, bookOnRampSourceHash({ ...book, published_year: 2001 }));
});

test('invalid output or concurrent source changes are reported and not counted as saved', async () => {
  const errors = [];
  const reportLogger = { log() {}, error(message) { errors.push(message); } };
  const invalid = clientWithCache();
  assert.equal((await generateBookOnRamps({
    books: [book], client: invalid, apiKey: 'key', model: 'model', ...openAi(''), logger: reportLogger,
  })).failed, 1);
  assert.equal(invalid.saved.length, 0);
  const changed = clientWithCache(null, { message: 'Book source changed during 30-second read generation; retry.' });
  const result = await generateBookOnRamps({ books: [book], client: changed, apiKey: 'key', model: 'model', ...openAi(), logger: reportLogger });
  assert.equal(result.failed, 1);
  assert.equal(result.generated, 0);
  assert.match(errors[1], /source changed/);
});

test('catalog loading pages through more than the API row limit and validates IDs', async () => {
  const all = Array.from({ length: 1101 }, (_, i) => ({ id: String(i).padStart(4, '0') }));
  const client = {
    from(table) {
      assert.equal(table, 'books');
      let count;
      let after = null;
      let ids = null;
      const query = {
        select() { return this; },
        order() { return this; },
        limit(n) { count = n; return this; },
        in(_key, values) { ids = values; return this; },
        gt(_key, value) { after = value; return this; },
        then(resolve) {
          resolve({ data: all.filter((row) => (!after || row.id > after) && (!ids || ids.includes(row.id))).slice(0, Math.min(count, 100)), error: null });
        },
      };
      return query;
    },
  };
  assert.equal((await loadCatalogBooks(client)).length, 1101);
  assert.equal((await loadCatalogBooks(client, { limit: 3 })).length, 3);
  await assert.rejects(loadCatalogBooks(client, { bookIds: ['missing'] }), /not found/);
});
