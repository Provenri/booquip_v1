import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildQuipPrompt, LEGACY_QUIP_PROMPT, QUIP_IDEA_PROMPT } from './prompt.ts';
import { QUIP_STANCES, QUIP_STYLES } from '../_shared/quip.ts';

let handler;
const previousDeno = globalThis.Deno;
globalThis.Deno = {
  env: { get: (name) => ({
    OPENAI_API_KEY: 'test-key',
    SUPABASE_URL: 'https://project.example',
    SUPABASE_ANON_KEY: 'test-anon-key',
  })[name] },
  serve: (callback) => { handler = callback; },
};
try {
  await import('./index.ts');
} finally {
  if (previousDeno === undefined) delete globalThis.Deno;
  else globalThis.Deno = previousDeno;
}

const BOOKS = [
  { id: 'a', title: 'Book A', author: 'Author A', published_year: 2000, note: 'Focus makes meaningful progress possible.' },
  { id: 'b', title: 'Book B', author: 'Author B', published_year: 2001, note: 'Prioritize essential work over busyness.' },
  { id: 'deselected', title: 'Excluded Book', author: 'Excluded Author', published_year: 2002, note: 'DO_NOT_INCLUDE_THIS_BOOK' },
];
const REPLY = 'A crowded calendar is not always progress. Choose what matters before adding another task.';
const RESULT = { reply: REPLY, relevance: [{ bookId: 'a', level: 'high' }, { bookId: 'b', level: 'medium' }] };

function setup(t, options = {}) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ url, init });
    if (url.hostname === 'api.openai.com') {
      if (options.aiStatus) return new Response(null, { status: options.aiStatus });
      return Response.json({
        choices: [{
          finish_reason: options.finishReason ?? 'stop',
          message: { content: options.content ? options.content() : JSON.stringify(RESULT) },
        }],
      });
    }
    const filter = url.searchParams.get(url.pathname.endsWith('user_swipes') ? 'book_id' : 'id');
    const ids = filter ? JSON.parse(`[${filter.slice(4, -1)}]`) : BOOKS.map((book) => book.id);
    if (url.pathname === '/rest/v1/user_swipes') {
      assert.equal(url.searchParams.get('state'), 'eq.read');
      assert.equal(url.searchParams.get('quip_enabled'), 'eq.true');
      return Response.json(ids.filter((id) => (options.eligible ?? BOOKS.map((book) => book.id)).includes(id))
        .map((book_id) => ({ book_id })));
    }
    if (url.pathname === '/rest/v1/books') return Response.json(BOOKS.filter((book) => ids.includes(book.id)));
    assert.fail(`Unexpected request: ${url}`);
  });
  return calls;
}

function request(overrides = {}) {
  return new Request('https://project.example/functions/v1/trend-interceptor', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-user-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      trendText: 'Being busy does not always mean being productive.',
      bookIds: ['a', 'b'],
      includeRelevance: true,
      ...overrides,
    }),
  });
}

function ideaRequest(overrides = {}) {
  return request({
    mode: 'idea', trendText: undefined, includeRelevance: undefined, ...overrides,
  });
}

test('book ideas use only selected eligible book summaries, without sending the existing seed or trend', async (t) => {
  const idea = 'Could doing less make room for more meaningful progress?';
  const calls = setup(t, { content: () => JSON.stringify({ idea }) });
  const response = await handler(ideaRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { idea });
  const aiCalls = calls.filter((call) => call.url.hostname === 'api.openai.com');
  assert.equal(aiCalls.length, 1);
  const body = JSON.parse(aiCalls[0].init.body);
  assert.equal(body.messages[0].content, QUIP_IDEA_PROMPT);
  assert.deepEqual(JSON.parse(body.messages[1].content), {
    ideas: BOOKS.slice(0, 2).map((book) => ({ bookId: book.id, title: book.title, author: book.author, shortTake: book.note })),
  });
  assert.deepEqual(body.response_format, { type: 'json_object' });
});

test('standalone ideas are allowed, and the exact 200-character limit is enforced without truncating', async (t) => {
  let idea = 'x'.repeat(200);
  setup(t, { content: () => JSON.stringify({ idea }) });
  const errors = t.mock.method(console, 'error', () => {});
  const accepted = await handler(ideaRequest({ bookIds: ['a'] }));
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).idea.length, 200);
  idea += 'x';
  const rejected = await handler(ideaRequest());
  assert.equal(rejected.status, 502);
  assert.match((await rejected.json()).error, /invalid or unfinished idea/);
  assert.equal(errors.mock.callCount(), 1);
});

test('one descriptive short take is passed to the model with instructions to use it rather than require multiple books', async (t) => {
  const calls = setup(t, { content: () => JSON.stringify({ idea: 'Can focused attention improve progress?' }) });
  const response = await handler(ideaRequest({ bookIds: ['a'] }));
  assert.equal(response.status, 200);
  const body = JSON.parse(calls.find((call) => call.url.hostname === 'api.openai.com').init.body);
  assert.deepEqual(JSON.parse(body.messages[1].content).ideas, [{
    bookId: 'a', title: 'Book A', author: 'Author A', shortTake: BOOKS[0].note,
  }]);
  assert.match(body.messages[0].content, /One book is sufficient/);
  assert.match(body.messages[0].content, /Return an error only if none of the selected short takes contains a usable topic or idea/);
});

