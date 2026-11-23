import {test} from 'node:test';
import assert from 'node:assert/strict';
import {schedules,poseAt,stage} from './schedule.mjs';
test('all variants retain the original preparation/contact boundaries and return to stance',()=>{
 for(const s of Object.values(schedules)) {
  assert.equal(poseAt(s,-300),'idle');assert.equal(poseAt(s,99.999),'idle');
  assert.equal(poseAt(s,139.999),s===schedules.original?'idle':'outgoing');
  assert.equal(poseAt(s,140),'contact');assert.equal(poseAt(s,229.999),'contact');
  assert.equal(poseAt(s,250),'idle');assert.equal(poseAt(s,430),'idle');assert.equal(poseAt(s,900),'idle');
 }
});
test('the sparse variants add exactly one or two distinct drawings, with a 20 ms visual return',()=>{
 assert.deepEqual(Object.values(schedules).map(s=>new Set(s.map(x=>x[1])).size),[2,3,4]);
 assert.equal(poseAt(schedules.one,230),'outgoing');assert.equal(poseAt(schedules.one,249.999),'outgoing');
 assert.equal(poseAt(schedules.two,230),'return');assert.equal(poseAt(schedules.two,249.999),'return');
 assert.deepEqual(stage,{width:500,height:530,anchorX:228,anchorY:495,scale:1.19});
});
