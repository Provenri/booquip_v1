import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { downloadCover } from '../supabase/functions/_shared/bookCoverDownload.ts';

export { downloadCover };

const BUCKET = 'book-covers';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function validateManifest(manifest) {
  if (!Array.isArray(manifest?.covers) || manifest.covers.length === 0) {
    throw new Error('Manifest must contain a non-empty covers array.');
  }
  const ids = new Set();
  for (const cover of manifest.covers) {
    if (!cover || typeof cover.bookId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(cover.bookId)) {
      throw new Error('Each cover must have a valid catalog bookId.');
    }
    if (ids.has(cover.bookId)) throw new Error(`Duplicate bookId: ${cover.bookId}`);
    ids.add(cover.bookId);
    if (cover.approvedForRehosting !== true || typeof cover.permissionReference !== 'string' || !cover.permissionReference.trim()) {
      throw new Error(`Rehosting approval and a permissionReference are required for ${cover.bookId}.`);
    }
    const url = new URL(cover.sourceUrl);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
      throw new Error(`An HTTPS source URL without credentials is required for ${cover.bookId}.`);
    }
  }
  return manifest.covers;
}

export async function optimizeCover(input) {
  const image = sharp(input, { limitInputPixels: 40_000_000, failOn: 'warning' });
  const metadata = await image.metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages ?? 1) !== 1) {
    throw new Error('Cover must be a single-frame JPEG, PNG, or WebP image.');
  }
  const output = await image.rotate()
    .resize({ width: 800, height: 1200, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  if (output.length > MAX_UPLOAD_BYTES) throw new Error('Optimized cover exceeds the bucket limit of 5 MiB.');
  return output;
}

async function saveState(statePath, state) {
  await mkdir(dirname(statePath), { recursive: true });
  const temporaryPath = `${statePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, statePath);
}

async function objectExists(bucket, objectPath) {
  const separator = objectPath.lastIndexOf('/');
  const filename = objectPath.slice(separator + 1);
  const { data, error } = await bucket.list(objectPath.slice(0, separator), { search: filename, limit: 2 });
  if (error) throw error;
  return data.some((object) => object.name === filename);
}

export async function importCovers({ manifest, statePath, supabaseUrl, client, fetchImpl = fetch, logger = console }) {
  const covers = validateManifest(manifest);
  let state;
  try {
    state = JSON.parse(await readFile(statePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    state = { version: 1, supabaseUrl, entries: [] };
  }
  if (state.version !== 1 || state.supabaseUrl !== supabaseUrl || !Array.isArray(state.entries)) {
    throw new Error('Import state is invalid or belongs to a different Supabase project.');
  }
  const bucket = client.storage.from(BUCKET);
  let failed = 0;
  let uploaded = 0;
  let skipped = 0;
  for (const cover of covers) {
    let entry = { ...cover };
    try {
      const { data: book, error } = await client.from('books').select('id,cover_url').eq('id', cover.bookId).single();
      if (error) throw error;
      const previous = state.entries.find((item) => item.bookId === cover.bookId);
      if (previous?.status === 'uploaded' &&
          previous.sourceUrl === cover.sourceUrl &&
          previous.permissionReference === cover.permissionReference &&
          await objectExists(bucket, previous.objectPath)) {
        skipped += 1;
        logger.log(`Already imported: ${cover.bookId}`);
        continue;
      }
      const image = await optimizeCover(await downloadCover(cover.sourceUrl, fetchImpl));
      const checksum = createHash('sha256').update(image).digest('hex');
      const objectPath = `${cover.bookId}/${checksum}.webp`;
      if (!await objectExists(bucket, objectPath)) {
        const { error: uploadError } = await bucket.upload(objectPath, image, {
          contentType: 'image/webp',
          cacheControl: '31536000',
          upsert: false,
        });
        if (uploadError) throw uploadError;
      }
      entry = {
        ...cover,
        status: 'uploaded',
        originalCoverUrl: book.cover_url,
        objectPath,
        publicUrl: bucket.getPublicUrl(objectPath).data.publicUrl,
        checksum,
        bytes: image.length,
        importedAt: new Date().toISOString(),
      };
      uploaded += 1;
      logger.log(`Imported: ${cover.bookId}`);
    } catch (error) {
      failed += 1;
      entry = { ...cover, status: 'failed', error: error.message, attemptedAt: new Date().toISOString() };
      logger.error(`Import failed for ${cover.bookId}: ${error.message}`);
    }
    state.entries = [...state.entries.filter((item) => item.bookId !== cover.bookId), entry];
    await saveState(statePath, state);
  }
  logger.log(`Finished: ${uploaded} imported, ${skipped} already present, ${failed} failed.`);
  return { uploaded, skipped, failed };
}

async function main() {
  const [manifestPath, requestedStatePath, ...extra] = process.argv.slice(2);
  if (!manifestPath || extra.length) {
    throw new Error('Usage: node pipeline/import-book-covers.mjs <approved-manifest.json> [state.json]');
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Set server-only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
  }
  const statePath = resolve(requestedStatePath ?? 'pipeline/.cover-import/results.json');
  if (statePath === resolve(manifestPath)) throw new Error('Manifest and state must use different files.');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await importCovers({ manifest, statePath, supabaseUrl, client });
  if (result.failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Cover import failed: ${error.message}`);
    process.exitCode = 1;
  });
}
