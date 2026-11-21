import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileFilm, chapterAt } from '../src/film.ts';
import { compileScene, cueAt, sceneImages, visualAt, readSceneLink, sceneLink } from '../src/scene.ts';
import { Timeline } from '../src/timeline.ts';
import { scenes } from '../src/scenes.ts';

const camera = { scale: 1, x: 50, y: 50 };
const a = compileScene({ id: 'a', title: 'A', subtitle: 'A', image: 'a.webp', imageAlt: 'A', opponent: 'A',
  cues: [{ id: 'same', label: 'A', image: 'a-cue.webp', speaker: 'A', text: 'A.', duration: 1000, camera, fight: true,
    sounds: [{ at: 999, sound: 'paper' }] }] });
const b = compileScene({ id: 'b', title: 'B', subtitle: 'B', image: 'b.webp', imageAlt: 'B', opponent: 'B',
  cues: [{ id: 'same', label: 'B', speaker: 'B', text: 'B.', duration: 1200, camera,
    sounds: [{ at: 0, sound: 'receiver' }],
    shots: [{ at: 0, image: 'detail.webp', imageAlt: 'Detail', camera, cameraEnd: { scale: 2, x: 50, y: 50 } }] }] });
const film = compileFilm([a, b]);

test('composition gives colliding cues unique ids without changing scene timing, speech or source art defaults', () => {
  assert.equal(film.scene.duration, 2200);
  assert.deepEqual(film.scene.cues.map(cue => cue.id), ['a/same', 'b/same']);
  assert.deepEqual(film.scene.events, [{ time: 999, sound: 'paper' }, { time: 1000, sound: 'receiver' }]);
  assert.deepEqual(film.scene.cues[0].speech, a.cues[0].speech);
  assert.deepEqual(film.scene.cues[1].speech, b.cues[0].speech);
  assert.equal(film.scene.cues[0].image, 'a-cue.webp');
  assert.equal(film.scene.cues[1].image, 'b.webp');
  assert.equal(film.scene.cues[1].imageAlt, 'B');
  assert.deepEqual(sceneImages(film.scene), ['a.webp', 'a-cue.webp', 'b.webp', 'detail.webp']);
  assert.equal(a.cues[0].id, 'same');
  assert.equal(b.cues[0].start, 0);
  assert.equal(b.cues[0].image, undefined);
  assert.deepEqual(visualAt(film.scene, 1600), visualAt(b, 600));
  assert.deepEqual(visualAt(film.scene, 1600, true), visualAt(b, 600, true));
});

test('one play gesture passes a fight card and the exact chapter boundary with each sound once', () => {
  const timeline = new Timeline(film.scene);
  assert.equal(timeline.playing, false);
  timeline.play();
  assert.deepEqual(timeline.advance(1000), ['paper']);
  assert.equal(timeline.playing, true);
  assert.equal(cueAt(film.scene, 1000).id, 'b/same');
  assert.deepEqual(timeline.advance(1), ['receiver']);
  assert.deepEqual(timeline.advance(100), []);
  assert.equal(chapterAt(film, 999).scene.id, 'a');
  assert.equal(chapterAt(film, 1000).scene.id, 'b');
  assert.equal(chapterAt(film, 2200).scene.id, 'b');
  assert.equal(chapterAt(film, -1).scene.id, 'a');
});

test('global seek, pause, rate, completion, replay and shared links use the same film clock', () => {
  const timeline = new Timeline(film.scene);
  timeline.seek(1500); timeline.play(); timeline.setRate(2); timeline.pause();
  assert.deepEqual(timeline.advance(1000), []);
  assert.equal(timeline.time, 1500);
  timeline.play();
  assert.deepEqual(timeline.advance(10000), []);
  assert.equal(timeline.time, 2200);
  assert.equal(timeline.playing, false);
  assert.deepEqual(timeline.advance(1), []);
  timeline.play();
  assert.equal(timeline.time, 0);
  assert.equal(timeline.rate, 2);
  assert.equal(cueAt(film.scene, timeline.time).id, 'a/same');
  assert.deepEqual(readSceneLink(sceneLink(film.scene, 1500), [a, b, film.scene]), { scene: film.scene, time: 1500 });
  assert.equal(readSceneLink('#scene=film&t=9999', [film.scene]).time, 2200);
  assert.equal(readSceneLink('#scene=film&t=oops', [film.scene]).time, 0);
});

test('empty, duplicate and recursively nested film inputs are rejected rather than producing an ambiguous montage', () => {
  assert.throws(() => compileFilm([]), /непустой/);
  assert.throws(() => compileFilm([a, a]), /уникальных/);
  assert.throws(() => compileFilm([film.scene]), /уникальных/);
  assert.throws(() => chapterAt(film, NaN), /позиция/);
});

test('the production film retains all ten ordered chapters and identical pictures on both sides of every cut', () => {
  const production = compileFilm(scenes);
  assert.equal(production.chapters.length, 10);
  assert.deepEqual(production.chapters.map(chapter => chapter.scene.id),
    ['intro', 'prologue', 'worker', 'precinct', 'animator', 'slider', 'service', 'queue', 'bandit', 'epilogue']);
  assert.equal(production.scene.duration, scenes.reduce((sum, scene) => sum + scene.duration, 0));
  for (const chapter of production.chapters) {
    assert.equal(chapterAt(production, chapter.start).scene, chapter.scene);
    assert.deepEqual(visualAt(production.scene, chapter.start), visualAt(chapter.scene, 0));
    assert.deepEqual(visualAt(production.scene, chapter.end - 1), visualAt(chapter.scene, chapter.scene.duration - 1));
    assert.equal(cueAt(production.scene, chapter.start).start, chapter.start);
  }
  assert.equal(cueAt(production.scene, production.scene.duration).titleCard?.title, 'КОНЕЦ');
});
