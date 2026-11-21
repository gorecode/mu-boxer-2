import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scenes } from '../src/scenes.ts';
import { blackoutAt, compileScene, cueAt, sceneImages, visualAt } from '../src/scene.ts';
import { subtitleAt } from '../src/speech.ts';
import { Timeline } from '../src/timeline.ts';
import { compileFilm } from '../src/film.ts';

const bandit = scenes.find(scene => scene.id === 'bandit')!;
const epilogue = scenes.find(scene => scene.id === 'epilogue')!;
const cue = (id: string) => bandit.cues.find(cue => cue.id === id)!;
const ending = (id: string) => epilogue.cues.find(cue => cue.id === id)!;

test('lunch explains the trip to the chief with separate readable thoughts and a real pause', () => {
  assert.deepEqual(scenes.slice(-3).map(scene => scene.id), ['queue', 'bandit', 'epilogue']);
  assert.equal(bandit.duration, 32150);
  assert.equal(epilogue.duration, 53650);
  assert.equal(bandit.opponent, 'Бандита');
  assert.equal(sceneImages(bandit).length, 6);
  assert.equal(sceneImages(epilogue).length, 13);
  assert.deepEqual(bandit.cues.filter(cue => cue.text).map(cue => cue.text), [
    'Наконец-то я добрался до окошка.', 'Но оно уже было закрыто.', 'Поэтому.', 'Я пошёл к начальнику.',
    'Ты?! Как ты здесь…', 'На этот раз ты сядешь надолго.', 'Там не ответят.', 'Тогда я разберусь с тобой по-своему.',
  ]);
  for (const scene of [bandit, epilogue]) for (const spoken of scene.cues.filter(cue => cue.text)) {
    assert.ok(spoken.duration - spoken.speech.duration >= 400, spoken.id);
    assert.equal(subtitleAt(spoken.speech, spoken.duration - 1), spoken.text);
  }
  assert.ok(cue('queue-aftermath').duration - 2100 >= 1000);
  assert.ok(cue('lunch').duration - cue('lunch').speech.duration >= 500);
  assert.ok(cue('therefore').duration - cue('therefore').speech.duration >= 500);
  assert.equal(cue('lunch').end, cue('therefore').start);
  assert.equal(cue('therefore').end, cue('chief-door').start);
  assert.equal(cue('recognition').end, cue('question').start);
  for (const id of ['lunch', 'therefore']) assert.match(visualAt(bandit, cue(id).start).image, /queue-v2.webp$/);
  assert.match(visualAt(bandit, cue('chief-door').start).image, /door-v1.webp$/);
  assert.match(visualAt(bandit, cue('recognition').start).image, /office-v2.webp$/);
});

test('unanswered calls precede the knowing reply and the receiver returns before the personal threat', () => {
  assert.deepEqual(bandit.events.filter(event => event.sound === 'ringback'), [
    { time: cue('unanswered').start + 150, sound: 'ringback' },
    { time: cue('unanswered').start + 1150, sound: 'ringback' },
  ]);
  assert.equal(bandit.events.some(event => event.sound === 'ring'), false);
  assert.match(visualAt(bandit, cue('unanswered').start).image, /bandit-phone-v1.webp$/);
  assert.match(visualAt(bandit, cue('no-answer').end - 1).image, /bandit-phone-v1.webp$/);
  assert.match(visualAt(bandit, cue('hang-up').start).image, /bandit-office-v2.webp$/);
  assert.equal(cue('hang-up').speech.duration, 0);
  assert.ok(cue('hang-up').duration >= 500);
  assert.equal(cue('personal').start, cue('hang-up').end);
});

test('Boxer anger then Bandit anger precede the synchronized flash and wide fight title', () => {
  assert.equal(cue('processing').end, cue('anger').start);
  assert.equal(cue('anger').end, cue('chief-anger').start);
  assert.equal(cue('chief-anger').end, cue('fight-flash').start);
  assert.ok(cue('chief-anger').duration >= 800);
  assert.match(visualAt(bandit, cue('anger').start).image, /angry-v1.webp$/);
  assert.ok(visualAt(bandit, cue('chief-anger').start).camera.scale > 2);
  const flash = cue('fight-flash');
  assert.equal(cueAt(bandit, flash.start - 1).fight, undefined);
  assert.equal(cueAt(bandit, flash.start).fight, true);
  assert.equal(cueAt(bandit, flash.end - 1).flash, true);
  assert.equal(cueAt(bandit, flash.end).flash, undefined);
  assert.equal(visualAt(bandit, flash.start).camera.scale, 1);
  assert.deepEqual(flash.sounds, [{ at: 0, sound: 'impact' }]);
  for (const id of ['question', 'prison', 'personal', 'processing', 'anger', 'chief-anger']) {
    const bounds = id === 'chief-anger' ? [.67, .78, .20, .34] :
      ['prison', 'personal'].includes(id) ? [.66, .76, .23, .37] : [.16, .25, .19, .35];
    const { scale, x, y } = cue(id).camera;
    assert.ok(bounds[0] * scale - x / 100 * (scale - 1) >= .02, id);
    assert.ok(bounds[1] * scale - x / 100 * (scale - 1) <= .98, id);
    assert.ok(bounds[2] * scale - y / 100 * (scale - 1) >= .15, id);
    assert.ok(bounds[3] * scale - y / 100 * (scale - 1) <= .78, id);
  }
});

