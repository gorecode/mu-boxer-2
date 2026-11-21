import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSpeech, subtitleAt, voiceCurves } from '../src/speech.ts';

test('subtitles reveal progressively with speech and retain complete Unicode characters', () => {
  const plan = planSpeech('Му, му! 🥊');
  assert.equal(subtitleAt(plan, 0), '');
  assert.equal(subtitleAt(plan, 100), 'М');
  const early = subtitleAt(plan, 220);
  assert.ok(early.length > 0 && early.length < plan.text.length);
  assert.equal(subtitleAt(plan, plan.duration), plan.text);
  for (let time = 0; time < plan.duration; time += 7) assert.ok(!subtitleAt(plan, time).endsWith('\ud83e'));
});

test('vowels set mu rhythm; punctuation provides a silent reading pause', () => {
  const plain = planSpeech('Му му');
  const paused = planSpeech('Му, му');
  assert.equal(plain.syllables.length, 2);
  assert.equal(planSpeech('Рабочего избили?').syllables.length, 7);
  assert.ok(paused.syllables[1].at - plain.syllables[1].at >= 100);
  const gap = (paused.syllables[0].end + paused.syllables[1].at) / 2;
  const curves = voiceCurves(paused, gap, 1);
  assert.equal(curves.gain[0], 0);
  assert.equal(subtitleAt(paused, gap).trim(), 'Му,');
});

test('seek and speed trim the voice instead of replaying words or transposing pitch', () => {
  const plan = planSpeech('Му му му');
  const offset = plan.syllables[1].at + 40;
  const normal = voiceCurves(plan, offset, 1);
  const fast = voiceCurves(plan, offset, 2);
  assert.equal(fast.duration, normal.duration / 2);
  assert.equal(fast.pitch[0], normal.pitch[0]);
  assert.equal(fast.gain[0], normal.gain[0]);
  assert.ok(normal.gain[0] > 0);
  assert.equal(normal.gain.at(-1), 0);
  assert.equal(voiceCurves(plan, plan.duration, 1).duration, 0);
  assert.equal(voiceCurves(plan, plan.duration + 100, 1).duration, 0);
  for (const [offset, rate] of [[-1, 1], [NaN, 1], [0, 0], [0, Infinity]]) {
    assert.throws(() => voiceCurves(plan, offset, rate));
  }
});

test('officer, boxer and angry boxer have distinct pitch; questions rise', () => {
  const officer = planSpeech('Му', 'officer');
  const boxer = planSpeech('Му', 'boxer');
  const angry = planSpeech('Му', 'boxer-angry');
  assert.ok(officer.syllables[0].pitch[0] < boxer.syllables[0].pitch[0]);
  assert.ok(boxer.syllables[0].pitch[0] < angry.syllables[0].pitch[0]);
  assert.ok(planSpeech('Му?').syllables[0].pitch[2] > planSpeech('Му.').syllables[0].pitch[2]);
  assert.deepEqual(planSpeech('Му му?'), planSpeech('Му му?'));
});

test('empty and punctuation-only captions do not create speech', () => {
  for (const text of ['', '  ', '…', '🥊']) {
    const plan = planSpeech(text);
    assert.equal(plan.duration, 0);
    assert.equal(plan.syllables.length, 0);
    assert.ok(voiceCurves(plan, 0, 1).gain.every((value) => value === 0));
  }
});

test('grandmother has a distinct voice while preserving shared dialogue and subtitle timing', () => {
  const line = 'Мужчина. Только через мой труп.';
  const grandma = planSpeech(line, 'grandma');
  const narrator = planSpeech(line, 'boxer');
  assert.equal(grandma.voice, 'grandma');
  assert.equal(grandma.duration, narrator.duration);
  assert.deepEqual(grandma.letters, narrator.letters);
  assert.ok(grandma.syllables.length > 0);
  assert.ok(grandma.syllables[0].pitch[0] > narrator.syllables[0].pitch[0]);
  const curves = voiceCurves(grandma, 0, 1);
  assert.ok(curves.gain.some((gain) => gain > 0));
  assert.ok(curves.pitch.every(Number.isFinite));
  assert.equal(subtitleAt(grandma, grandma.duration), line);
});
