import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let handler;
let coverImports = 0;
const previousDeno = globalThis.Deno;
const coverMock = mock.module('./book-covers.ts', {
  namedExports: {
    importApprovedCover: async () => {
      coverImports += 1;
      return { published: 0, errors: 0 };
    },
  },
});
globalThis.Deno = {
  env: { get: (name) => ({
    CHART_SYNC_SECRET: 'test-secret',
    SUPABASE_URL: 'https://project.example',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    NYT_API_KEY: 'test-nyt-key',
    OPENLIBRARY_USER_AGENT: 'BooQuip-Test',
    OPENAI_API_KEY: 'test-ai-key',
  })[name] },
  serve: (callback) => { handler = callback; },
};
try {
  await import('./index.ts');
} finally {
  coverMock.restore();
  if (previousDeno === undefined) delete globalThis.Deno;
  else globalThis.Deno = previousDeno;
}

test('sync retains book processing without fetching or summarizing Quip trends', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ url, init });
    if (url.pathname === '/rest/v1/chart_sources') {
      return Response.json(url.searchParams.get('provider') === 'eq.nyt' ? [{
        id: 'nyt-fiction', provider: 'nyt', list_id: 'fiction', list_name: 'Fiction',
        source_url: 'https://api.nytimes.com/test-list',
      }] : []);
    }
    if (url.hostname === 'api.nytimes.com') {
      return Response.json({
        results: {
          bestsellers_date: '2026-11-15',
          books: [{ rank: 1, title: 'Test Book', author: 'Test Author', primary_isbn13: '9781234567890' }],
        },
      });
    }
    if (url.pathname === '/rest/v1/books' ||
        url.pathname === '/rest/v1/chart_entries' ||
        url.pathname === '/rest/v1/openlibrary_book_links') {
      return Response.json([]);
    }
    assert.fail(`Unexpected request: ${url}`);
  });

  const response = await handler(new Request('https://project.example/functions/v1/global-chart-sync', {
    method: 'POST',
    headers: { 'x-chart-sync-secret': 'test-secret' },
  }));
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.nyt.entries, 1);
  assert.equal(report.taglines.configured, true);
  assert.equal(report.keywords.configured, true);
  assert.equal(coverImports, 1);
  assert.equal(Object.hasOwn(report, 'googleTrends'), false);
  assert.ok(calls.some(({ url }) => url.searchParams.get('tagline') === 'is.null'));
  assert.ok(calls.some(({ url }) => url.searchParams.get('keywords') === 'is.null'));
  const entryWrite = calls.find(({ url, init }) => url.pathname === '/rest/v1/chart_entries' && init.method === 'POST');
  assert.equal(JSON.parse(entryWrite.init.body)[0].title, 'Test Book');
  assert.ok(calls.every(({ url }) => url.hostname !== 'trends.google.com' &&
    url.hostname !== 'api.openai.com' && !url.pathname.includes('quip_trend')));
});
