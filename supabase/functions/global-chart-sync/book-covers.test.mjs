import assert from 'node:assert/strict';
import { Image } from 'npm:imagescript@3.20.3';
import { importApprovedCover, optimizeEdgeCover } from './book-covers.ts';

const sourceImage = await new Image(40, 60).fill(0x34755eff).encodePNG();
const supabaseUrl = 'https://project.example';
const serviceHeaders = { apikey: 'test-server-key', Authorization: 'Bearer test-server-key' };

function setup(overrides = {}) {
  const controls = { empty: false, claimLost: false, uploadFails: false, corruptPublic: false, publishFails: false, ...overrides };
  const requests = [];
  let uploaded;
  const approval = {
    book_id: 'test-book',
    source_url: 'https://approved.example/cover.png',
    permission_reference: 'Generated test image',
    attempted_at: null,
  };
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    requests.push({ url, options });
    const method = options.method ?? 'GET';
    if (url.pathname === '/rest/v1/book_cover_imports' && method === 'GET') {
      assert.equal(url.searchParams.get('approved_for_rehosting'), 'eq.true');
      assert.equal(url.searchParams.get('status'), 'neq.published');
      assert.match(url.searchParams.get('or'), /attempted_at.lt/);
      return Response.json(controls.empty ? [] : [approval]);
    }
    if (url.pathname === '/rest/v1/book_cover_imports' && method === 'PATCH') {
      const body = JSON.parse(options.body);
      if (body.status === 'failed') {
        assert.match(url.searchParams.get('attempted_at'), /^eq\./);
        assert.equal(url.searchParams.get('source_url'), `eq.${approval.source_url}`);
        assert.equal(url.searchParams.get('approved_for_rehosting'), 'eq.true');
        return new Response(null, { status: 204 });
      }
      assert.equal(url.searchParams.get('attempted_at'), 'is.null');
      return Response.json(controls.claimLost ? [] : [{ ...approval, attempted_at: body.attempted_at }]);
    }
    if (url.pathname === '/rest/v1/books') return Response.json([{ cover_url: 'https://original.example/cover.jpg' }]);
    if (url.hostname === 'approved.example') {
      assert.equal(options.headers, undefined);
      assert.equal(options.redirect, 'error');
      return new Response(sourceImage, { headers: { 'content-type': 'image/png' } });
    }
    if (url.pathname.startsWith('/storage/v1/object/book-covers/')) {
      assert.equal(options.headers.Authorization, serviceHeaders.Authorization);
      if (controls.uploadFails) return new Response(null, { status: 503 });
      uploaded = new Uint8Array(options.body);
      return Response.json({ Key: url.pathname });
    }
    if (url.pathname.startsWith('/storage/v1/object/public/book-covers/')) {
      assert.equal(options.headers, undefined);
      return new Response(controls.corruptPublic ? sourceImage : uploaded, { headers: { 'content-type': 'image/jpeg' } });
    }
    if (url.pathname === '/rest/v1/rpc/publish_approved_book_cover') {
      const body = JSON.parse(options.body);
      assert.equal(body.p_original_cover_url, 'https://original.example/cover.jpg');
      assert.equal(body.p_permission_reference, approval.permission_reference);
      assert.match(body.p_object_path, /^test-book\/[a-f0-9]{64}\.jpg$/);
      return new Response(null, { status: controls.publishFails ? 409 : 204 });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  return { controls, requests, approval, fetchImpl };
}

Deno.test('Edge optimizer accepts JPEG, PNG, and WebP, resizes, and rejects oversized decoded images', async () => {
  const original = new Image(40, 60).fill(0x34755eff);
  for (const input of [sourceImage, await original.encodeJPEG(), await original.encodeWebP()]) {
    const output = await Image.decode(await optimizeEdgeCover(input), { threads: 1 });
    assert.equal(output.width, 40);
    assert.equal(output.height, 60);
  }
  const large = await new Image(1600, 2400).fill(0x34755eff).encodeJPEG();
  const resized = await Image.decode(await optimizeEdgeCover(large), { threads: 1 });
  assert.equal(resized.width, 800);
  assert.equal(resized.height, 1200);
  const oversized = await new Image(2100, 2100).fill(0x34755eff).encodeJPEG();
  await assert.rejects(() => optimizeEdgeCover(oversized));
  await assert.rejects(() => optimizeEdgeCover(new TextEncoder().encode('<svg/>')), /Unsupported/);
});

Deno.test('does not download covers when no approved imports exist or another invocation wins the claim', async () => {
  for (const controls of [{ empty: true }, { claimLost: true }]) {
    const { fetchImpl, requests } = setup(controls);
    assert.deepEqual(await importApprovedCover(supabaseUrl, serviceHeaders, fetchImpl), { published: 0, errors: 0 });
    assert.ok(requests.every(({ url }) => url.pathname === '/rest/v1/book_cover_imports'));
  }
});

Deno.test('uploads, publicly verifies, and publishes approved covers without leaking credentials to image hosts', async () => {
  const { fetchImpl, requests } = setup();
  assert.deepEqual(await importApprovedCover(supabaseUrl, serviceHeaders, fetchImpl), { published: 1, errors: 0 });
  assert.equal(requests.filter(({ url }) => url.pathname.includes('/rpc/')).length, 1);
});

Deno.test('records upload, public verification, and approval conflicts as failures without publishing an invalid URL', async () => {
  for (const controls of [{ uploadFails: true }, { corruptPublic: true }, { publishFails: true }]) {
    const { fetchImpl, requests } = setup(controls);
    assert.deepEqual(await importApprovedCover(supabaseUrl, serviceHeaders, fetchImpl), { published: 0, errors: 1 });
    const failure = requests.at(-1);
    assert.equal(JSON.parse(failure.options.body).status, 'failed');
    assert.equal(requests.filter(({ url }) => url.pathname.includes('/rpc/')).length, controls.publishFails ? 1 : 0);
  }
});

Deno.test('invalid approved sources are recorded for retry without downloading', async () => {
  const { approval, fetchImpl, requests } = setup();
  approval.source_url = 'https://user:password@approved.example/cover.png';
  assert.deepEqual(await importApprovedCover(supabaseUrl, serviceHeaders, fetchImpl), { published: 0, errors: 1 });
  assert.equal(requests.length, 3);
  assert.equal(JSON.parse(requests.at(-1).options.body).status, 'failed');
});
