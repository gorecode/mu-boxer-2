import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scenes } from '../src/scenes.ts';
import { compileScene, cueAt, readSceneLink, sceneImages, sceneLink, visualAt } from '../src/scene.ts';
import { planSpeech, subtitleAt, voiceCurves } from '../src/speech.ts';
import { Timeline } from '../src/timeline.ts';

const intro = scenes[0];
const named = (id: string) => intro.cues.find((cue) => cue.id === id)!;

test('the narrated intro opens by default and retains links to the other scenes', () => {
  assert.equal(intro.id, 'intro');
  assert.equal(scenes.length, 10);
  assert.deepEqual(readSceneLink('', scenes), { scene: intro, time: 0 });
  assert.deepEqual(readSceneLink('#scene=unknown&t=30', scenes), { scene: intro, time: 0 });
  assert.equal(readSceneLink('#scene=intro&t=NaN', scenes).time, 0);
  assert.equal(readSceneLink('#scene=intro&t=999', scenes).time, intro.duration);
  assert.equal(readSceneLink(sceneLink(intro, 29000), scenes).time, 29000);
  for (const [id, duration] of [['precinct', 31100], ['queue', 40000]] as const) {
    const linked = readSceneLink(`#scene=${id}&t=2`, scenes);
    assert.equal(linked.scene.id, id);
    assert.equal(linked.scene.duration, duration);
    assert.equal(linked.time, 2000);
  }
});

test('the approved words survive the new thought boundaries and calm narration', () => {
  const normalized = (text: string) => text.replace(/[.,…]/gu, ' ').replace(/\s+/gu, ' ').trim();
  assert.equal(normalized(intro.cues.map((cue) => cue.text).join(' ')), normalized(
    'Когда-то убили моего лучшего друга. А пистолет нашли у меня в кармане. Как он туда попал, я не знал. ' +
    'Суд не стал слушать. И меня посадили в тюрьму. Но я сбежал. И вернулся в Москву, чтобы найти убийцу. ' +
    'Но весь мир был против меня. Каждый встречный пытался мне помешать. ' +
    'Я никому не хотел причинять зла. Но был вынужден. ' +
    'Преодолев все трудности, я добрался до мерзавца, который меня подставил. ' +
    'Меня оправдали. Я снова стал заниматься боксом.'));
  const spoken = intro.cues.filter((cue) => cue.text);
  assert.ok(spoken.length > 0);
  for (const cue of spoken) {
    assert.equal(cue.speaker, 'Боксёр · рассказ');
    assert.equal(cue.voice, 'boxer');
    assert.ok(cue.speech.duration > 0 && cue.speech.duration < cue.duration);
  }
  assert.ok(intro.cues.every((cue) => !cue.fight && !cue.titleCard));
  assert.match(visualAt(intro, intro.duration).image, /intro-gym-v4.webp$/);
});

test('a thought finishes before its pause and the court subtitle clears before imprisonment', () => {
  for (const [id, minimum] of [['murder', 850], ['pocket', 900], ['court', 700], ['no-harm', 1100], ['acquittal', 700]] as const) {
    const cue = named(id);
    assert.ok(cue.duration - cue.speech.duration >= minimum, id);
    assert.equal(subtitleAt(cue.speech, cue.duration - 1), cue.text);
  }
  const court = named('court'), silence = named('court-silence'), prison = named('prison');
  assert.equal(court.text, 'Суд не стал слушать.');
  assert.equal(silence.start, court.end);
  assert.equal(silence.end, prison.start);
  assert.equal(silence.duration, 490);
  assert.equal(silence.text, '');
  assert.equal(silence.speech.duration, 0);
  assert.equal(prison.text, 'И меня посадили в тюрьму.');
  assert.equal(cueAt(intro, court.end - 1), court);
  assert.equal(cueAt(intro, court.end), silence);
  const noHarm = named('no-harm');
  assert.match(visualAt(intro, noHarm.end - 1).image, /boxer-angry.webp$/);
  assert.match(visualAt(intro, noHarm.end).image, /intro-woman-after-v5.webp$/);
  assert.ok(named('forced').speechDelay! >= 630);
});

