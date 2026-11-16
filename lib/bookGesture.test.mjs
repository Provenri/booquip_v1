import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { getShelfSwipeAction, getSwipeAction } from './bookGesture.ts';

test('maps horizontal swipes and quick flicks to save and skip', () => {
  assert.equal(getSwipeAction(45, 10, 0, 0, true), 'tbr');
  assert.equal(getSwipeAction(-45, 10, 0, 0, true), 'next');
  assert.equal(getSwipeAction(15, 2, 500, 20, true), 'tbr');
  assert.equal(getSwipeAction(-15, 2, -500, 20, true), 'next');
});

test('shelf swipes open Quip on the right and return on the left without capturing scrolling', () => {
  assert.equal(getShelfSwipeAction(45, 5, 0, 0), 'quip');
  assert.equal(getShelfSwipeAction(-45, 5, 0, 0), 'return');
  assert.equal(getShelfSwipeAction(15, 2, 500, 20), 'quip');
  assert.equal(getShelfSwipeAction(-15, 2, -500, 20), 'return');
  assert.equal(getShelfSwipeAction(44, 0, 0, 0), undefined);
  assert.equal(getShelfSwipeAction(20, 70, 600, 800), undefined);
  assert.equal(getShelfSwipeAction(20, 0, -600, 0), undefined);
});

test('ignores vertical, short, opposing flicks and skip without another book', () => {
  assert.equal(getSwipeAction(44, 0, 0, 0, true), undefined);
  assert.equal(getSwipeAction(20, 70, 600, 800, true), undefined);
  assert.equal(getSwipeAction(20, 0, -600, 0, true), undefined);
  assert.equal(getSwipeAction(10, 0, 600, 0, true), undefined);
  assert.equal(getSwipeAction(-45, 0, -600, 0, false), undefined);
  assert.equal(getSwipeAction(45, 0, 0, 0, false), 'tbr');
});
