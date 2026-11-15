import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { downloadCover, validateManifest } from './import-book-covers.mjs';

export async function publishCovers({ state, supabaseUrl, client, apply = false, fetchImpl = fetch, logger = console }) {
  if (state?.version !== 1 || state.supabaseUrl !== supabaseUrl || !Array.isArray(state.entries)) {
    throw new Error('Import state is invalid or belongs to a different Supabase project.');
  }
  const entries = state.entries.filter((entry) => entry.status === 'uploaded');
  if (entries.length) validateManifest({ covers: entries });
  const bucket = client.storage.from('book-covers');
  for (const entry of entries) {
    if (typeof entry.checksum !== 'string' || !/^[a-f0-9]{64}$/.test(entry.checksum) ||
        entry.objectPath !== `${entry.bookId}/${entry.checksum}.webp` ||
        (entry.originalCoverUrl !== null && typeof entry.originalCoverUrl !== 'string') ||
        bucket.getPublicUrl(entry.objectPath).data.publicUrl !== entry.publicUrl) {
      throw new Error(`Invalid uploaded-cover record for ${entry.bookId}.`);
    }
  }
  const result = { published: 0, planned: 0, alreadyPublished: 0, skipped: state.entries.length - entries.length, failed: 0 };
  for (const entry of entries) {
    try {
      const { data: book, error } = await client.from('books').select('id,cover_url').eq('id', entry.bookId).single();
      if (error) throw error;
      if (book.cover_url !== entry.originalCoverUrl && book.cover_url !== entry.publicUrl) {
        throw new Error('Catalog cover changed since import; review before publishing.');
      }
      const image = await downloadCover(entry.publicUrl, fetchImpl);
      if (createHash('sha256').update(image).digest('hex') !== entry.checksum) {
        throw new Error('Public cover content does not match the imported checksum.');
      }
      if (book.cover_url === entry.publicUrl) {
        result.alreadyPublished += 1;
        logger.log(`Already published: ${entry.bookId}`);
        continue;
      }
      if (!apply) {
        result.planned += 1;
        logger.log(`Would publish: ${entry.bookId}`);
        continue;
      }
      let update = client.from('books').update({ cover_url: entry.publicUrl, hosted_cover_url: entry.publicUrl }).eq('id', entry.bookId);
      update = entry.originalCoverUrl === null
        ? update.is('cover_url', null)
        : update.eq('cover_url', entry.originalCoverUrl);
      const { data: updated, error: updateError } = await update.select('id');
      if (updateError) throw updateError;
      if (updated.length !== 1) throw new Error('Catalog cover changed during publication; no URL was replaced.');
      result.published += 1;
      logger.log(`Published: ${entry.bookId}`);
    } catch (error) {
      result.failed += 1;
      logger.error(`Publication failed for ${entry.bookId}: ${error.message}`);
    }
  }
  logger.log(`Finished: ${result.published} published, ${result.planned} planned, ${result.alreadyPublished} already published, ${result.skipped} non-uploaded entries skipped, ${result.failed} failed.`);
  return result;
}

async function main() {
  const [statePath, flag, ...extra] = process.argv.slice(2);
  if (!statePath || (flag && flag !== '--apply') || extra.length) {
    throw new Error('Usage: node pipeline/publish-book-covers.mjs <state.json> [--apply]');
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Set server-only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
  }
  const state = JSON.parse(await readFile(resolve(statePath), 'utf8'));
  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await publishCovers({ state, supabaseUrl, client, apply: flag === '--apply' });
  if (result.failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Cover publication failed: ${error.message}`);
    process.exitCode = 1;
  });
}
