import assert from 'node:assert/strict';
import {test} from 'node:test';
import {poseAt, schedules, duration} from './schedule.mjs';

test('hybrid adds exactly two existing drawings around the original contact pose', () => {
  assert.deepEqual(schedules.hybrid.filter(([, actor]) => actor === 'jab').map(([, , i]) => i), [2, 12]);
  for (const [time, expected] of [[0, ['boxer', 0]], [39.999, ['boxer', 0]], [40, ['jab', 2]], [79.999, ['jab', 2]], [80, ['boxer', 2]], [159.999, ['boxer', 2]], [160, ['jab', 12]], [219.999, ['jab', 12]], [220, ['boxer', 0]]]) {
    assert.deepEqual(poseAt(schedules.hybrid, time).slice(1), expected, `${time}ms`);
  }
});

test('all comparisons share the loop boundary; invalid clocks fail explicitly', () => {
  assert.equal(duration, 340);
  for (const schedule of Object.values(schedules)) {
    for (const time of [-1, 340, 1000]) assert.deepEqual(poseAt(schedule, time), [0, 'boxer', 0]);
    for (const time of [NaN, Infinity, -Infinity]) assert.throws(() => poseAt(schedule, time), RangeError);
    assert.ok(schedule.length > 0);
    assert.equal(schedule[0][0], 0);
    assert.deepEqual(schedule.map(([t]) => t), schedule.map(([t]) => t).sort((a, b) => a - b));
  }
});
