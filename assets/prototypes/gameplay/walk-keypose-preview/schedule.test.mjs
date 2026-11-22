import { test } from 'node:test';
import assert from 'node:assert/strict';
import { durationMs, distance, frameAt, motionAt, motionMs, retreatMs, stride, variants } from './schedule.mjs';

test('the variants share keys and contain exactly two, three and four unique drawings', () => {
  assert.deepEqual(Object.values(variants).map(s => new Set(s.map(k => k[1])).size), [2, 3, 4]);
  for (const name of Object.keys(variants)) {
    assert.equal(frameAt(name, 0), 0);
    assert.equal(frameAt(name, stride / 2), 2);
    assert.equal(frameAt(name, stride), 0);
  }
});

test('quarter phase boundaries select a drawing without stretching the cycle', () => {
  const positions = [0, stride / 4 - .001, stride / 4, stride / 2 - .001, stride / 2, stride * .75 - .001, stride * .75, stride - .001, stride];
  assert.deepEqual(positions.map(x => frameAt('four', x)), [0, 0, 1, 1, 2, 2, 3, 3, 0]);
  assert.deepEqual(positions.map(x => frameAt('three', x)), [0, 0, 0, 0, 2, 2, 3, 3, 0]);
  assert.deepEqual(positions.map(x => frameAt('two', x)), [0, 0, 0, 0, 2, 2, 2, 2, 0]);
});

test('advancing and retreating share the same route and speed; stops return to stance', () => {
  assert.deepEqual(motionAt(0), { x: 0, moving: false, direction: 1 });
  assert.deepEqual(motionAt(300), { x: 0, moving: true, direction: 1 });
  assert.equal(motionAt(400).x, 35.5);
  assert.deepEqual(motionAt(300 + motionMs), { x: distance, moving: false, direction: 1 });
  assert.deepEqual(motionAt(retreatMs), { x: distance, moving: true, direction: -1 });
  assert.ok(Math.abs(motionAt(retreatMs + 100).x - (distance - 35.5)) < 1e-9);
  assert.deepEqual(motionAt(retreatMs + motionMs), { x: 0, moving: false, direction: 1 });
  assert.deepEqual(motionAt(durationMs), motionAt(0));
});

test('retreat starts with rear foot recovery and reverses the drawing order', () => {
  assert.deepEqual([1, .875, .625, .375, .125, 0].map(p => frameAt('four', p * stride)), [0, 3, 2, 1, 0, 0]);
  const held = motionAt(1200);
  assert.equal(held.x, motionAt(1300).x);
  assert.equal(frameAt('four', held.x), 0);
});

test('invalid names, displacements and times are rejected explicitly', () => {
  assert.throws(() => frameAt('missing', 0), RangeError);
  for (const x of [-1, NaN, Infinity]) assert.throws(() => frameAt('four', x), RangeError);
  for (const t of [-1, NaN, Infinity, durationMs + 1]) assert.throws(() => motionAt(t), RangeError);
});
