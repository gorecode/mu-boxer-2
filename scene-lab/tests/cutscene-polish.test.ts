import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scenes } from '../src/scenes.ts';
import { compileScene, cueAt, visualAt, type Scene } from '../src/scene.ts';
import { planSpeech, subtitleAt, voiceCurves } from '../src/speech.ts';
import { compileFilm } from '../src/film.ts';
import { createSceneAnimation } from '../src/gsap-scene.ts';

const scene = (id: string) => scenes.find(scene => scene.id === id)!;
const cue = (sceneId: string, id: string) => scene(sceneId).cues.find(cue => cue.id === id)!;

test('departure avoids repeating the already named officer', () => {
  assert.equal(cue('prologue', 'departure').text, 'Я отправился на поиски.');
});

test('repeat question holds offered leaflet; gesture is understood before mistaken narration', () => {
  const animator = scene('animator'), question = cue('animator', 'gesture'), gesture = cue('animator', 'mask-gesture');
  for (const time of [question.start, question.start + question.speech.duration, question.end - 1]) {
    assert.match(visualAt(animator, time).image, /animator-wide-v2.webp$/);
  }
  assert.ok(question.duration - question.speech.duration >= 400);
  assert.equal(question.end, gesture.start);
  assert.equal(gesture.text, '');
  assert.ok(gesture.duration >= 600);
  assert.match(visualAt(animator, gesture.start).image, /animator-gesture-v2.webp$/);
  assert.equal(gesture.end, cue('animator', 'raised-hand').start);
  assert.match(visualAt(animator, gesture.end).image, /animator-gesture-v2.webp$/);
});

test('bag hold and three-part self-exoneration preserve the queue gag', () => {
  const thinking = cue('queue', 'thinking'), but = cue('queue', 'but'), forced = cue('queue', 'forced');
  assert.ok(cue('queue', 'block').duration >= 1800);
  assert.equal(thinking.text, 'Убивать я никого не собирался.');
  assert.ok(thinking.duration - thinking.speech.duration >= 600);
  assert.equal(thinking.end, but.start);
  assert.equal(but.text, 'Но.');
  assert.ok(but.duration - but.speech.duration >= 400);
  assert.equal(visualAt(scene('queue'), but.end - 1).image, thinking.image);
  assert.equal(but.end, forced.start);
  assert.equal(forced.text, 'Она не оставила мне выбора.');
  assert.equal(forced.speechRate, 1.12);
  assert.equal(visualAt(scene('queue'), forced.start).image, forced.image);
  assert.ok(forced.speech.duration < planSpeech(forced.text).duration);
});

test('recognition and mutual threats have independent reaction beats before fight title', () => {
  const bandit = scene('bandit');
  assert.equal(cue('bandit', 'question').text, 'Ты?!?');
  assert.ok(cue('bandit', 'question').duration - cue('bandit', 'question').speech.duration >= 400);
  assert.equal(cue('bandit', 'how').text, 'Как ты здесь?');
  const ids = ['personal', 'processing', 'chief-anger', 'anger', 'face-off', 'fight-fade', 'fight-flash', 'fight'];
  for (let i = 1; i < ids.length; i++) assert.equal(cue('bandit', ids[i - 1]).end, cue('bandit', ids[i]).start);
  for (const id of ['processing', 'chief-anger', 'anger', 'face-off']) {
    assert.equal(cue('bandit', id).text, '');
    assert.equal(cue('bandit', id).fight, undefined);
  }
  const faceOff = cue('bandit', 'face-off'), fade = cue('bandit', 'fight-fade'), title = cue('bandit', 'fight-flash');
  assert.equal(visualAt(bandit, faceOff.start).camera.scale, 1);
  assert.ok(faceOff.duration >= 500);
  assert.deepEqual(fade.blackout, { from: 0, to: .65 });
  assert.equal(cueAt(bandit, title.start - 1).fight, undefined);
  assert.equal(cueAt(bandit, title.start).fight, true);
  assert.equal(title.flash, true);
  assert.match(visualAt(bandit, cue('bandit', 'unanswered').start).image, /bandit-phone-v2.webp$/);
});

