import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scenes } from '../src/scenes.ts';
import { cueAt, readSceneLink, sceneImages, sceneLink, visualAt } from '../src/scene.ts';
import { subtitleAt } from '../src/speech.ts';
import { Timeline } from '../src/timeline.ts';

const scene = scenes.find((scene) => scene.id === 'slider')!;
const cue = (id: string) => scene.cues.find((cue) => cue.id === id)!;

test('slider follows the animator with aftermath, route and a new encounter in that order', () => {
  assert.ok(scene);
  assert.equal(scenes[scenes.indexOf(scene) - 1].id, 'animator');
  assert.equal(scenes[scenes.indexOf(scene) + 1].id, 'service');
  assert.equal(scene.duration, 34400);
  assert.equal(scene.opponent, 'Неформала');
  for (const [at, id, image] of [
    [0, 'aftermath', 'aftermath'], [3999, 'aftermath', 'aftermath'],
    [4000, 'passage', 'passage'], [7799, 'passage', 'passage'],
    [7800, 'slide', 'slide'], [11699, 'slide', 'slide'], [11700, 'question', 'dialogue'],
  ] as const) {
    assert.equal(cueAt(scene, at).id, id);
    assert.match(visualAt(scene, at).image, new RegExp(`slider-${image}-v1.webp$`));
  }
  assert.equal(sceneImages(scene).length, 7);
  assert.ok(sceneImages(scene).every((image) => /slider-[a-z]+-v1.webp$/.test(image)));
});

test('aftermath pulls back during continuous narration and holds after both speech and movement', () => {
  const current = cue('aftermath');
  const close = visualAt(scene, 450), middle = visualAt(scene, 1200), full = visualAt(scene, 2100);
  assert.ok(close.camera.scale > middle.camera.scale && middle.camera.scale > full.camera.scale);
  assert.equal(full.camera.scale, 1);
  assert.equal(close.image, full.image);
  assert.ok(subtitleAt(current.speech, 1200).length > 0);
  assert.ok(current.end - Math.max(current.speech.duration, 2100) >= 1000);
  assert.deepEqual(visualAt(scene, 3999), full);
  assert.deepEqual(visualAt(scene, 1200, true), close);
  assert.deepEqual(visualAt(scene, 2100, true), full);
});

test('word misunderstanding pauses on a thinking face; the camera is established before the witness claim', () => {
  const processing = cue('processing');
  assert.equal(cue('normies').end, processing.start);
  assert.equal(processing.end, cue('normally').start);
  assert.equal(processing.speech.duration, 0);
  assert.ok(processing.duration >= 500);
  assert.equal(cue('normally').text, 'Я к тебе нормально обратился.');
  assert.equal(cue('recording').text, 'Камеру не выключай.');
  for (const id of ['recording', 'repeat', 'witness']) {
    assert.equal(visualAt(scene, cue(id).start).camera.scale, 1);
  }
  assert.match(visualAt(scene, cue('recording').start).image, /slider-dialogue-v1.webp$/);
  assert.equal(cue('recording').end, cue('recording-pause').start);
  assert.equal(cue('recording-pause').end, cue('repeat').start);
  assert.ok(cue('recording-pause').duration >= 400);
  assert.match(visualAt(scene, cue('repeat').start).image, /slider-runup-v1.webp$/);
  assert.equal(cue('normies').text, 'Кошмарим нормисов на камеру!');
  assert.match(visualAt(scene, cue('witness').start).image, /slider-angry-v1.webp$/);
  assert.equal(cue('witness').text, 'На этот раз я готов.');
  for (const spoken of scene.cues.filter((cue) => cue.text)) {
    assert.equal(subtitleAt(spoken.speech, spoken.speechDelay! - 1), '');
    assert.equal(subtitleAt(spoken.speech, spoken.duration - 1), spoken.text);
    assert.ok(spoken.duration - spoken.speech.duration >= 400, spoken.id);
    assert.equal(spoken.voice, spoken.speaker.startsWith('Неформал') ? 'officer' : 'boxer');
  }
});