test('idea requests reject absent, empty, duplicate, or stale books and unrelated inputs', async (t) => {
  const calls = setup(t, { eligible: ['a'] });
  for (const overrides of [
    { bookIds: undefined }, { bookIds: [] }, { bookIds: ['a', 'a'] },
    { trendText: 'Do not send this seed' }, { trendTopicId: 'a' }, { stance: 'pro' },
    { style: 'witty' }, { includeRelevance: true }, { mode: 'other' },
  ]) {
    assert.equal((await handler(ideaRequest(overrides))).status, 400);
  }
  assert.equal(calls.length, 0);
  assert.equal((await handler(ideaRequest())).status, 409);
  assert.equal(calls.length, 1);
});

test('malformed, empty, extra-field, and unfinished idea responses fail explicitly', async (t) => {
  let content;
  setup(t, { content: () => content });
  const errors = t.mock.method(console, 'error', () => {});
  for (const value of ['not JSON', '{"idea":""}', '{"idea":"   "}', '{"idea":7}', '{"reply":"wrong shape"}', '{"idea":"A seed","other":true}']) {
    content = value;
    assert.equal((await handler(ideaRequest())).status, 502);
  }
  assert.equal(errors.mock.callCount(), 6);
});

test('insufficient summaries return a clear error for one or multiple selected books', async (t) => {
  const error = 'These books need more descriptive summaries before an idea can be suggested.';
  const calls = setup(t, { content: () => JSON.stringify({ error }) });
  for (const bookIds of [['a'], ['a', 'b']]) {
    const response = await handler(ideaRequest({ bookIds }));
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { error });
    const aiCall = calls.filter((call) => call.url.hostname === 'api.openai.com').at(-1);
    assert.deepEqual(JSON.parse(JSON.parse(aiCall.init.body).messages[1].content).ideas.map((book) => book.bookId), bookIds);
  }
});

test('truncated idea output is never accepted', async (t) => {
  setup(t, { content: () => '{"idea":"An unfinished seed"}', finishReason: 'length' });
  t.mock.method(console, 'error', () => {});
  assert.equal((await handler(ideaRequest())).status, 502);
});

test('one AI call generates a Quip and relevance using only the selected books', async (t) => {
  const calls = setup(t);
  const response = await handler(request({ stance: 'cons', style: 'empathetic' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), RESULT);
  const aiCalls = calls.filter((call) => call.url.hostname === 'api.openai.com');
  assert.equal(aiCalls.length, 1);
  const body = JSON.parse(aiCalls[0].init.body);
  const context = JSON.parse(body.messages[1].content);
  assert.deepEqual(context.ideas.map((book) => book.bookId), ['a', 'b']);
  assert.doesNotMatch(JSON.stringify(context), /DO_NOT_INCLUDE|Excluded/);
  assert.match(body.messages[0].content, /Respectfully challenge the idea/);
  assert.match(body.messages[0].content, /Open by acknowledging a concrete feeling/);
  assert.match(body.messages[0].content, /independently of stance, style/);
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.ok(calls.filter((call) => call.url.hostname === 'project.example')
    .every((call) => !call.url.search.includes('deselected')));
});

test('Neutral and Natural preserve the original writing rules; older clients keep the plain response', async (t) => {
  const calls = setup(t, { content: () => REPLY });
  const response = await handler(request({ includeRelevance: undefined }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reply: REPLY });
  const body = JSON.parse(calls.find((call) => call.url.hostname === 'api.openai.com').init.body);
  assert.equal(body.messages[0].content, LEGACY_QUIP_PROMPT);
  assert.deepEqual(JSON.parse(body.messages[1].content).ideas, BOOKS.slice(0, 2).map((book) => book.note));
  assert.equal(body.max_tokens, 240);
  assert.equal(body.response_format, undefined);
  assert.ok(buildQuipPrompt('neutral', 'natural').startsWith(
    LEGACY_QUIP_PROMPT.replace('Return only the reply text, with no labels or explanation.', ''),
  ));
});

test('new clients default to Neutral and Natural when choices are omitted', async (t) => {
  const calls = setup(t);
  const response = await handler(request());
  assert.equal(response.status, 200);
  const body = JSON.parse(calls.find((call) => call.url.hostname === 'api.openai.com').init.body);
  assert.equal(body.messages[0].content, buildQuipPrompt('neutral', 'natural'));
});

test('all stance/style combinations send only their own guide and illustration, keeping the default untouched', async (t) => {
  const calls = setup(t);
  for (const stance of QUIP_STANCES) {
    for (const style of QUIP_STYLES) {
      const response = await handler(request({ stance: stance.id, style: style.id }));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), RESULT);
      const body = JSON.parse(calls.at(-1).init.body);
      const prompt = body.messages[0].content;
      assert.match(prompt, /Do not invent personal experiences/);
      assert.match(prompt, /style must not reverse it/);
      assert.equal((prompt.match(/STYLE: /g) ?? []).length, stance.id === 'neutral' && style.id === 'natural' ? 0 : 1);
      if (stance.id === 'neutral' && style.id === 'natural') {
        assert.doesNotMatch(prompt, /silently check|Technique illustration/);
      } else {
        assert.ok(prompt.includes(`STYLE: ${style.id.toUpperCase()}.`));
        assert.match(prompt, /silently check/);
        assert.match(prompt, /revise it before returning/);
      }
      if (stance.id === 'cons') {
        assert.match(prompt, /main claim and conclusion MUST question or qualify the seed/);
        assert.match(prompt, /Do not turn empathy into agreement/);
        assert.ok(prompt.indexOf('Respectfully challenge the idea') > prompt.indexOf(`STYLE: ${style.id.toUpperCase()}.`));
      }
      if (['witty', 'challenging', 'empathetic'].includes(style.id)) {
        assert.ok(prompt.includes(`Technique illustration for ${stance.id.toUpperCase()} + ${style.id.toUpperCase()}`));
        assert.match(prompt, /Do not copy its wording/);
        for (const other of QUIP_STANCES.filter((option) => option.id !== stance.id)) {
          assert.ok(!prompt.includes(`Technique illustration for ${other.id.toUpperCase()} +`));
        }
      } else {
        assert.doesNotMatch(prompt, /Technique illustration/);
      }
    }
  }
  assert.equal(calls.filter((call) => call.url.hostname === 'api.openai.com').length, QUIP_STANCES.length * QUIP_STYLES.length);
});

