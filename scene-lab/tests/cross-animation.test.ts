import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { crossFrame } from '../src/fight/boxer-animation.ts';
import { createFight, idleInput, pauseFight, resumeFight, stepFight } from '../src/fight/model.ts';
import { editCel, moves, resetCels, crossHurt } from '../src/fight/moves.ts';
import { fighterGeometry } from '../src/fight/geometry.ts';

function fighter(time = 0) {
  const f = createFight().player;
  f.action = { kind: 'cross', time, connected: false };
  return f;
}

test('the approved one-drawing cross retains contact and returns to idle at 250 ms', () => {
  for (const [time, expected] of [[0,null],[.099999,null],[.1,0],[.139999,0],[.14,null],[.229999,null],[.23,0],[.249999,0],[.25,null],[.31,null],[.43,null]] as const) {
    assert.equal(crossFrame(fighter(time)), expected, String(time));
  }
  assert.equal(moves.cross.windup, .14); assert.equal(moves.cross.active, .09);
  assert.equal(moves.cross.recovery, .2); assert.equal(moves.cross.damage, 9);
});

test('cross intermediates follow edited phase durations and yield to edited drawings and other states', () => {
  try {
    editCel('cross',0,{duration:.28}); editCel('cross',2,{duration:.16});
    assert.equal(crossFrame(fighter(.199999)),null); assert.equal(crossFrame(fighter(.2)),0);
    assert.equal(crossFrame(fighter(.37)),0); assert.equal(crossFrame(fighter(.409999)),0); assert.equal(crossFrame(fighter(.41)),null);
    editCel('cross',0,{pose:5}); assert.equal(crossFrame(fighter(.24)),null);
    editCel('cross',2,{pose:9}); assert.equal(crossFrame(fighter(.38)),null);
  } finally { resetCels(); }
  for (const patch of [{hp:0},{reaction:'guard' as const},{reaction:'heavy' as const},{hurt:.1},{y:10},{action:null},{action:{kind:'heavy' as const,time:.11,connected:false}}]) {
    const f=fighter(.11); Object.assign(f,patch); assert.equal(crossFrame(f),null);
  }
  const f=fighter(.32);f.crouch=true;assert.equal(crossFrame(f),null);
});

test('the same hurt zones follow both intermediate windows and mirror without active return hitboxes', () => {
  for (const facing of [1,-1] as const) for (const time of [.1,.13999,.23,.24999]) {
    const f=fighter(time);f.x=700;f.facing=facing;
    const g=fighterGeometry(f);assert.equal(g.hit.length,0);assert.equal(g.hurt.length,7);
    for (const [i,b] of crossHurt.entries()) assert.deepEqual(g.hurt[i],{
      left:700+(facing===1?b.left:-b.right),right:700+(facing===1?b.right:-b.left),bottom:b.bottom,top:b.top,
    });
  }
  const f=fighter(.14);f.x=700;
  assert.equal(fighterGeometry(f).hit[0].right,945);
  assert.equal(fighterGeometry(f).hurt.length,4);
  f.action!.time=.25;assert.equal(fighterGeometry(f).hurt.length,3);assert.equal(fighterGeometry(f).hit.length,0);
});

test('pause and hitstop preserve the chosen drawing; the 250 ms visual return does not end recovery', () => {
  const s=createFight('street',true);s.phase='fighting';s.player=fighter(.11);s.worker.stop=10;
  pauseFight(s);stepFight(s,idleInput(),.05);assert.equal(s.player.action!.time,.11);assert.equal(crossFrame(s.player),0);
  resumeFight(s);s.player.stop=.04;stepFight(s,idleInput(),.01);assert.equal(s.player.action!.time,.11);
  s.player.stop=0;s.player.action!.time=.25;
  stepFight(s,{...idleInput(),heavy:true},1/120);assert.equal(s.player.action!.kind,'cross');assert.equal(crossFrame(s.player),null);
  for(let i=0;i<30;i++)stepFight(s,idleInput(),1/120);
  assert.equal(s.player.action,null);
});

test('the runtime asset and registration match the selected preview export', () => {
  const audit=JSON.parse(readFileSync(new URL('../../assets/prototypes/gameplay/cross-keypose-preview/runtime-assets.json',import.meta.url),'utf8'));
  const bytes=readFileSync(new URL('../public/art/fight/cross-hybrid/cross-0.webp',import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),audit.runtime_sha256);
  assert.equal(audit.variant,'one');assert.equal(audit.rgba_matches_preview,true);
  assert.equal(audit.source_sha256,'1772707dbbde76fdc74263a48734323b6e55629d206e2be8adadfcce65168304');
  const manifest=JSON.parse(readFileSync(new URL('../public/art/fight/manifest.json',import.meta.url),'utf8'));
  assert.deepEqual(manifest.cross,[{width:500,height:530,anchorX:228,anchorY:495,scale:1.19}]);
});