test('final stance is revealed with the title and one brief flash, never during the thought', () => {
  const flash = cue('fight-flash'), fight = cue('fight');
  assert.equal(flash.start, 31900);
  assert.match(visualAt(scene, flash.start - 1).image, /slider-angry-v1.webp$/);
  assert.equal(cueAt(scene, flash.start - 1).fight, undefined);
  assert.equal(flash.fight, true);
  assert.equal(flash.flash, true);
  assert.equal(flash.duration, 120);
  assert.match(visualAt(scene, flash.start).image, /slider-final-v1.webp$/);
  assert.equal(flash.end, fight.start);
  assert.equal(fight.fight, true);
  assert.equal(fight.flash, undefined);
  assert.equal(scene.cues.at(-1), fight);
  assert.deepEqual(scene.events, [{ time: 8700, sound: 'chair' }, { time: 31900, sound: 'impact' }]);
});

test('dialogue preserves whole heads at the beginning, middle and end of each shot', () => {
  for (const [id, bounds] of [
    ['question', { left: .19, right: .28, top: .18, bottom: .34 }],
    ['processing', { left: .19, right: .28, top: .18, bottom: .34 }],
    ['normally', { left: .19, right: .28, top: .18, bottom: .34 }],
    ['normies', { left: .63, right: .76, top: .18, bottom: .34 }],
  ] as const) {
    const current = cue(id);
    for (const offset of [0, current.duration / 2, current.duration - 1]) {
      const { scale, x, y } = visualAt(scene, current.start + offset).camera;
      assert.ok(bounds.left * scale - x / 100 * (scale - 1) >= .02, id);
      assert.ok(bounds.right * scale - x / 100 * (scale - 1) <= .98, id);
      assert.ok(bounds.top * scale - y / 100 * (scale - 1) >= .02, id);
      assert.ok(bounds.bottom * scale - y / 100 * (scale - 1) <= .98, id);
    }
  }
});

test('links, paused pullback, completion and replay retain independent slider state', () => {
  assert.deepEqual(readSceneLink(sceneLink(scene, 1200), scenes), { scene, time: 1200 });
  for (const [value, expected] of [['-1', 0], ['NaN', 0], ['999', 34400]] as const) {
    assert.equal(readSceneLink(`#scene=slider&t=${value}`, scenes).time, expected);
  }
  const player = new Timeline(scene);
  assert.equal(player.playing, false);
  player.seek(1200); player.play(); player.pause();
  const picture = visualAt(scene, player.time);
  player.advance(1000);
  assert.deepEqual(visualAt(scene, player.time), picture);
  player.play(); player.setRate(2); player.advance(scene.duration);
  assert.equal(player.time, scene.duration);
  assert.equal(player.playing, false);
  assert.match(visualAt(scene, player.time).image, /slider-final-v1.webp$/);
  player.play();
  assert.equal(player.time, 0);
  assert.match(visualAt(scene, player.time).image, /slider-aftermath-v1.webp$/);
});

test('the slide is revealed under one continuing line and settles before the next exchange', () => {
  const slide = cue('slide');
  const close = visualAt(scene, slide.start + 550), middle = visualAt(scene, slide.start + 1400);
  const full = visualAt(scene, slide.start + 2300);
  assert.ok(close.camera.scale > middle.camera.scale && middle.camera.scale > full.camera.scale);
  assert.equal(full.camera.scale, 1);
  assert.equal(close.image, full.image);
  assert.ok(.23 * close.camera.scale - close.camera.y / 100 * (close.camera.scale - 1) >= .15);
  assert.ok(.38 * close.camera.scale - close.camera.y / 100 * (close.camera.scale - 1) <= .72);
  assert.ok(.49 * close.camera.scale - close.camera.x / 100 * (close.camera.scale - 1) > 1);
  assert.ok(subtitleAt(slide.speech, 1400).length > subtitleAt(slide.speech, 550).length);
  assert.ok(slide.duration - Math.max(2300, slide.speech.duration) >= 1000);
  assert.deepEqual(visualAt(scene, slide.start + 1400, true), close);
  assert.deepEqual(visualAt(scene, slide.start + 2300, true), full);
});