test('victory changes location before tomorrow and city reveal waits for the word city', () => {
  const epilogue = scene('epilogue'), tomorrow = cue('epilogue', 'tomorrow'), but = cue('epilogue', 'but'), city = cue('epilogue', 'city');
  assert.equal(tomorrow.text, 'И завтра меня ждёт районный.');
  assert.match(visualAt(epilogue, tomorrow.start).image, /epilogue-doorway-v3.webp$/);
  assert.match(visualAt(epilogue, but.start).image, /epilogue-doorway-tense-v1.webp$/);
  assert.equal(city.text, 'Этот город…');
  const cut = city.shots![1].at;
  const wordVisible = city.speech.letters.find(letter => city.text.slice(0, letter.end).includes('город'))!.at;
  assert.ok(cut > wordVisible);
  assert.ok(cut >= Math.max(...city.speech.syllables.map(syllable => syllable.end)));
  assert.match(visualAt(epilogue, city.start + cut - 1).image, /doorway-tense-v1.webp$/);
  assert.match(visualAt(epilogue, city.start + cut).image, /epilogue-city-v1.webp$/);
  assert.match(subtitleAt(city.speech, cut), /город/);
  assert.equal(cue('epilogue', 'rotten').text, 'Прогнил насквозь.');
  assert.equal(cue('epilogue', 'people').text, 'Эти забулдыги.');
  assert.equal(cue('epilogue', 'officials').text, 'Продажные.');
  assert.equal(cue('epilogue', 'hero').text, 'Нуждаются в новом герое.');
  for (const reduced of [false, true]) {
    assert.equal(visualAt(epilogue, city.start + cut - 1, reduced).image, visualAt(epilogue, city.start, reduced).image);
    assert.match(visualAt(epilogue, city.start + cut, reduced).image, /epilogue-city-v1.webp$/);
  }
});

test('per-cue tempo scales voice and subtitles together, validates errors and survives film compilation', () => {
  const raw: Scene = { id: 'tempo', title: '', subtitle: '', opponent: '', image: 'image.webp', imageAlt: 'test',
    cues: [{ id: 'line', label: '', duration: 4000, speaker: 'Боксёр', text: 'Она не оставила мне выбора.', camera: { scale: 1, x: 50, y: 50 }, speechDelay: 200, speechRate: 1.12 }] };
  const compiled = compileScene(raw), line = compiled.cues[0], plain = planSpeech(line.text);
  assert.equal(line.speech.duration, plain.duration / 1.12 + 200);
  assert.equal(line.speech.letters[0].at, plain.letters[0].at / 1.12 + 200);
  assert.equal(line.speech.syllables[0].end, plain.syllables[0].end / 1.12 + 200);
  assert.deepEqual(line.speech.syllables[0].pitch, plain.syllables[0].pitch);
  assert.equal(subtitleAt(line.speech, line.speech.letters[0].at - 1), '');
  assert.equal(subtitleAt(line.speech, line.speech.duration), line.text);
  assert.equal(voiceCurves(line.speech, line.speech.duration, 1).duration, 0);
  assert.deepEqual(compileFilm([compiled]).scene.cues[0].speech, line.speech);
  for (const speechRate of [0, -1, NaN, Infinity, .49, 2.01]) {
    assert.throws(() => compileScene({ ...raw, cues: [{ ...raw.cues[0], speechRate }] }), /темп/);
  }
  for (const speechRate of [.5, 1, 2]) {
    const result = compileScene({ ...raw, cues: [{ ...raw.cues[0], duration: 10000, speechRate }] });
    assert.ok(result.cues[0].speech.duration <= result.duration);
  }
  assert.throws(() => compileScene({ ...raw, cues: [{ ...raw.cues[0], duration: 300, speechRate: .5 }] }), /не помещается/);
});

test('new reveal and fade remain seekable in both GSAP and assembled film', () => {
  const film = compileFilm(scenes), chapter = film.chapters.find(chapter => chapter.scene.id === 'bandit')!;
  const animation = createSceneAnimation(scene('bandit'));
  try {
    const fade = cue('bandit', 'fight-fade'), title = cue('bandit', 'fight-flash');
    assert.ok(animation.at(fade.start + fade.duration / 2).blackout > 0);
    assert.equal(animation.at(title.start).blackout, 0);
    assert.ok(animation.at(title.start).flash > 0);
    assert.equal(animation.at(title.start, true).flash, 0);
    assert.equal(animation.at(fade.start - 1).blackout, 0);
    for (const id of ['chief-anger', 'anger', 'face-off', 'fight-fade', 'fight-flash']) {
      const current = cue('bandit', id);
      assert.deepEqual(visualAt(film.scene, chapter.start + current.start), visualAt(scene('bandit'), current.start));
    }
  } finally { animation.dispose(); }
});
