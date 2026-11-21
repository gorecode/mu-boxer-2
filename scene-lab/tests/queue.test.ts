import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subtitleAt } from '../src/speech.ts';
import { scenes } from '../src/scenes.ts';
import { cueAt, readSceneLink, sceneImages, sceneLink, visualAt } from '../src/scene.ts';

const queue = scenes.find((scene) => scene.id === 'queue')!;

test('queue is a separate reviewable scene with its own introduction and inflected opponent', () => {
  assert.ok(queue);
  assert.equal(queue.title, 'Только через мой труп');
  assert.equal(queue.opponent, 'Бабки');
  assert.equal(queue.intro?.title, 'К другим сотрудникам.');
  assert.equal(queue.duration, 40000);
  assert.equal(queue.cues.length, 13);
  assert.equal(sceneImages(queue).length, 8);
  assert.equal(scenes.find((scene) => scene.id === 'precinct')?.duration, 31100);
});

test('approved dialogue progresses from an ordinary queue dispute to humane self-exoneration', () => {
  assert.deepEqual(queue.cues.filter((cue) => cue.text).map((cue) => [cue.speaker, cue.text]), [
    ['Боксёр · рассказ', 'Мои способности её убедили.'],
    ['Боксёр · рассказ', 'Но за справкой пришлось обратиться к другим сотрудникам.'],
    ['Боксёр · рассказ', 'Здесь всё было организовано.'],
    ['Бабка', 'Я занимала.'],
    ['Боксёр', 'Меня вызвали.'],
    ['Бабка', 'Я ещё до тебя занимала.'],
    ['Бабка', 'Мужчина. Только через мой труп.'],
    ['Боксёр · про себя', 'Убивать эту женщину я не собирался.'],
    ['Боксёр · про себя', 'Но она не оставила мне выбора.'],
  ]);
  for (const cue of queue.cues) assert.ok(cue.speech.duration <= cue.duration, cue.id);
  for (const cue of queue.cues.filter((cue) => cue.speaker === 'Бабка')) assert.equal(cue.voice, 'grandma');
});

test('ticket and called number precede the bag blockade; only the boxer initiates fighting', () => {
  assert.equal(queue.cues[3].label, 'Талон № 111');
  assert.equal(queue.cues[4].label, 'Вызван № 111');
  assert.ok(queue.cues[3].image?.endsWith('queue-ticket.webp'));
  assert.ok(queue.events.some((event) => event.time === 14500 && event.sound === 'queue-chime'));
  const block = queue.cues.find((cue) => cue.id === 'block')!;
  const ultimatum = queue.cues.find((cue) => cue.id === 'ultimatum')!;
  const thinking = queue.cues.find((cue) => cue.id === 'thinking')!;
  const forced = queue.cues.find((cue) => cue.id === 'forced')!;
  assert.equal(block.text, '');
  assert.equal(block.speech.duration, 0);
  assert.equal(block.end, ultimatum.start);
  assert.equal(ultimatum.end, thinking.start);
  assert.ok(thinking.image?.endsWith('boxer-thinking.webp'));
  assert.ok(thinking.duration - thinking.speech.duration >= 1000);
  assert.equal(thinking.end, forced.start);
  assert.equal(cueAt(queue, forced.start - 1).id, 'thinking');
  assert.equal(cueAt(queue, forced.start).id, 'forced');
  assert.ok(forced.image?.endsWith('queue-boxer-ready.webp'));
  assert.equal(forced.voice, 'boxer');
  assert.equal(queue.cues.at(-1)?.fight, true);
  assert.deepEqual(queue.events.filter((event) => event.sound === 'impact'), [{ time: forced.start, sound: 'impact' }]);
});

test('queue links round-trip and stay separate from precinct with identical cue ids', () => {
  const moment = queue.cues.find((cue) => cue.id === 'thinking')!.start;
  assert.deepEqual(readSceneLink(sceneLink(queue, moment), scenes), { scene: queue, time: moment });
  assert.equal(readSceneLink('#scene=queue&t=999', scenes).time, 40000);
  assert.equal(readSceneLink('#scene=queue&t=-1', scenes).time, 0);
  assert.equal(readSceneLink('#scene=queue&t=bad', scenes).time, 0);
  assert.equal(readSceneLink('#scene=unknown&t=10', scenes).scene.id, 'intro');
});

test('aftermath reveals Angelika during uninterrupted narration and holds after camera and speech', () => {
  const aftermath = queue.cues[0];
  const close = visualAt(queue, 350), middle = visualAt(queue, 1200), full = visualAt(queue, 2300);
  assert.equal(aftermath.id, 'angelika-aftermath');
  assert.match(close.image, /queue-aftermath-v2.webp$/);
  assert.equal(close.image, full.image);
  assert.ok(close.camera.scale > middle.camera.scale && middle.camera.scale > full.camera.scale);
  assert.equal(full.camera.scale, 1);
  assert.ok(subtitleAt(aftermath.speech, 1200).length > 0);
  assert.ok(aftermath.end - Math.max(2300, aftermath.speech.duration) >= 800);
  assert.deepEqual(visualAt(queue, aftermath.end - 1), full);
  assert.deepEqual(visualAt(queue, 1200, true), close);
  assert.deepEqual(visualAt(queue, 2300, true), full);
});

test('public entrance and terminal establish relief before the original queue, with safe seeking boundaries', () => {
  for (const [at, id, art] of [[4199, 'angelika-aftermath', 'aftermath-v2'],
    [4200, 'public-entrance', 'entrance-v1'], [9199, 'public-entrance', 'entrance-v1'],
    [9200, 'terminal', 'terminal-v2'], [12999, 'terminal', 'terminal-v2'],
    [13000, 'ticket', 'ticket'], [14500, 'called', 'wide'], [16000, 'claim', 'grandma']] as const) {
    assert.equal(cueAt(queue, at).id, id);
    assert.match(visualAt(queue, at).image, new RegExp(`queue-${art}.webp$`));
  }
  const terminal = queue.cues[2];
  assert.equal(subtitleAt(terminal.speech, 599), '');
  assert.ok(subtitleAt(terminal.speech, 750).length > 0);
  for (const spoken of queue.cues.slice(0, 3)) {
    assert.equal(spoken.voice, 'boxer');
    assert.ok(spoken.duration - spoken.speech.duration >= 600, spoken.id);
    assert.equal(spoken.fight, undefined);
  }
  assert.deepEqual(queue.events.filter(event => event.time < 14500), [
    { time: 11700, sound: 'paper' }, { time: 13100, sound: 'paper' },
  ]);
  assert.equal(queue.duration - queue.cues[3].start, 27000);
});
