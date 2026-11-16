import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  buildQuipCachePrompt,
  parseGeneratedQuipCache,
  QUIP_CACHE_PROMPT_VERSION,
  QUIP_CACHE_VARIANT_COUNT,
} from '../supabase/functions/_shared/quipCache.ts';
import { QUIP_STANCES, SINGLE_BOOK_QUIP_STYLES } from '../supabase/functions/_shared/quip.ts';

const API_URL = 'https://api.openai.com/v1/chat/completions';

export function quipCacheSourceHash(book) {
  return createHash('sha256')
    .update(JSON.stringify({ id: book.id, title: book.title, author: book.author, note: book.note }))
    .digest('hex');
}

export function buildQuipCacheRows(book, generated, model, generatedAt = new Date().toISOString()) {
  const parsed = parseGeneratedQuipCache(generated);
  const sourceHash = quipCacheSourceHash(book);
  return parsed.variants.map((variant) => ({
    book_id: book.id,
    stance: variant.stance,
    style: variant.style,
    topic: parsed.topic,
    topic_reason: parsed.topicReason,
    reply: variant.reply,
    source_hash: sourceHash,
    prompt_version: QUIP_CACHE_PROMPT_VERSION,
    model,
    generated_at: generatedAt,
  }));
}

export function hasCompleteCurrentQuipCache(rows, sourceHash) {
  if (!Array.isArray(rows) || rows.length !== QUIP_CACHE_VARIANT_COUNT) return false;
  const seen = new Set();
  const expected = new Set(QUIP_STANCES.flatMap((stance) =>
    SINGLE_BOOK_QUIP_STYLES.map((style) => `${stance.id}:${style.id}`),
  ));
  for (const row of rows) {
    if (row.source_hash !== sourceHash || row.prompt_version !== QUIP_CACHE_PROMPT_VERSION) return false;
    const key = `${row.stance}:${row.style}`;
    if (!expected.has(key) || seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

export async function requestQuipCache(book, { apiKey, model, fetchImpl = fetch }) {
  const response = await fetchImpl(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_tokens: 2200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildQuipCachePrompt() },
        { role: 'user', content: JSON.stringify({ title: book.title, author: book.author, shortTake: book.note }) },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`OpenAI returned HTTP ${response.status}.`);
  const result = await response.json();
  const choice = result.choices?.[0];
  if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string') {
    throw new Error('OpenAI did not return a complete Quip cache response.');
  }
  let decoded;
  try {
    decoded = JSON.parse(choice.message.content);
  } catch {
    throw new Error('OpenAI returned invalid JSON for the Quip cache.');
  }
  return parseGeneratedQuipCache(decoded);
}

export async function generateQuipCache({
  books,
  client,
  apiKey,
  model,
  force = false,
  fetchImpl = fetch,
  logger = console,
}) {
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const book of books) {
    try {
      const sourceHash = quipCacheSourceHash(book);
      if (!force) {
        const { data, error } = await client.from('quip_book_drafts')
          .select('stance,style,source_hash,prompt_version')
          .eq('book_id', book.id);
        if (error) throw error;
        if (hasCompleteCurrentQuipCache(data ?? [], sourceHash)) {
          skipped += 1;
          logger.log(`Current cache exists: ${book.id}`);
          continue;
        }
      }

      const result = await requestQuipCache(book, { apiKey, model, fetchImpl });
      const rows = buildQuipCacheRows(book, result, model);
      const { error } = await client.from('quip_book_drafts').upsert(rows, {
        onConflict: 'book_id,stance,style',
      });
      if (error) throw error;
      generated += 1;
      logger.log(`Generated ${rows.length} variants: ${book.id}`);
    } catch (error) {
      failed += 1;
      logger.error(`Quip cache generation failed for ${book.id}: ${error instanceof Error ? error.message : 'Unknown error.'}`);
    }
  }

  const report = { books: books.length, generated, skipped, failed };
  logger.log(`Finished Quip cache generation: ${generated} generated, ${skipped} skipped, ${failed} failed.`);
  return report;
}

function parseArgs(args) {
  const options = { bookIds: [], limit: null, force: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--force') {
      options.force = true;
    } else if (arg === '--book-id' && args[index + 1]) {
      options.bookIds.push(args[++index]);
    } else if (arg === '--limit' && args[index + 1]) {
      const limit = Number(args[++index]);
      if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit must be a positive integer.');
      options.limit = limit;
    } else {
      throw new Error('Usage: npm run quip:cache -- [--book-id <id>]... [--limit <count>] [--force]');
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_QUIP_CACHE_MODEL ?? 'gpt-4o-mini';
  if (!supabaseUrl || !serviceRoleKey || !apiKey) {
    throw new Error('Set server-only SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and OPENAI_API_KEY environment variables.');
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let query = client.from('books').select('id,title,author,note').order('title', { ascending: true });
  if (options.bookIds.length) query = query.in('id', options.bookIds);
  if (options.limit !== null) query = query.limit(options.limit);
  const { data: books, error } = await query;
  if (error) throw error;
  if (options.bookIds.length && books.length !== new Set(options.bookIds).size) {
    throw new Error('One or more requested catalog books were not found.');
  }
  if (books.length === 0) throw new Error('No catalog books matched the request.');

  const report = await generateQuipCache({ books, client, apiKey, model, force: options.force });
  if (report.failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Quip cache generation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
