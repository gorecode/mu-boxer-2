import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inversePoint, poses, stage, transformPoint } from './rig.mjs';
import { stride } from './schedule.mjs';

test('the pose set preserves standing feet, lifts the moving foot and keeps the leg order', () => {
  const back = [34, 480], front = [235, 480];
  assert.deepEqual(transformPoint(...back, poses[0]), back);
  assert.deepEqual(transformPoint(...front, poses[0]), front);
  assert.equal(transformPoint(...back, poses[1])[1], 480);
  assert.equal(transformPoint(...front, poses[1])[1], 474);
  assert.equal(transformPoint(...front, poses[3])[1], 480);
  assert.equal(transformPoint(...back, poses[3])[1], 475);
  for (const pose of poses) {
    assert.ok(transformPoint(...back, pose)[0] < transformPoint(...front, pose)[0]);
    assert.ok(transformPoint(...back, pose)[1] === 480 || transformPoint(...front, pose)[1] === 480);
  }
});

test('the rear foot remains at its original world key at lead transfer and landing', () => {
  for (const [i, progress] of [[0, 0], [1, .25], [2, .5]]) {
    const local = transformPoint(34, 480, poses[i])[0];
    assert.ok(Math.abs(progress * stride + (local - 34) * stage.scale) < 1e-9);
  }
  const frontAtLanding = stride / 2 + (transformPoint(235, 480, poses[2])[0] - 235) * stage.scale;
  const frontAtRecovery = stride * .75 + (transformPoint(235, 480, poses[3])[0] - 235) * stage.scale;
  assert.equal(frontAtLanding, stride);
  assert.equal(frontAtRecovery, stride);
});

test('face and guard are translated together without scaling, rotating or changing proportions', () => {
  for (const pose of poses) for (const [x, y] of [[180, 50], [205, 115], [110, 180]]) {
    assert.deepEqual(transformPoint(x, y, pose), [x, y + pose.drop]);
  }
});

test('inverse texture sampling roundtrips the waist, knees, boots and empty margins', () => {
  for (const pose of poses) for (let y = 0; y <= 510; y += 17) for (let x = -60; x <= 350; x += 13) {
    const projected = transformPoint(x, y, pose), restored = inversePoint(...projected, pose);
    assert.ok(Math.hypot(restored[0] - x, restored[1] - y) < .001, `${x},${y}: ${restored}`);
  }
});
