import test from 'node:test';
import assert from 'node:assert/strict';
import { solveTwoBone } from './retarget.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('reachable poses preserve both segment lengths across directions and projected reference lengths',()=>{
 for(const lengths of [[Math.hypot(35,47),Math.hypot(12,-62)],[Math.hypot(66,-4),Math.hypot(64,-6)]]) for(const target of [[47,-15],[80,0],[100,40],[-80,0],[0,-80]]) for(const bend of [-1,1]){
  const shoulder=[15,-10],world=target.map((n,i)=>n+shoulder[i]),r=solveTwoBone(shoulder,world,lengths,bend);
  near(Math.hypot(r.elbow[0]-shoulder[0],r.elbow[1]-shoulder[1]),lengths[0]);near(Math.hypot(r.wrist[0]-r.elbow[0],r.wrist[1]-r.elbow[1]),lengths[1]);assert.equal(r.clamped,false);r.wrist.forEach((n,i)=>near(n,world[i]));
 }
});
test('unreachable and folded targets clamp at the reachable boundary instead of stretching or producing NaN',()=>{
 for(const [lengths,target,distance] of [[[66,64],[1000,0],130-1e-6],[[66,64],[0,0],2+1e-6],[[66,66],[0,0],1e-6]]){
  const r=solveTwoBone([0,0],target,lengths);assert.equal(r.clamped,true);near(Math.hypot(...r.wrist),distance);near(Math.hypot(...r.elbow),lengths[0]);near(Math.hypot(r.wrist[0]-r.elbow[0],r.wrist[1]-r.elbow[1]),lengths[1]);assert.ok([...r.elbow,...r.wrist].every(Number.isFinite));
 }
});
test('mirroring reverses the bend side while keeping the same anatomy and does not mutate inputs',()=>{
 const shoulder=[20,30],target=[90,-10],lengths=[60,65],saved=structuredClone([shoulder,target,lengths]);const a=solveTwoBone(shoulder,target,lengths,1),b=solveTwoBone([-20,30],[-90,-10],lengths,-1);
 near(b.elbow[0],-a.elbow[0]);near(b.elbow[1],a.elbow[1]);near(b.wrist[0],-a.wrist[0]);near(b.wrist[1],a.wrist[1]);assert.deepEqual([shoulder,target,lengths],saved);
});
test('invalid joints, zero or negative lengths and invalid bend fail before producing a pose',()=>{
 for(const args of [[null,[0,0],[1,1]],[[0],[0,0],[1,1]],[[0,0],[NaN,1],[1,1]],[[0,0],[1,1],[0,1]],[[0,0],[1,1],[-1,1]],[[0,0],[1,1],[Infinity,1]],[[0,0],[1,1],[1,1],0]])assert.throws(()=>solveTwoBone(...args),RangeError);
});
