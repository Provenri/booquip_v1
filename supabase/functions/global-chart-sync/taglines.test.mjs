import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateChartTaglines, validTagline } from './taglines.ts';

test('validates generated tagline shape and strips surrounding quotation marks', () => {
  assert.equal(validTagline(' “A journey through memory and belonging.” '), 'A journey through memory and belonging.');
  for (const value of [null, '', 'Short', 'x'.repeat(161), 'A multiline\ntagline']) {
    assert.equal(validTagline(value), null);
  }
});

function setup(entries) {
  const patches = [];
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    if (url.hostname === 'api.openai.com') {
      return Response.json({ choices: [{ message: { content: JSON.stringify({ books: entries }) } }] });
    }
    if (!options.method) {
      assert.equal(url.searchParams.get('pillar'), 'eq.charts');
      assert.equal(url.searchParams.get('tagline'), 'is.null');
      return Response.json([{ id: 'a', title: 'Book A', author: 'Author', note: 'A story about belonging.' }]);
    }
    const body = JSON.parse(options.body);
    assert.equal(url.searchParams.get('tagline'), 'is.null');
    if (body.tagline) patches.push({ id: url.searchParams.get('id'), ...body });
    return Response.json(body.tagline ? [{ id: 'a' }] : []);
  };
  return { fetchImpl, patches };
}

test('saves only requested valid taglines and never overwrites an existing tagline', async () => {
  const { fetchImpl, patches } = setup([
    { id: 'other-book', tagline: 'An unrelated book must not be changed.' },
    { id: 'a', tagline: 'A journey through memory and belonging.' },
    { id: 'a', tagline: 'A duplicate must not replace the first.' },
  ]);
  const report = await generateChartTaglines('https://project.example', {}, 'test-key', 'test-model', fetchImpl);
  assert.deepEqual(report, { configured: true, generated: 1, errors: 0 });
  assert.deepEqual(patches, [{ id: 'eq.a', tagline: 'A journey through memory and belonging.' }]);
});

test('reports invalid or failed generations for later retry and does not fabricate success', async () => {
  const { fetchImpl, patches } = setup([{ id: 'a', tagline: '' }]);
  const report = await generateChartTaglines('https://project.example', {}, 'test-key', 'test-model', fetchImpl);
  assert.equal(report.errors, 1);
  assert.equal(patches.length, 0);
  const failed = await generateChartTaglines('https://project.example', {}, 'test-key', 'test-model', async () => new Response(null, { status: 503 }));
  assert.equal(failed.errors, 1);
  assert.deepEqual(await generateChartTaglines('https://project.example', {}, undefined, 'test-model', () => assert.fail()), {
    configured: false, generated: 0, errors: 0,
  });
});