test('the gun zoom and pan to the face are continuous, settle, and precede the next thought', () => {
  const pistol = named('pistol'), pocket = named('pocket'), recognition = named('recognition');
  assert.deepEqual(visualAt(intro, pistol.start + 1504).camera, { scale: 1, x: 50, y: 50 });
  const moving = visualAt(intro, pistol.start + 2300).camera;
  assert.ok(moving.scale > 1 && moving.scale < 2.5);
  const gun = visualAt(intro, pistol.end - 1).camera;
  assert.deepEqual(visualAt(intro, pocket.start).camera, gun);
  assert.deepEqual(visualAt(intro, pocket.end - 1).camera, gun);
  assert.deepEqual(visualAt(intro, recognition.start).camera, gun);
  const panning = visualAt(intro, recognition.start + 770).camera;
  assert.ok(panning.x > 19 && panning.x < 68);
  const face = visualAt(intro, recognition.start + 1540).camera;
  assert.deepEqual(face, { scale: 2.25, x: 19, y: 13 });
  assert.deepEqual(visualAt(intro, recognition.start + 4000).camera, face);
  assert.equal(subtitleAt(recognition.speech, 1679), '');
  assert.ok(recognition.speech.syllables[0].at > 1540);
});

test('speech delay shifts voice and typed text together and survives seeking and speed changes', () => {
  const cue = named('recognition'), plain = planSpeech(cue.text, cue.voice), delay = 1680;
  assert.equal(cue.speech.duration, plain.duration + delay);
  assert.equal(cue.speech.letters[0].at, plain.letters[0].at + delay);
  assert.equal(cue.speech.syllables[0].at, plain.syllables[0].at + delay);
  assert.equal(cue.speech.syllables[0].end, plain.syllables[0].end + delay);
  assert.equal(subtitleAt(cue.speech, delay), '');
  assert.equal(subtitleAt(cue.speech, delay + 100), 'К');
  assert.ok(voiceCurves(cue.speech, 0, 1).gain.slice(0, 250).every((gain) => gain === 0));
  for (const rate of [0.5, 1, 2]) {
    const offset = delay + plain.syllables[0].at + 30;
    const resumed = voiceCurves(cue.speech, offset, rate);
    assert.ok(resumed.gain[0] > 0);
    assert.equal(resumed.duration, (cue.speech.duration - offset) / rate / 1000);
  }
  for (const speechDelay of [-1, NaN, Infinity, cue.duration]) {
    assert.throws(() => compileScene({ ...intro, cues: [{ ...cue, speechDelay }] }), /Неверная задержка речи/);
  }
  assert.throws(() => compileScene({ ...intro, cues: [{ ...cue, speechDelay: cue.duration - 1 }] }), /Реплика не помещается/);
});

test('all original illustrations preload in the same narrative order', () => {
  assert.equal(sceneImages(intro).length, 15);
  const images = intro.cues.flatMap((cue) => cue.shots ?? []).map((shot) => shot.image.split('/').at(-1));
  assert.deepEqual(images.filter((image, index) => index === 0 || image !== images[index - 1]), [
    'intro-gym-v3.webp', 'intro-arrest.webp', 'intro-court-v2.webp', 'intro-cell-v3.webp',
    'intro-escape-v6.webp', 'intro-road-v4.webp', 'intro-driver-v3.webp', 'intro-biker-v3.webp',
    'intro-woman-v4.webp', 'boxer-angry.webp', 'intro-woman-after-v5.webp', 'intro-controller-v4.webp',
    'intro-billiards-v4.webp', 'intro-acquittal-v3.webp', 'intro-gym-v4.webp',
  ]);
  for (const cue of intro.cues) for (const shot of cue.shots!) {
    assert.equal(visualAt(intro, cue.start + shot.at).image, shot.image);
  }
});

