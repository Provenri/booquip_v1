import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withAiTimeout } from './aiRequest.ts';

test('a stalled transport times out, is aborted, and allows a successful retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let requestSignal;
  const pending = withAiTimeout((signal) => {
    requestSignal = signal;
    return new Promise(() => {});
  }, 'Please retry.', undefined, 100);
  const rejected = assert.rejects(pending, /Please retry/);
  t.mock.timers.tick(100);
  await rejected;
  assert.equal(requestSignal.aborted, true);
  assert.equal(await withAiTimeout(async () => 'retry succeeded', 'Please retry.'), 'retry succeeded');
});

test('navigation cancellation settles even when the transport ignores abort', async () => {
  const controller = new AbortController();
  let requestSignal;
  const pending = withAiTimeout((signal) => {
    requestSignal = signal;
    return new Promise(() => {});
  }, 'Timed out.', controller.signal);
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  controller.abort();
  await rejected;
  assert.equal(requestSignal.aborted, true);
});

test('a previously canceled request does not invoke the transport, and service errors are preserved', async () => {
  await assert.rejects(withAiTimeout(() => {
    assert.fail('Canceled request must not start');
  }, 'Timed out.', AbortSignal.abort()), { name: 'AbortError' });
  await assert.rejects(withAiTimeout(async () => { throw new Error('Specific service error'); }, 'Timed out.'), /Specific service error/);
});
