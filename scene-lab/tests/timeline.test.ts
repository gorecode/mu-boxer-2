import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileScene, cueAt, readSceneLink, sceneLink, sceneImages, type Scene } from '../src/scene.ts';
import { Timeline } from '../src/timeline.ts';
import { noiseSamples } from '../src/audio.ts';
import { voiceCurves } from '../src/speech.ts';
import { scenes } from '../src/scenes.ts';

const draft: Scene = {
  id: 'test', title: 'Test', subtitle: '', image: '', imageAlt: '', opponent: '',
  cues: [
    { id: 'a', label: 'A', duration: 1000, text: 'A', speaker: '', camera: { scale: 1, x: 50, y: 50 }, sounds: [{ at: 0, sound: 'paper' }, { at: 500, sound: 'ring' }] },
    { id: 'b', label: 'B', duration: 2000, text: 'B', speaker: '', camera: { scale: 2, x: 0, y: 100 }, sounds: [{ at: 0, sound: 'receiver' }] },
  ],
};
const scene = compileScene(draft);

test('starts paused; exact cue boundaries select the next subtitle', () => {
  const player = new Timeline(scene);
  assert.equal(player.time, 0);
  assert.equal(player.playing, false);
  assert.deepEqual(player.advance(1000), []);
  assert.equal(player.time, 0);
  assert.equal(cueAt(scene, 999).text, 'A');
  assert.equal(cueAt(scene, 1000).text, 'B');
  assert.equal(cueAt(scene, 3000).text, 'B');
});

test('sound intervals are half-open: initial and boundary events play exactly once', () => {
  const player = new Timeline(scene);
  player.play();
  assert.deepEqual(player.advance(500), ['paper']);
  assert.deepEqual(player.advance(500), ['ring']);
  assert.deepEqual(player.advance(1), ['receiver']);
  assert.deepEqual(player.advance(999), []);
});

test('pause preserves position; resume does not repeat sound', () => {
  const player = new Timeline(scene);
  player.play(); player.advance(600); player.pause();
  assert.deepEqual(player.advance(5000), []);
  assert.equal(player.time, 600);
  player.play();
  assert.deepEqual(player.advance(400), []);
  assert.equal(player.time, 1000);
});

test('seek skips sound history; clamps at boundaries; completion stays stopped', () => {
  const player = new Timeline(scene);
  player.seek(-100);
  assert.equal(player.time, 0);
  player.seek(1500); player.play();
  assert.deepEqual(player.advance(10), []);
  player.seek(9000);
  assert.equal(player.time, 3000);
  assert.equal(player.playing, false);
  assert.deepEqual(player.advance(10), []);
  player.play();
  assert.equal(player.time, 0);
  assert.equal(player.playing, true);
});

test('speed changes preserve scene time; overshoot emits crossed sounds and ends once', () => {
  const player = new Timeline(scene);
  player.play(); player.advance(100); player.setRate(2);
  assert.equal(player.time, 100);
  assert.deepEqual(player.advance(10000), ['ring', 'receiver']);
  assert.equal(player.time, 3000);
  assert.equal(player.playing, false);
  assert.deepEqual(player.advance(100), []);
});

test('invalid runtime positions, deltas and playback rates are rejected', () => {
  const player = new Timeline(scene);
  for (const invalid of [NaN, Infinity, -Infinity]) assert.throws(() => player.seek(invalid));
  for (const invalid of [NaN, Infinity, -1]) assert.throws(() => player.advance(invalid));
  for (const invalid of [NaN, 0, -1, 4]) assert.throws(() => player.setRate(invalid));
});

test('malformed scenes fail before playback', () => {
  assert.throws(() => compileScene({ ...draft, cues: [] }));
  assert.throws(() => compileScene({ ...draft, cues: [{ ...draft.cues[0], text: 'Длинная реплика, которая не помещается в секунду.' }] }), /не помещается/);
  assert.throws(() => compileScene({ ...draft, cues: [draft.cues[0], draft.cues[0]] }));
  for (const duration of [0, -1, NaN, Infinity]) {
    assert.throws(() => compileScene({ ...draft, cues: [{ ...draft.cues[0], duration }] }));
  }
  assert.throws(() => compileScene({ ...draft, cues: [{ ...draft.cues[0], camera: { scale: 0, x: 0, y: 0 } }] }));
  for (const at of [-1, 1000, NaN]) {
    assert.throws(() => compileScene({ ...draft, cues: [{ ...draft.cues[0], sounds: [{ at, sound: 'ring' }] }] }));
  }
});

