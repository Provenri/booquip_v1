import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import sharp from 'sharp';
import { publishCovers } from './publish-book-covers.mjs';

const image = await sharp({
  create: { width: 20, height: 30, channels: 3, background: '#34755e' },
}).webp().toBuffer();
const checksum = createHash('sha256').update(image).digest('hex');
const supabaseUrl = 'https://project.example';

function setup(originalCoverUrl = 'https://original.example/cover.jpg') {
  const objectPath = `test-book/${checksum}.webp`;
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/book-covers/${objectPath}`;
  const entry = {
    bookId: 'test-book',
    sourceUrl: 'https://approved.example/cover.png',
    approvedForRehosting: true,
    permissionReference: 'Test fixture: generated image',
    status: 'uploaded',
    objectPath,
    publicUrl,
    originalCoverUrl,
    checksum,
  };
  const books = new Map([['test-book', originalCoverUrl]]);
  const writes = [];
  const controls = { beforeWrite: () => {}, updateError: null };
  const logs = [];
  const client = {
    storage: {
      from(name) {
        assert.equal(name, 'book-covers');
        return { getPublicUrl: (path) => ({ data: { publicUrl: `${supabaseUrl}/storage/v1/object/public/book-covers/${path}` } }) };
      },
    },
    from(name) {
      assert.equal(name, 'books');
      return {
        select: () => ({
          eq: (_column, id) => ({
            single: async () => ({ data: { id, cover_url: books.get(id) }, error: null }),
          }),
        }),
        update(values) {
          const filters = new Map();
          const query = {
            eq(column, value) { filters.set(column, value); return query; },
            is(column, value) { assert.equal(value, null); filters.set(column, value); return query; },
            async select() {
              controls.beforeWrite();
              if (controls.updateError) return { data: null, error: controls.updateError };
              const id = filters.get('id');
              if (books.get(id) !== filters.get('cover_url')) return { data: [], error: null };
              assert.deepEqual(Object.keys(values), ['cover_url', 'hosted_cover_url']);
              assert.equal(values.hosted_cover_url, values.cover_url);
              writes.push({ id, ...values });
              books.set(id, values.cover_url);
              return { data: [{ id }], error: null };
            },
          };
          return query;
        },
      };
    },
  };
  const options = {
    state: { version: 1, supabaseUrl, entries: [entry] },
    supabaseUrl,
    client,
    fetchImpl: async (url) => {
      assert.equal(url, publicUrl);
      return new Response(image, { headers: { 'content-type': 'image/webp' } });
    },
    logger: { log: (message) => logs.push(message), error: (message) => logs.push(message) },
  };
  return { options, entry, books, writes, controls, logs };
}

test('previews without writes and publishes verified covers idempotently', async () => {
  const { options, entry, books, writes } = setup();
  assert.equal((await publishCovers(options)).planned, 1);
  assert.equal(writes.length, 0);
  assert.equal((await publishCovers({ ...options, apply: true })).published, 1);
  assert.equal(books.get(entry.bookId), entry.publicUrl);
  assert.equal((await publishCovers({ ...options, apply: true })).alreadyPublished, 1);
  assert.equal(writes.length, 1);
  assert.equal(entry.originalCoverUrl, 'https://original.example/cover.jpg');
});

test('publishes books with no previous cover URL', async () => {
  const { options, entry, books } = setup(null);
  assert.equal((await publishCovers({ ...options, apply: true })).published, 1);
  assert.equal(books.get(entry.bookId), entry.publicUrl);
});

test('rejects wrong projects, invalid approvals, and altered Storage paths or URLs before publication', async () => {
  const { options, entry, writes } = setup();
  await assert.rejects(publishCovers({ ...options, supabaseUrl: 'https://another.example' }), /different Supabase/);
  for (const patch of [
    { approvedForRehosting: false },
    { permissionReference: '' },
    { publicUrl: 'https://unrelated.example/image.webp' },
    { objectPath: 'another-book/image.webp' },
    { originalCoverUrl: undefined },
  ]) {
    await assert.rejects(publishCovers({
      ...options,
      apply: true,
      state: { ...options.state, entries: [{ ...entry, ...patch }] },
    }));
  }
  assert.equal(writes.length, 0);
});

test('leaves URLs unchanged for failed imports, missing objects, and mismatched contents', async () => {
  const { options, entry, books, writes } = setup();
  const skipped = await publishCovers({
    ...options,
    apply: true,
    state: { ...options.state, entries: [{ ...entry, status: 'failed' }] },
    fetchImpl: () => assert.fail('Failed imports must not be fetched'),
  });
  assert.equal(skipped.skipped, 1);
  for (const response of [
    new Response('', { status: 404 }),
    new Response('different content', { headers: { 'content-type': 'image/webp' } }),
  ]) {
    const result = await publishCovers({ ...options, apply: true, fetchImpl: async () => response });
    assert.equal(result.failed, 1);
  }
  assert.equal(writes.length, 0);
  assert.equal(books.get(entry.bookId), entry.originalCoverUrl);
});

test('does not overwrite covers changed before or during publication', async () => {
  const { options, entry, books, writes, controls } = setup();
  books.set(entry.bookId, 'https://new.example/cover.jpg');
  assert.equal((await publishCovers({ ...options, apply: true })).failed, 1);
  books.set(entry.bookId, entry.originalCoverUrl);
  controls.beforeWrite = () => books.set(entry.bookId, 'https://concurrent.example/cover.jpg');
  assert.equal((await publishCovers({ ...options, apply: true })).failed, 1);
  assert.equal(writes.length, 0);
  assert.equal(books.get(entry.bookId), 'https://concurrent.example/cover.jpg');
});

test('reports database errors and continues publishing other eligible books', async () => {
  const { options, entry, books, controls, logs } = setup();
  const second = { ...entry, bookId: 'second-book', objectPath: `second-book/${checksum}.webp` };
  second.publicUrl = `${supabaseUrl}/storage/v1/object/public/book-covers/${second.objectPath}`;
  options.state.entries.push(second);
  books.set(second.bookId, second.originalCoverUrl);
  let attempts = 0;
  controls.beforeWrite = () => {
    attempts += 1;
    controls.updateError = attempts === 1 ? new Error('Database unavailable') : null;
  };
  const result = await publishCovers({
    ...options,
    apply: true,
    fetchImpl: async () => new Response(image, { headers: { 'content-type': 'image/webp' } }),
  });
  assert.equal(result.failed, 1);
  assert.equal(result.published, 1);
  assert.ok(logs.some((message) => message.includes('Database unavailable')));
});
