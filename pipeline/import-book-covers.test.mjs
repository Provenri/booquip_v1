import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { downloadCover, importCovers, optimizeCover, validateManifest } from './import-book-covers.mjs';

const approvedCover = {
  bookId: 'test-book',
  sourceUrl: 'https://approved.example/cover.png',
  approvedForRehosting: true,
  permissionReference: 'Test fixture: generated image',
};
const fixture = await sharp({
  create: { width: 40, height: 60, channels: 3, background: '#34755e' },
}).png().toBuffer();

async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'booquip-cover-import-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const objects = new Map();
  const uploads = [];
  const logs = [];
  const bucket = {
    async list(folder, { search }) {
      return {
        data: [...objects.keys()].filter((path) => path === `${folder}/${search}`).map(() => ({ name: search })),
        error: null,
      };
    },
    async upload(path, image, options) {
      uploads.push({ path, image, options });
      objects.set(path, image);
      return { error: null };
    },
    getPublicUrl(path) {
      return { data: { publicUrl: `https://project.example/storage/v1/object/public/book-covers/${path}` } };
    },
  };
  const client = {
    storage: { from: (name) => { assert.equal(name, 'book-covers'); return bucket; } },
    from(name) {
      assert.equal(name, 'books');
      return {
        select: () => ({
          eq: (_column, id) => ({
            single: async () => ({ data: { id, cover_url: 'https://original.example/cover.jpg' }, error: null }),
          }),
        }),
      };
    },
  };
  const options = {
    manifest: { covers: [approvedCover] },
    statePath: join(directory, 'state.json'),
    supabaseUrl: 'https://project.example',
    client,
    fetchImpl: async () => new Response(fixture, { headers: { 'content-type': 'image/png' } }),
    logger: { log: (message) => logs.push(message), error: (message) => logs.push(message) },
  };
  return { options, objects, uploads, bucket, logs };
}

test('requires approval for every image and rejects duplicate books and unsafe URL schemes', () => {
  for (const patch of [
    { approvedForRehosting: false },
    { permissionReference: '' },
    { sourceUrl: 'http://approved.example/image.jpg' },
    { sourceUrl: 'https://user:password@approved.example/image.jpg' },
    { bookId: '../outside' },
  ]) {
    assert.throws(() => validateManifest({ covers: [{ ...approvedCover, ...patch }] }));
  }
  assert.throws(() => validateManifest({ covers: [approvedCover, approvedCover] }), /Duplicate/);
  assert.throws(() => validateManifest({ covers: [] }), /non-empty/);
});

test('optimizes large covers to WebP and does not enlarge small ones', async () => {
  const large = await sharp({
    create: { width: 1600, height: 2400, channels: 3, background: '#34755e' },
  }).png().toBuffer();
  const metadata = await sharp(await optimizeCover(large)).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 800);
  assert.equal(metadata.height, 1200);
  const small = await sharp(await optimizeCover(fixture)).metadata();
  assert.equal(small.width, 40);
  assert.equal(small.height, 60);
  await assert.rejects(optimizeCover(Buffer.from('not an image')));
});

test('rejects failed, non-image, and oversized downloads, including streamed bodies', async () => {
  await assert.rejects(downloadCover(approvedCover.sourceUrl, async () => new Response('', { status: 403 })), /403/);
  await assert.rejects(downloadCover(approvedCover.sourceUrl, async () => new Response('<html>error</html>')), /JPEG/);
  await assert.rejects(downloadCover(approvedCover.sourceUrl, async () => new Response('', {
    headers: { 'content-type': 'image/png', 'content-length': String(11 * 1024 * 1024) },
  })), /10 MiB/);
  await assert.rejects(downloadCover(approvedCover.sourceUrl, async (_url, options) => {
    assert.equal(options.redirect, 'error');
    return new Response(new Uint8Array(10 * 1024 * 1024 + 1), { headers: { 'content-type': 'image/png' } });
  }), /10 MiB/);
});

test('imports with provenance and resumes without downloading or overwriting', async (t) => {
  const { options, uploads, objects } = await setup(t);
  assert.deepEqual(await importCovers(options), { uploaded: 1, skipped: 0, failed: 0 });
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].options.upsert, false);
  assert.match(uploads[0].path, /^test-book\/[a-f0-9]{64}\.webp$/);
  const state = JSON.parse(await readFile(options.statePath, 'utf8'));
  assert.equal(state.entries[0].originalCoverUrl, 'https://original.example/cover.jpg');
  assert.equal(state.entries[0].sourceUrl, approvedCover.sourceUrl);
  assert.equal(state.entries[0].permissionReference, approvedCover.permissionReference);
  assert.equal(state.entries[0].status, 'uploaded');
  const resumed = { ...options, fetchImpl: () => assert.fail('Completed covers must not be downloaded again') };
  assert.deepEqual(await importCovers(resumed), { uploaded: 0, skipped: 1, failed: 0 });
  objects.clear();
  assert.deepEqual(await importCovers(options), { uploaded: 1, skipped: 0, failed: 0 });
  assert.equal(uploads.length, 2);
  await assert.rejects(importCovers({ ...options, supabaseUrl: 'https://another-project.example' }), /different Supabase/);
});

test('reports failures, continues other books, and retries failed records', async (t) => {
  const { options, logs } = await setup(t);
  options.manifest.covers.push({ ...approvedCover, bookId: 'second-book', sourceUrl: 'https://approved.example/second.png' });
  const result = await importCovers({
    ...options,
    fetchImpl: async (url) => url === approvedCover.sourceUrl
      ? new Response('', { status: 503 })
      : options.fetchImpl(url),
  });
  assert.deepEqual(result, { uploaded: 1, skipped: 0, failed: 1 });
  assert.ok(logs.some((message) => message.includes('Import failed for test-book')));
  const state = JSON.parse(await readFile(options.statePath, 'utf8'));
  assert.equal(state.entries.find((entry) => entry.bookId === 'test-book').status, 'failed');
  assert.deepEqual(await importCovers(options), { uploaded: 1, skipped: 1, failed: 0 });
});

test('does not report storage failures as successful uploads', async (t) => {
  const { options, bucket } = await setup(t);
  bucket.upload = async () => ({ error: new Error('Storage unavailable') });
  assert.deepEqual(await importCovers(options), { uploaded: 0, skipped: 0, failed: 1 });
  const state = JSON.parse(await readFile(options.statePath, 'utf8'));
  assert.equal(state.entries[0].status, 'failed');
  assert.equal(state.entries[0].error, 'Storage unavailable');
});

test('replacement covers get new cacheable paths while existing cover objects remain intact', async (t) => {
  const { options, objects, uploads } = await setup(t);
  assert.equal((await importCovers(options)).uploaded, 1);
  const originalPath = uploads[0].path;
  const originalBytes = objects.get(originalPath);
  const replacement = await sharp({
    create: { width: 40, height: 60, channels: 3, background: '#8a634a' },
  }).png().toBuffer();
  options.manifest.covers = [{ ...approvedCover, sourceUrl: 'https://approved.example/replacement.png' }];
  const result = await importCovers({
    ...options,
    fetchImpl: async () => new Response(replacement, { headers: { 'content-type': 'image/png' } }),
  });
  assert.equal(result.uploaded, 1);
  assert.notEqual(uploads[1].path, originalPath);
  assert.equal(objects.size, 2);
  assert.deepEqual(objects.get(originalPath), originalBytes);
  const state = JSON.parse(await readFile(options.statePath, 'utf8'));
  assert.ok(state.entries[0].publicUrl.endsWith(uploads[1].path));
});
