import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGsapCamera } from '../src/gsap-camera.ts';
import { scenes } from '../src/scenes.ts';
import { visualAt, type Camera } from '../src/scene.ts';

const scene = scenes.find(scene => scene.id === 'slider')!;
function near(actual: Camera, expected: Camera): void {
  for (const key of ['scale', 'x', 'y'] as const) {
    assert.ok(Math.abs(actual[key] - expected[key]) < 0.000002,
      `${key}: ${actual[key]} ≠ ${expected[key]}`);
  }
}

test('GSAP camera matches native cuts, reveals and holds in either seek direction', () => {
  const track = createGsapCamera(scene);
  try {
    const times = new Set([0, scene.duration]);
    for (let time = 0; time < scene.duration; time += 8) times.add(time);
    for (const cue of scene.cues) {
      for (const offset of [0, ...(cue.shots ?? []).map(shot => shot.at), cue.duration]) {
        for (const delta of [-1, 0, 1]) {
          const time = cue.start + offset + delta;
          if (time >= 0 && time <= scene.duration) times.add(time);
        }
      }
    }
    const ordered = [...times].sort((a, b) => a - b);
    assert.ok(ordered.length > 4000);
    for (const time of [...ordered, ...ordered.toReversed(), 10000, 0, 34400, 1275]) {
      near(track.at(time), visualAt(scene, time).camera);
    }
    near(track.at(1275), { scale: 1.8, x: 0, y: 0 });
    near(track.at(9225), { scale: 1.7, x: 0, y: 12.5 });
    near(track.at(2100), { scale: 1, x: 0, y: 0 });
    near(track.at(3999), { scale: 1, x: 0, y: 0 });
  } finally { track.dispose(); }
});

test('camera clamps finite seeks, rejects invalid time, isolates results and disposes', () => {
  const track = createGsapCamera(scene);
  near(track.at(-1), { scale: 2.6, x: 0, y: 0 });
  near(track.at(scene.duration + 1000), { scale: 1, x: 0, y: 0 });
  for (const time of [NaN, Infinity, -Infinity]) assert.throws(() => track.at(time), /Invalid/);
  track.at(1275).scale = 99;
  near(track.at(1275), { scale: 1.8, x: 0, y: 0 });
  track.dispose();
  track.dispose();
  assert.throws(() => track.at(0), /disposed/);
});

test('editing the existing shot boundary changes movement and hold without a second script', () => {
  const edited = structuredClone(scene);
  edited.cues.find(cue => cue.id === 'slide')!.shots![2].at = 2800;
  const track = createGsapCamera(edited);
  try {
    near(track.at(9475), { scale: 1.7, x: 0, y: 12.5 });
    near(track.at(10600), { scale: 1, x: 0, y: 0 });
    near(track.at(11699), { scale: 1, x: 0, y: 0 });
    assert.notEqual(track.at(10000).scale, visualAt(scene, 10000).camera.scale);
  } finally { track.dispose(); }
});