test('share links round-trip, clamp time and tolerate malformed or unknown scenes', () => {
  assert.deepEqual(readSceneLink(sceneLink(scene, 1500), [scene]), { scene, time: 1500 });
  assert.equal(readSceneLink('#scene=test&t=999', [scene]).time, 3000);
  assert.equal(readSceneLink('#scene=test&t=-1', [scene]).time, 0);
  assert.equal(readSceneLink('#scene=test&t=oops', [scene]).time, 0);
  assert.equal(readSceneLink('#scene=unknown&t=2', [scene]).time, 0);
  assert.equal(readSceneLink('#scene=precinct&t=12.3', scenes).time, 12300);
});

test('district-officer scene retains the visual clue before recognition and ends before combat', () => {
  const precinct = scenes.find((scene) => scene.id === 'precinct')!;
  assert.equal(precinct.duration, 31100);
  assert.equal(precinct.cues.length, 11);
  assert.equal(precinct.cues.filter((cue) => cue.text).length, 8);
  assert.equal(sceneImages(precinct).length, 5);
  const report = precinct.cues.find((cue) => cue.id === 'report')!;
  const clue = precinct.cues.find((cue) => cue.id === 'clue')!;
  const shoes = precinct.cues.find((cue) => cue.id === 'shoes')!;
  const recognition = precinct.cues.find((cue) => cue.id === 'recognition')!;
  const thinking = precinct.cues.find((cue) => cue.id === 'thinking')!;
  const refusal = precinct.cues.find((cue) => cue.id === 'refusal')!;
  assert.equal(report.text, 'Рабочего избили? Приметы?');
  assert.equal(report.label, 'Рабочего избили?');
  assert.equal(report.voice, 'officer');
  assert.equal(report.end, clue.start);
  assert.ok(report.speech.duration < report.duration);
  assert.equal(cueAt(precinct, report.end - 1).id, 'report');
  assert.equal(cueAt(precinct, report.end).id, 'clue');
  assert.equal(clue.text, 'Ноги в бетоне?');
  assert.equal(clue.end, shoes.start);
  assert.ok(clue.speech.duration <= clue.duration);
  assert.equal(shoes.end, recognition.start);
  const sit = precinct.cues.find(cue => cue.id === 'sit')!;
  assert.equal(recognition.text, 'Понятно.');
  assert.equal(sit.text, 'Вы пока посидите.');
  assert.ok(recognition.duration - recognition.speech.duration >= 350);
  assert.equal(recognition.end, sit.start);
  assert.equal(sit.end, thinking.start);
  assert.equal(thinking.duration, 1400);
  assert.equal(thinking.text, 'Сидеть?!?');
  assert.equal(thinking.voice, 'boxer');
  assert.equal(thinking.speech.syllables.length, 2);
  assert.ok(thinking.duration - thinking.speech.syllables.at(-1)!.end >= 500);
  assert.ok(voiceCurves(thinking.speech, 900, 1).gain.every((gain) => gain === 0));
  assert.deepEqual(thinking.sounds ?? [], []);
  assert.equal(thinking.end, refusal.start);
  assert.ok(thinking.image?.endsWith('boxer-thinking.webp'));
  assert.ok(refusal.image?.endsWith('boxer-angry.webp'));
  assert.deepEqual(thinking.camera, refusal.camera);
  assert.equal(cueAt(precinct, thinking.end - 1).id, 'thinking');
  assert.equal(cueAt(precinct, thinking.end).id, 'refusal');
  assert.equal(refusal.text, 'Ещё раз я не собираюсь!');
  assert.equal(refusal.voice, 'boxer-angry');
  assert.equal(precinct.opponent, 'Участкового');
  assert.deepEqual(precinct.events.filter((event) => event.time >= thinking.start && event.time < thinking.end), []);
  assert.ok(precinct.events.some((event) => event.time === refusal.start && event.sound === 'impact'));
  assert.equal(precinct.cues.at(-1)?.fight, true);
  assert.equal(precinct.events.filter((event) => event.sound === 'ring').length, 1);
});

test('procedural noise is repeatable, bounded and contains audible signal energy', () => {
  const samples = noiseSamples(4800);
  assert.equal(samples.length, 4800);
  assert.deepEqual(samples, noiseSamples(4800));
  assert.notDeepEqual(samples, noiseSamples(4800, 99));
  let energy = 0;
  for (const sample of samples) { assert.ok(sample >= -1 && sample <= 1); energy += sample * sample; }
  assert.ok(energy / samples.length > 0.25 && energy / samples.length < 0.4);
});
