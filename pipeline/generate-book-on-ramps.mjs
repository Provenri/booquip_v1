import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { BOOK_ON_RAMP_CACHE_VERSION, BOOK_ON_RAMP_PROMPT, parseBookOnRamp } from '../supabase/functions/_shared/bookOnRamp.ts';

export function bookOnRampSourceHash(book) {
  return createHash('sha256').update(JSON.stringify({
    id: book.id, title: book.title, author: book.author, year: book.published_year, note: book.note,
  })).digest('hex');
}

export async function requestBookOnRamp(book, { apiKey, model, fetchImpl = fetch }) {
  const response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.6,
      max_tokens: 120,
      messages: [
        { role: 'system', content: BOOK_ON_RAMP_PROMPT },
        { role: 'user', content: JSON.stringify({
          title: book.title, author: book.author, year: book.published_year, shortTake: book.note,
        }) },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`OpenAI returned HTTP ${response.status}.`);
  const result = await response.json();
  const choice = result.choices?.[0];
  if (choice?.finish_reason !== 'stop') throw new Error('OpenAI did not return a complete 30-second read.');
  return parseBookOnRamp(choice.message?.content);
}

export async function generateBookOnRamps({ books, client, apiKey, model, force = false, fetchImpl = fetch, logger = console }) {
  const report = { books: books.length, generated: 0, skipped: 0, failed: 0 };
  for (const book of books) {
    try {
      const sourceHash = bookOnRampSourceHash(book);
      if (!force) {
        const { data, error } = await client.from('book_on_ramp_cache')
          .select('source_hash,prompt_version').eq('book_id', book.id).maybeSingle();
        if (error) throw error;
        if (data?.source_hash === sourceHash && data.prompt_version === BOOK_ON_RAMP_CACHE_VERSION) {
          report.skipped += 1;
          logger.log(`Current 30-second read exists: ${book.id}`);
          continue;
        }
      }
      const onRamp = await requestBookOnRamp(book, { apiKey, model, fetchImpl });
      const { error } = await client.rpc('save_book_on_ramp_cache', {
        p_book_id: book.id, p_title: book.title, p_author: book.author,
        p_published_year: book.published_year, p_note: book.note,
        p_on_ramp: onRamp, p_source_hash: sourceHash,
        p_prompt_version: BOOK_ON_RAMP_CACHE_VERSION, p_model: model,
      });
      if (error) throw error;
      report.generated += 1;
      logger.log(`Generated 30-second read: ${book.id}`);
    } catch (error) {
      report.failed += 1;
      const message = error && typeof error.message === 'string' ? error.message : 'Unknown error.';
      logger.error(`30-second read generation failed for ${book.id}: ${message}`);
    }
  }
  return report;
}

export async function loadCatalogBooks(client, { bookIds = [], limit = null } = {}) {
  const books = [];
  const pageSize = 500;
  let lastId = null;
  while (limit === null || books.length < limit) {
    const count = limit === null ? pageSize : Math.min(pageSize, limit - books.length);
    let query = client.from('books').select('id,title,author,published_year,note')
      .order('id', { ascending: true }).limit(count);
    if (bookIds.length) query = query.in('id', bookIds);
    if (lastId !== null) query = query.gt('id', lastId);
    const { data, error } = await query;
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('The catalog returned an invalid response.');
    books.push(...data);
    if (data.length === 0) break;
    lastId = data[data.length - 1].id;
  }
  if (bookIds.length && books.length !== new Set(bookIds).size) {
    throw new Error('One or more requested catalog books were not found.');
  }
  return books;
}

function parseArgs(args) {
  const options = { bookIds: [], limit: null, force: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--force') options.force = true;
    else if (arg === '--book-id' && args[index + 1] && !args[index + 1].startsWith('--')) options.bookIds.push(args[++index]);
    else if (arg === '--limit' && args[index + 1]) {
      options.limit = Number(args[++index]);
      if (!Number.isInteger(options.limit) || options.limit < 1) throw new Error('--limit must be a positive integer.');
    } else throw new Error('Usage: npm run onramp:cache -- [--book-id <id>]... [--limit <count>] [--force]');
  }
  if (options.bookIds.length && options.limit !== null) throw new Error('Use either --book-id or --limit, not both.');
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_BOOK_ON_RAMP_MODEL || 'gpt-4o-mini';
  if (!supabaseUrl || !serviceRoleKey || !apiKey) {
    throw new Error('Set server-only SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and OPENAI_API_KEY environment variables.');
  }
  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const books = await loadCatalogBooks(client, options);
  if (!books.length) throw new Error('No catalog books matched the request.');
  const report = await generateBookOnRamps({ books, client, apiKey, model, force: options.force });
  console.log(`Finished 30-second read generation: ${report.generated} generated, ${report.skipped} skipped, ${report.failed} failed.`);
  if (report.failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`30-second read generation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