test('the epilogue reveals the winner from the defeated chief and preserves one continuous narration', () => {
  const start = visualAt(epilogue, 0), middle = visualAt(epilogue, 1500), full = visualAt(epilogue, 2800);
  assert.equal(start.camera.x, 100);
  assert.equal(start.camera.y, 65);
  assert.ok(start.camera.scale > middle.camera.scale && middle.camera.scale > full.camera.scale);
  assert.equal(full.camera.scale, 1);
  assert.equal(start.image, full.image);
  assert.ok(ending('won').duration - Math.max(2800, ending('won').speech.duration) >= 1000);
  assert.deepEqual(visualAt(epilogue, 1500, true).camera, start.camera);
  assert.deepEqual(visualAt(epilogue, 2800, true), full);
});

test('the city and the extra accusation have their own panels before the paper is discarded', () => {
  assert.deepEqual(epilogue.cues.filter(cue => cue.text).map(cue => cue.text), [
    'Сегодня свой турнир по боксу я выиграл.', 'И завтра выиграю районный.', 'Но…',
    'Этот город прогнил насквозь.', 'Все эти люди.', 'Продажные чиновники.', 'Судьи.', 'Бандиты.',
    'Дьяволопоклонники.', 'Этому городу нужен новый герой.', 'Который научит ценить и уважать закон…',
    'И порядок.', 'Этот город ещё скажет мне спасибо.', 'За ВСЁ.',
  ]);
  for (const [id, image] of [['city', 'epilogue-city-v1'], ['people', 'worker-wide-v2'], ['officials', 'precinct-idle'],
    ['judges', 'intro-court-v2'], ['bandits', 'animator-wide-v2'], ['devil-worshippers', 'slider-dialogue-v1'],
    ['hero', 'epilogue-doorway-v3'], ['law', 'epilogue-crumple-v2'], ['discard', 'epilogue-discard-v2']]) {
    const current = ending(id);
    assert.match(visualAt(epilogue, current.start).image, new RegExp(`${image}.webp$`));
    assert.equal(current.flash, undefined);
  }
  assert.equal(ending('law').end, ending('discard').start);
  assert.equal(ending('discard').end, ending('order').start);
  assert.equal(ending('discard').text, '');
  assert.ok(epilogue.cues.every(cue => !cue.fight && (!cue.text || cue.voice === 'boxer')));
});

test('gratitude, silent pause, changed face and final emphasis precede siren, fade and credits', () => {
  const ids = ['order', 'thanks', 'thanks-pause', 'last-anger', 'everything', 'siren', 'fade', 'end'];
  for (let i = 1; i < ids.length; i++) assert.equal(ending(ids[i - 1]).end, ending(ids[i]).start);
  assert.match(visualAt(epilogue, ending('thanks-pause').start).image, /epilogue-vow-v1.webp$/);
  assert.match(visualAt(epilogue, ending('last-anger').start).image, /epilogue-vow-angry-v1.webp$/);
  assert.ok(ending('thanks-pause').duration >= 700);
  assert.ok(ending('last-anger').duration >= 500);
  assert.equal(ending('thanks-pause').speech.duration, 0);
  assert.equal(ending('last-anger').speech.duration, 0);
  assert.deepEqual(epilogue.events, [{ time: ending('discard').start, sound: 'paper' }, { time: ending('siren').start, sound: 'siren' }]);
  assert.equal(ending('end').titleCard?.title, 'КОНЕЦ');
  assert.equal(ending('fade').titleCard, undefined);
});

test('blackout is timeline driven through seek, speed, pause, chapter composition and replay', () => {
  const fade = ending('fade'), player = new Timeline(epilogue);
  assert.equal(blackoutAt(epilogue, fade.start - 1), 0);
  assert.equal(blackoutAt(epilogue, fade.start), 0);
  assert.equal(blackoutAt(epilogue, fade.start + fade.duration / 2), .5);
  assert.equal(blackoutAt(epilogue, fade.end), 1);
  assert.equal(blackoutAt(epilogue, epilogue.duration), 1);
  player.seek(fade.start); player.setRate(2); player.play(); player.advance(fade.duration / 4); player.pause();
  assert.equal(blackoutAt(epilogue, player.time), .5);
  player.advance(1000);
  assert.equal(blackoutAt(epilogue, player.time), .5);
  player.seek(ending('siren').start + 1); player.play();
  assert.deepEqual(player.advance(100), []);
  player.seek(epilogue.duration); player.play();
  assert.equal(blackoutAt(epilogue, player.time), 0);
  const film = compileFilm(scenes), offset = film.chapters.at(-1)!.start;
  assert.equal(blackoutAt(film.scene, offset + fade.start + 850), .5);
  assert.equal(blackoutAt(film.scene, offset - 1), 0);
});

test('blackout validation rejects non-finite and out-of-range endpoints before playback', () => {
  for (const value of [-.01, 1.01, NaN, Infinity]) for (const endpoint of ['from', 'to']) {
    assert.throws(() => compileScene({ ...epilogue, cues: [{ ...ending('fade'), blackout: { from: 0, to: 1, [endpoint]: value } }] }), /затемнение/);
  }
  assert.equal(blackoutAt(compileScene({ ...epilogue, cues: [{ ...ending('fade'), blackout: { from: 1, to: 0 } }] }), 850), .5);
});
