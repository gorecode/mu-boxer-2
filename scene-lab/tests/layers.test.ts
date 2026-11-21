import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLayerTimeline, duration, initial, nativeLayers, reducedLayers, type LayerState } from '../src/experiments/layers/motion.ts';

function near(actual: LayerState, expected: LayerState): void {
  for (const key of Object.keys(initial) as (keyof LayerState)[]) {
    assert.ok(Math.abs(actual[key] - expected[key]) < 0.000003, `${key}: ${actual[key]} ≠ ${expected[key]}`);
  }
}

test('independent layers agree across entrances, impact, overshoot, holds and fade in both directions', () => {
  for (const lead of [0, 800, 1300, 2000]) {
    const track = createLayerTimeline(lead);
    try {
      const times = new Set([0, duration(lead)]);
      for (let time = 0; time < duration(lead); time += 10) times.add(time);
      for (const offset of [0, 600, 1200, 1500, 1675, 1850, 3200, 4000, 4500]) {
        for (const delta of [-1, 0, 1]) times.add(Math.max(0, lead + offset + delta));
      }
      const ordered = [...times].sort((a, b) => a - b);
      assert.ok(ordered.length > 500);
      for (const time of [...ordered, ...ordered.toReversed(), lead + 1675, 0]) near(track.at(time), nativeLayers(time, lead));
      near(track.at(lead + 600), { city: -0.6, rail: 2.25, paper: 18.75, angle: -1.5, stamp: 1.8, ink: 0, black: 0 });
      assert.ok(track.at(lead + 1675).stamp < 1);
      assert.equal(track.at(lead + 1499).ink, 0);
      assert.equal(track.at(lead + 1500).ink, 1);
      assert.equal(track.at(lead + 4250).black, 0.5);
    } finally { track.dispose(); }
  }
});

test('one lead-in change shifts every dependent layer without changing the choreography', () => {
  const early = createLayerTimeline(800);
  const late = createLayerTimeline(1300);
  try {
    for (const offset of [0, 350, 1200, 1500, 1675, 3200, 4250, 5000]) {
      near(early.at(800 + offset), late.at(1300 + offset));
      near(late.at(1300 + offset), nativeLayers(1300 + offset, 1300));
    }
    near(late.at(800), initial);
    assert.equal(duration(1300) - duration(800), 500);
  } finally { early.dispose(); late.dispose(); }
});

test('finite time clamps, invalid settings fail, returned state is isolated and disposal is final', () => {
  const track = createLayerTimeline();
  near(track.at(-500), initial);
  near(track.at(99999), { city: -4, rail: 12, paper: 0, angle: 0, stamp: 1, ink: 1, black: 1 });
  track.at(1400).paper = 99;
  assert.equal(track.at(1400).paper, 18.75);
  for (const bad of [NaN, Infinity, -Infinity]) {
    assert.throws(() => track.at(bad), /time/);
    assert.throws(() => nativeLayers(bad), /time/);
    assert.throws(() => reducedLayers(bad), /time/);
  }
  for (const bad of [-1, 2001, NaN, Infinity]) {
    assert.throws(() => createLayerTimeline(bad), /lead/);
    assert.throws(() => nativeLayers(0, bad), /lead/);
    assert.throws(() => reducedLayers(0, bad), /lead/);
  }
  track.dispose(); track.dispose();
  assert.throws(() => track.at(0), /disposed/);
});

test('reduced motion reveals static layers at readable beats without parallax or overshoot', () => {
  assert.equal(reducedLayers(799).paper, initial.paper);
  for (const time of [800, 1400, 2000]) {
    near(reducedLayers(time), { ...initial, paper: 0, angle: 0, stamp: 1 });
  }
  assert.equal(reducedLayers(2299).ink, 0);
  assert.equal(reducedLayers(2300).ink, 1);
  assert.equal(reducedLayers(4799).black, 0);
  assert.equal(reducedLayers(4800).black, 1);
  assert.equal(reducedLayers(1300, 1300).paper, 0);
});
