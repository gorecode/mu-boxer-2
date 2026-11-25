import test from 'node:test';
import assert from 'node:assert/strict';
import { source, lengths, distance, contacts, pose, preparation, drive, schedule } from './geometry.mjs';

test('original arm measurements remain within the manually marked native proportions', () => {
  assert(lengths[0] > 70 && lengths[0] < 71);
  assert(lengths[1] > 69 && lengths[1] < 70);
  assert.deepEqual(source, { shoulder: [114,127], elbow: [141,192], wrist: [179,134] });
});

test('all three contacts keep a bent elbow and original bone lengths without stretching', () => {
  for (const contact of contacts) {
    const p = pose(contact.shoulder, contact.target);
    assert(Math.abs(distance(p.shoulder,p.elbow)-lengths[0]) < 1e-8);
    assert(Math.abs(distance(p.elbow,p.wrist)-lengths[1]) < 1e-8);
    assert(p.angle > 85 && p.angle < 115);
    assert(p.wrist[0] > 235);
    assert(p.wrist[1] < p.elbow[1] - 35);
  }
});

test('preparation drops slightly and the hand then travels forward and upwards', () => {
  assert(preparation.wrist[1] > source.wrist[1]);
  assert(preparation.wrist[1] - source.wrist[1] < 15);
  assert(drive.wrist[0] > preparation.wrist[0]);
  assert(drive.wrist[1] < preparation.wrist[1]);
  for (const contact of contacts) {
    assert(contact.target[0] > drive.wrist[0]);
    assert(contact.target[1] < drive.wrist[1]);
  }
});

test('unreachable and invalid poses fail instead of creating a stretched limb', () => {
  assert.throws(() => pose([132,117],[400,50]), /reach/);
  assert.throws(() => pose([NaN,117],[200,50]), RangeError);
  assert.throws(() => pose([132,117],[]), RangeError);
});

test('a short buildup, held contact and fast return produce a closed sparse animation', () => {
  assert.deepEqual(schedule.map(s=>s.duration), [600,40,40,120,20,700]);
  assert.deepEqual(schedule.map(s=>s.key), ['idle','preparation','drive','contact','drive','idle']);
  assert.equal(schedule.filter(s=>s.key==='contact').length,1);
  assert.equal(schedule.reduce((n,s)=>n+s.duration,0),1520);
});
