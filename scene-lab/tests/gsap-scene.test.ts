import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSceneAnimation } from '../src/gsap-scene.ts';
import { scenes } from '../src/scenes.ts';
import { blackoutAt, visualAt } from '../src/scene.ts';

test('every scene preserves authored camera and blackout across arbitrary forward and backward seeks', () => {
  assert.equal(scenes.length, 10);
  for (const scene of scenes) {
    const animation = createSceneAnimation(scene);
    try {
      const times = new Set([0, scene.duration]);
      for (let time = 0; time < scene.duration; time += 31) times.add(time);
      for (const cue of scene.cues) {
        for (const offset of [0, cue.duration, ...(cue.shots ?? []).map(shot => shot.at)]) {
          for (const delta of [-1, 0, 1]) times.add(Math.max(0, Math.min(scene.duration, cue.start + offset + delta)));
        }
      }
      const ordered = [...times].sort((a, b) => a - b);
      assert.ok(ordered.length > 500);
      for (const time of [...ordered, ...ordered.toReversed(), 0, scene.duration, 0]) {
        const frame = animation.at(time);
        const expected = visualAt(scene, time).camera;
        for (const key of ['scale', 'x', 'y'] as const) {
          assert.ok(Math.abs(frame.camera[key] - expected[key]) < 0.000003, `${scene.id} ${time} ${key}`);
        }
        assert.ok(Math.abs(frame.blackout - blackoutAt(scene, time)) < 0.000003, `${scene.id} ${time} blackout`);
        assert.deepEqual(animation.at(time, true).camera, visualAt(scene, time, true).camera);
      }
    } finally { animation.dispose(); }
  }
});

test('all seven fight entries flash on the title boundary, settle once and respect reduced motion', () => {
  let fights = 0;
  for (const scene of scenes) {
    const animation = createSceneAnimation(scene);
    try {
      for (const [index, cue] of scene.cues.entries()) {
        if (!cue.fight || scene.cues[index - 1]?.fight) continue;
        fights++;
        assert.equal(animation.at(cue.start - 1).flash, 0, scene.id);
        assert.equal(animation.at(cue.start).flash, 0.8, scene.id);
        assert.ok(animation.at(cue.start + 60).flash > 0, scene.id);
        assert.equal(animation.at(cue.start + 120).flash, 0, scene.id);
        assert.equal(animation.at(cue.start).fightScale, 0.94, scene.id);
        assert.equal(animation.at(cue.start + 320).fightScale, 1, scene.id);
        const reduced = animation.at(cue.start, true);
        assert.equal(reduced.flash, 0);
        assert.equal(reduced.fightScale, 1);
        assert.equal(reduced.fightY, 0);
        const next = scene.cues[index + 1];
        if (next?.fight) {
          assert.equal(animation.at(next.start).flash, 0, scene.id);
          assert.ok(animation.at(next.start).fightScale > 0.99, scene.id);
        }
      }
    } finally { animation.dispose(); }
  }
  assert.equal(fights, 7);
});

test('titles reveal without replaying on seek; invalid time and disposed animation fail', () => {
  const scene = scenes.find(scene => scene.id === 'epilogue')!;
  const title = scene.cues.find(cue => cue.titleCard)!;
  const animation = createSceneAnimation(scene);
  assert.equal(animation.at(title.start).titleOpacity, 0);
  assert.equal(animation.at(title.start + 450).titleOpacity, 1);
  assert.equal(animation.at(title.start, true).titleOpacity, 1);
  assert.equal(animation.at(-100).blackout, 0);
  assert.equal(animation.at(scene.duration + 100).blackout, 1);
  animation.at(0).camera.scale = 99;
  assert.notEqual(animation.at(0).camera.scale, 99);
  for (const value of [NaN, Infinity, -Infinity]) assert.throws(() => animation.at(value), /Invalid/);
  animation.dispose(); animation.dispose();
  assert.throws(() => animation.at(0), /disposed/);
});
