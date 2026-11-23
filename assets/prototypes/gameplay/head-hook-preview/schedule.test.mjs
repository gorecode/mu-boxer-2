import {test} from 'node:test';
import assert from 'node:assert/strict';
import {schedules,poseAt,stage,durationMs,leadInMs} from './schedule.mjs';
test('0/1/2 count distinct additional drawings and preserve the same original endpoints',()=>{
 assert.deepEqual(Object.values(schedules).map(s=>new Set(s.map(x=>x[1])).size),[2,3,4]);
 for(const s of Object.values(schedules)){
  assert.equal(poseAt(s,-300),'idle');assert.equal(poseAt(s,0),'idle');assert.equal(poseAt(s,169.999),'idle');
  assert.notEqual(poseAt(s,249.999),'contact');assert.equal(poseAt(s,250),'contact');assert.equal(poseAt(s,369.999),'contact');
  assert.notEqual(poseAt(s,370),'contact');assert.equal(poseAt(s,390),'idle');assert.equal(poseAt(s,650),'idle');
 }
});
test('one drawing holds for the same 80 ms occupied by two 40 ms drawings; both return in 20 ms',()=>{
 assert.equal(poseAt(schedules[0],170),'idle');assert.equal(poseAt(schedules[0],370),'idle');
 assert.equal(poseAt(schedules[1],170),'late');assert.equal(poseAt(schedules[1],249.999),'late');
 assert.equal(poseAt(schedules[2],170),'early');assert.equal(poseAt(schedules[2],209.999),'early');
 assert.equal(poseAt(schedules[2],210),'late');assert.equal(poseAt(schedules[2],249.999),'late');
 for(const s of [schedules[1],schedules[2]]){assert.equal(poseAt(s,370),'late');assert.equal(poseAt(s,389.999),'late');}
 assert.equal(durationMs,1200);assert.equal(leadInMs,300);assert.deepEqual(stage,{width:500,height:530,anchorX:228,anchorY:495,scale:1.19});
});
test('invalid time is rejected rather than falling through to a plausible pose',()=>{
 for(const ms of [NaN,Infinity,-Infinity])assert.throws(()=>poseAt(schedules[0],ms),RangeError);
});
