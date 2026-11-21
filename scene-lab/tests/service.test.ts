import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scenes } from '../src/scenes.ts';
import { cueAt, readSceneLink, sceneImages, sceneLink, visualAt } from '../src/scene.ts';
import { subtitleAt } from '../src/speech.ts';
import { Timeline } from '../src/timeline.ts';

const scene = scenes.find((scene) => scene.id === 'service')!;
const cue = (id: string) => scene.cues.find((cue) => cue.id === id)!;

test('staff entrance directly follows the slider and precedes the renumbered reception without a PVZ scene', () => {
  assert.ok(scene);
  assert.equal(scenes[scenes.indexOf(scene) - 1].id, 'slider');
  const reception = scenes[scenes.indexOf(scene) + 1];
  assert.equal(reception.id, 'queue');
  assert.equal(reception.subtitle, 'Глава 06 · Бабка');
  assert.equal(scene.duration, 34250);
  assert.equal(scene.opponent, 'Стриптизёрши');
  assert.equal(scenes.some((scene) => /pvz|marketplace/i.test(scene.id)), false);
  assert.equal(sceneImages(scene).length, 7);
  assert.ok(sceneImages(scene).every((image) => /service-[a-z]+-v[12].webp$/.test(image)));
  for (const [at, id, image] of [[3999, 'aftermath', 'aftermath'], [4000, 'building', 'building'],
    [7499, 'building', 'building'], [7500, 'staff', 'door'], [11999, 'staff', 'door'], [12000, 'backstage', 'wide']] as const) {
    assert.equal(cueAt(scene, at).id, id);
    assert.match(visualAt(scene, at).image, new RegExp(`service-${image}-v${image === 'door' ? 2 : 1}.webp$`));
  }
});

test('the witness question reveals the aftermath during speech and holds after both camera and narration', () => {
  const question = cue('aftermath');
  assert.equal(question.text, 'Ты снял, что он первый начал?');
  const close = visualAt(scene, 350), middle = visualAt(scene, 1200), full = visualAt(scene, 2000);
  assert.ok(close.camera.scale > middle.camera.scale && middle.camera.scale > full.camera.scale);
  assert.equal(full.camera.scale, 1);
  assert.equal(close.image, full.image);
  assert.ok(subtitleAt(question.speech, 1200).length > 0);
  assert.ok(question.end - Math.max(question.speech.duration, 2000) >= 1000);
  assert.deepEqual(visualAt(scene, 3999), full);
  assert.deepEqual(visualAt(scene, 1200, true), close);
  assert.deepEqual(visualAt(scene, 2000, true), full);
  assert.ok(.43 * close.camera.scale - close.camera.x / 100 * (close.camera.scale - 1) > 1);
});

test('reading, processing and calm dialogue keep independent pauses before the mistaken demonstration', () => {
  assert.equal(cue('documents').text, 'Мне справку взять.');
  assert.equal(cue('staff').speechDelay, 500);
  assert.equal(subtitleAt(cue('staff').speech, 599), '');
  assert.ok(subtitleAt(cue('staff').speech, 750).length > 0);
  const processing = cue('processing');
  assert.equal(cue('dancing').end, processing.start);
  assert.equal(processing.end, cue('audition').start);
  assert.equal(processing.speech.duration, 0);
  assert.ok(processing.duration >= 500);
  assert.match(visualAt(scene, processing.start).image, /service-wide-v1.webp$/);
  for (const spoken of scene.cues.filter((cue) => cue.text)) {
    assert.equal(subtitleAt(spoken.speech, spoken.speechDelay! - 1), '');
    assert.equal(subtitleAt(spoken.speech, spoken.duration - 1), spoken.text);
    assert.ok(spoken.duration - spoken.speech.duration >= 500, spoken.id);
    assert.equal(spoken.voice, spoken.speaker === 'Анжелика' ? 'grandma' : 'boxer');
  }
  assert.equal(cue('thought').text, 'У меня не было времени на танцы.');
  assert.equal(cue('forced').text, 'Я был вынужден показать то, что умею.');
});

test('invitation, thought and anger retain the same wide framing before a distinct final reveal', () => {
  assert.equal(cue('thought').end, cue('reaction').start);
  assert.equal(cue('reaction').speech.duration, 0);
  assert.ok(cue('reaction').duration >= 400);
  for (const id of ['audition', 'thought', 'reaction', 'forced']) {
    const current = cue(id);
    assert.deepEqual(visualAt(scene, current.start).camera, { scale: 1, x: 0, y: 20 });
    assert.deepEqual(visualAt(scene, current.end - 1).camera, visualAt(scene, current.start).camera);
  }
  assert.equal(visualAt(scene, cue('audition').start).image, visualAt(scene, cue('thought').start).image);
  assert.match(visualAt(scene, cue('reaction').start).image, /service-angry-v1.webp$/);
  const flash = cue('fight-flash'), fight = cue('fight');
  assert.equal(flash.start, 31750);
  assert.match(visualAt(scene, flash.start - 1).image, /service-angry-v1.webp$/);
  assert.equal(cueAt(scene, flash.start - 1).fight, undefined);
  assert.match(visualAt(scene, flash.start).image, /service-final-v1.webp$/);
  assert.equal(flash.fight, true);
  assert.equal(flash.flash, true);
  assert.equal(flash.duration, 120);
  assert.equal(flash.end, fight.start);
  assert.equal(cueAt(scene, flash.end - 1).flash, true);
  assert.equal(fight.flash, undefined);
  assert.equal(fight.fight, true);
  assert.equal(scene.cues.at(-1), fight);
  assert.deepEqual(scene.events, [{ time: flash.start, sound: 'impact' }]);
});

test('speaker crops preserve full heads and headroom across the entire dialogue', () => {
  for (const [id, bounds] of [
    ['documents', { left: .20, right: .30, top: .16, bottom: .33 }],
    ['processing', { left: .20, right: .30, top: .16, bottom: .33 }],
    ['closed', { left: .65, right: .76, top: .18, bottom: .34 }],
    ['dancing', { left: .65, right: .76, top: .18, bottom: .34 }],
  ] as const) {
    const current = cue(id);
    for (const offset of [0, current.duration / 2, current.duration - 1]) {
      const { scale, x, y } = visualAt(scene, current.start + offset).camera;
      assert.ok(bounds.left * scale - x / 100 * (scale - 1) >= .02, id);
      assert.ok(bounds.right * scale - x / 100 * (scale - 1) <= .98, id);
      assert.ok(bounds.top * scale - y / 100 * (scale - 1) >= .02, id);
      assert.ok(bounds.bottom * scale - y / 100 * (scale - 1) <= .72, id);
    }
  }
});

test('links clamp malformed times; pause, completion and replay preserve isolated scene state', () => {
  assert.deepEqual(readSceneLink(sceneLink(scene, 1200), scenes), { scene, time: 1200 });
  for (const [value, expected] of [['-1', 0], ['NaN', 0], ['999', 34250]] as const) {
    assert.equal(readSceneLink(`#scene=service&t=${value}`, scenes).time, expected);
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
  assert.match(visualAt(scene, player.time).image, /service-final-v1.webp$/);
  player.play();
  assert.equal(player.time, 0);
  assert.match(visualAt(scene, player.time).image, /service-aftermath-v1.webp$/);
});
