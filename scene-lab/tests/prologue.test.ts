import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scenes } from '../src/scenes.ts';
import { cueAt, readSceneLink, sceneImages, sceneLink, visualAt } from '../src/scene.ts';
import { planSpeech, subtitleAt } from '../src/speech.ts';
import { Timeline } from '../src/timeline.ts';

const scene = scenes.find((scene) => scene.id === 'prologue')!;
const named = (id: string) => scene.cues.find((cue) => cue.id === id)!;

test('prologue follows the recap in the review list and has isolated seekable links', () => {
  assert.deepEqual(scenes.map((scene) => scene.id), ['intro', 'prologue', 'worker', 'precinct', 'animator', 'slider', 'service', 'queue', 'bandit', 'epilogue']);
  assert.equal(readSceneLink('', scenes).scene.id, 'intro');
  assert.equal(scene.duration, 27300);
  assert.deepEqual(readSceneLink(sceneLink(scene, 24500), scenes), { scene, time: 24500 });
  assert.equal(readSceneLink('#scene=prologue&t=999', scenes).time, scene.duration);
  assert.equal(readSceneLink('#scene=prologue&t=-1', scenes).time, 0);
  assert.equal(readSceneLink('#scene=prologue&t=NaN', scenes).time, 0);
  assert.equal(scenes.find((scene) => scene.id === 'intro')!.duration, 64254);
  assert.equal(scenes.find((scene) => scene.id === 'precinct')!.duration, 31100);
});

test('the approved setup uses only calm boxer narration and ends before an encounter', () => {
  assert.deepEqual(scene.cues.map((cue) => cue.text), [
    'Я готовился к районному турниру.', 'Он должен был состояться завтра.',
    'Но для участия мне нужна была справка об отсутствии судимости.',
    'Где её получить, я не знал.', 'Решил спросить у участкового.',
    'Времени оставалось мало.', 'Я отправился искать участкового.',
  ]);
  assert.equal(scene.opponent, '');
  for (const cue of scene.cues) {
    assert.equal(cue.voice, 'boxer');
    assert.equal(cue.speaker, 'Боксёр · рассказ');
    assert.ok(!cue.fight && !cue.titleCard);
    assert.ok(cue.duration > cue.speech.duration);
    const plain = planSpeech(cue.text, cue.voice), delay = cue.speechDelay!;
    assert.equal(cue.speech.duration, plain.duration + delay);
    assert.equal(subtitleAt(cue.speech, delay - 1), '');
    assert.equal(subtitleAt(cue.speech, cue.duration - 1), cue.text);
  }
});

test('four illustrations preload and the same reference portrait spans both thoughts', () => {
  assert.deepEqual(sceneImages(scene).map((src) => src.split('/').at(-1)), [
    'intro-gym-v4.webp', 'prologue-notice-v1.webp', 'prologue-thinking-v1.webp', 'prologue-exit-v1.webp',
  ]);
  assert.equal(visualAt(scene, named('uncertainty').start).image, visualAt(scene, named('decision').end - 1).image);
  assert.match(visualAt(scene, named('urgency').start).image, /prologue-exit-v1.webp$/);
  assert.match(visualAt(scene, scene.duration).image, /prologue-exit-v1.webp$/);
});

test('notice pans from tomorrow to the certificate without a jump at the phrase boundary', () => {
  const tomorrow = named('tomorrow'), certificate = named('certificate');
  const settled = visualAt(scene, tomorrow.end - 1);
  assert.deepEqual(visualAt(scene, certificate.start).camera, settled.camera);
  const moving = visualAt(scene, certificate.start + 700);
  assert.ok(moving.camera.y > settled.camera.y && moving.camera.y < 100);
  assert.ok(subtitleAt(certificate.speech, 700).length > 0);
  const bottom = visualAt(scene, certificate.start + 1400);
  assert.equal(bottom.camera.y, 100);
  assert.deepEqual(visualAt(scene, certificate.end - 1), bottom);
  assert.deepEqual(visualAt(scene, certificate.start + 700, true).camera, settled.camera);
  assert.deepEqual(visualAt(scene, certificate.start + 1400, true), bottom);
});

test('the silhouette continues across phrases then holds after narration before completion', () => {
  const urgency = named('urgency'), departure = named('departure');
  assert.deepEqual(visualAt(scene, urgency.end - 1).camera, visualAt(scene, departure.start).camera);
  const player = new Timeline(scene);
  player.seek(departure.start + 1500); player.play(); player.pause();
  const middle = visualAt(scene, player.time);
  player.advance(1000);
  assert.deepEqual(visualAt(scene, player.time), middle);
  const hold = Math.max(departure.speech.duration, departure.shots!.at(-1)!.at);
  assert.ok(departure.duration - hold >= 1000);
  const final = visualAt(scene, departure.start + hold);
  assert.deepEqual(visualAt(scene, scene.duration - 1), final);
  assert.deepEqual(visualAt(scene, scene.duration), final);
  assert.equal(cueAt(scene, urgency.end).id, 'departure');
  player.seek(scene.duration); player.play();
  assert.equal(player.time, 0);
  player.advance(scene.duration + 1);
  assert.equal(player.playing, false);
});