test('Concise uses the shorter prompt and rejects output beyond 280 characters without truncation', async (t) => {
  let reply = 'x'.repeat(280);
  const calls = setup(t, { content: () => JSON.stringify({ ...RESULT, reply }) });
  t.mock.method(console, 'error', () => {});
  for (const stance of QUIP_STANCES) {
    const response = await handler(request({ stance: stance.id, style: 'concise' }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ...RESULT, reply });
    const prompt = JSON.parse(calls.at(-1).init.body).messages[0].content;
    assert.match(prompt, /1 to 2 sentences and no more than 280 characters/);
    assert.doesNotMatch(prompt, /2 to 4 sentences|600 characters/);
    assert.match(prompt, /independently of stance, style/);
  }
  reply += 'x';
  const response = await handler(request({ style: 'concise' }));
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /invalid Quip/);
  const natural = await handler(request({ style: 'natural' }));
  assert.equal(natural.status, 200);
  assert.deepEqual(await natural.json(), { ...RESULT, reply });
});

test('invalid preferences, empty/duplicate selections, and implicit relevance selections fail before any data or AI request', async (t) => {
  const calls = setup(t);
  for (const overrides of [
    { stance: 'angry' }, { style: 'invented' }, { includeRelevance: 'yes' },
    { bookIds: [] }, { bookIds: ['a', 'a'] }, { bookIds: undefined },
    { includeRelevance: false, stance: 'pro' },
  ]) {
    const response = await handler(request(overrides));
    assert.equal(response.status, 400, JSON.stringify(overrides));
    assert.equal(typeof (await response.json()).error, 'string');
  }
  assert.equal(calls.length, 0);
});

test('a stale or ineligible selected book prevents partial generation or assessment', async (t) => {
  const calls = setup(t, { eligible: ['a'] });
  const response = await handler(request());
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /no longer Quip-enabled/);
  assert.equal(calls.length, 1);
});

test('malformed, incomplete, duplicate, foreign-ID, invalid-level, and oversized AI results fail explicitly', async (t) => {
  let content;
  setup(t, { content: () => content });
  const errors = t.mock.method(console, 'error', () => {});
  const invalid = [
    '{invalid JSON',
    { reply: REPLY, relevance: [{ bookId: 'a', level: 'high' }] },
    { reply: REPLY, relevance: [{ bookId: 'a', level: 'high' }, { bookId: 'a', level: 'low' }] },
    { reply: REPLY, relevance: [{ bookId: 'a', level: 'high' }, { bookId: 'deselected', level: 'low' }] },
    { reply: REPLY, relevance: [{ bookId: 'a', level: 'high' }, { bookId: 'b', level: 'certain' }] },
    { reply: 'x'.repeat(601), relevance: RESULT.relevance },
    { reply: '', relevance: RESULT.relevance },
    { reply: REPLY },
  ];
  for (const value of invalid) {
    content = typeof value === 'string' ? value : JSON.stringify(value);
    const response = await handler(request());
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /invalid Quip or incomplete book relevance/);
  }
  assert.equal(errors.mock.callCount(), invalid.length);
});

test('low match and insufficient information remain valid assessments, not invented high matches', async (t) => {
  const result = { reply: REPLY, relevance: [{ bookId: 'a', level: 'low' }, { bookId: 'b', level: 'insufficient' }] };
  setup(t, { content: () => JSON.stringify(result) });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), result);
});

test('truncated model output is not presented as a completed assessment', async (t) => {
  setup(t, { finishReason: 'length' });
  const response = await handler(request());
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /did not finish/);
});