test('camera holds and movements remain deterministic at pause, seek, reduced motion and completion', () => {
  const cue = named('pistol');
  const player = new Timeline(intro);
  player.seek(cue.start + 2850); player.play(); player.pause();
  const camera = visualAt(intro, player.time);
  player.advance(1000);
  assert.deepEqual(visualAt(intro, player.time), camera);
  assert.deepEqual(visualAt(intro, player.time, true).camera, { scale: 1, x: 50, y: 50 });
  player.seek(intro.duration); player.play();
  assert.equal(player.time, 0);
  player.advance(intro.duration + 1);
  assert.equal(player.playing, false);
  assert.deepEqual(visualAt(intro, intro.duration - 1000).camera, { scale: 1, x: 50, y: 50 });
  assert.deepEqual(visualAt(intro, intro.duration).camera, { scale: 1, x: 50, y: 50 });
  const precinct = scenes.find((scene) => scene.id === 'precinct')!;
  assert.deepEqual(visualAt(precinct, 0).camera, precinct.cues[0].camera);
});

test('invalid plan ordering, timing, assets and camera endpoints fail before playback', () => {
  const cue = intro.cues[0], shot = cue.shots![0];
  const invalid = [
    [], [{ ...shot, at: 1 }], [shot, { ...shot, at: 0 }],
    [shot, { ...shot, at: cue.duration }], [shot, { ...shot, at: NaN }],
    [{ ...shot, image: '' }], [{ ...shot, imageAlt: ' ' }],
    [{ ...shot, cameraEnd: { scale: 6, x: 50, y: 50 } }],
    [{ ...shot, camera: { scale: 1, x: -1, y: 50 } }],
  ];
  for (const shots of invalid) assert.throws(() => compileScene({ ...intro, cues: [{ ...cue, shots }] }));
  const titleCard = { eyebrow: '', title: 'Титр' };
  assert.doesNotThrow(() => compileScene({ ...intro, cues: [{ ...cue, titleCard }] }));
  for (const title of ['', '  ']) {
    assert.throws(() => compileScene({ ...intro, cues: [{ ...cue, titleCard: { eyebrow: '', title } }] }), /Неверный титр/);
  }
  assert.throws(() => compileScene({ ...intro, cues: [{ ...cue, titleCard, fight: true }] }), /Неверный титр/);
});

test('untouched beats retain shortened silences and every spoken syllable keeps its timing', () => {
  const previous: [string, number, number][] = [
    ['murder', 5100, 500], ['pistol', 4400, 650], ['pocket', 3800, 0],
    ['recognition', 6100, 2400], ['court', 3000, 350], ['court-silence', 700, 0],
    ['prison', 3500, 250], ['moscow', 4700, 650],
    ['world', 3400, 200], ['no-harm', 4800, 300],
    ['difficulties', 4500, 350],
    ['acquittal', 3300, 650], ['boxing', 5500, 500],
  ];
  assert.equal(previous.length, 13);
  for (const [id, oldDuration, oldDelay] of previous) {
    const cue = named(id), speech = planSpeech(cue.text, cue.voice);
    assert.equal(cue.speechDelay, Math.round(oldDelay * 0.7), id);
    assert.equal(cue.duration - cue.speech.duration, Math.round((oldDuration - oldDelay - speech.duration) * 0.7), id);
  }
  for (const cue of intro.cues) {
    const speech = planSpeech(cue.text, cue.voice);
    assert.deepEqual(cue.speech.syllables, speech.syllables.map((syllable) => ({ ...syllable,
      at: syllable.at + cue.speechDelay!, end: syllable.end + cue.speechDelay! })));
  }
  assert.equal(intro.duration, 64254);
});

test('opponent reveals begin on the face and pull back under the same growing caption', () => {
  for (const id of ['escape', 'world', 'forced', 'culprit']) {
    const cue = named(id), [close, reveal, full] = cue.shots!;
    assert.ok(close.camera.scale >= 2.5, id);
    assert.deepEqual(reveal.camera, close.camera, id);
    assert.equal(full.camera.scale, 1, id);
    const early = reveal.at + 100, late = Math.min(full.at - 50, cue.speech.letters.at(-1)!.at);
    assert.equal(cueAt(intro, cue.start + early), cue);
    assert.equal(cueAt(intro, cue.start + late), cue);
    const text = subtitleAt(cue.speech, early);
    assert.ok(text.length > 0 && text.length < subtitleAt(cue.speech, late).length, id);
    assert.ok(cue.speech.syllables.some((syllable) => syllable.at >= early && syllable.at < late), id);
    assert.ok(visualAt(intro, cue.start + early).camera.scale > visualAt(intro, cue.start + late).camera.scale, id);
    assert.equal(visualAt(intro, cue.end - 1).camera.scale, 1, id);
    assert.deepEqual(visualAt(intro, cue.start + late, true).camera, close.camera, id);
    assert.equal(visualAt(intro, cue.start + full.at, true).camera.scale, 1, id);
  }
  const culprit = named('culprit');
  assert.equal(subtitleAt(culprit.speech, culprit.shots![1].at), 'я добрался');
  assert.deepEqual(named('difficulties').shots!.map((shot) => shot.at), [0, 1000, 3500]);
});

test('the biker clause settles before the woman clause starts its centered pullback', () => {
  const biker = named('obstacles'), woman = named('obstacles-woman');
  assert.equal(biker.text, 'Каждый встречный');
  assert.equal(woman.text, 'пытался мне помешать.');
  assert.equal(woman.start, biker.end);
  assert.ok(biker.duration - biker.speech.duration >= 500);
  assert.match(visualAt(intro, biker.end - 1).image, /intro-biker-v3.webp$/);
  assert.equal(subtitleAt(biker.speech, biker.duration - 1), biker.text);
  assert.match(visualAt(intro, woman.start).image, /intro-woman-v4.webp$/);
  assert.equal(subtitleAt(woman.speech, 249), '');
  assert.deepEqual(visualAt(intro, woman.start).camera, { scale: 2, x: 50, y: 50 });
  const moving = visualAt(intro, woman.start + 1200).camera;
  assert.ok(moving.scale > 1 && moving.scale < 2);
  assert.ok(subtitleAt(woman.speech, 1200).startsWith('пытался'));
  assert.equal(visualAt(intro, woman.start + 2350).camera.scale, 1);
  assert.ok(woman.duration - 2350 >= 1000);
  assert.deepEqual(visualAt(intro, woman.start + 1200, true).camera, { scale: 2, x: 50, y: 50 });
  assert.equal(visualAt(intro, woman.start + 2350, true).camera.scale, 1);
  assert.match(visualAt(intro, 0).image, /intro-gym-v3.webp$/);
  assert.match(visualAt(intro, named('boxing').start).image, /intro-gym-v4.webp$/);
});

test('revealed escape, woman and bandit remain still after both motion and speech finish', () => {
  for (const [id, minimum, next] of [
    ['escape', 1900, 'moscow'], ['forced', 1300, 'difficulties'], ['culprit', 1900, 'acquittal'],
  ] as const) {
    const cue = named(id), stop = cue.shots!.at(-1)!.at;
    const holdStart = Math.max(stop, cue.speech.duration);
    assert.ok(cue.duration - holdStart >= minimum, id);
    assert.ok(cue.duration - stop >= (id === 'forced' ? 1500 : 2000), id);
    const full = visualAt(intro, cue.start + holdStart);
    assert.equal(full.camera.scale, 1, id);
    for (const elapsed of [holdStart, holdStart + 500, cue.duration - 1]) {
      assert.deepEqual(visualAt(intro, cue.start + elapsed), full, id);
      assert.equal(subtitleAt(cue.speech, elapsed), cue.text, id);
      assert.equal(cueAt(intro, cue.start + elapsed), cue, id);
    }
    assert.equal(cueAt(intro, cue.end).id, next, id);
  }
});
