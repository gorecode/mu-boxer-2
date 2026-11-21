import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';
import { planSpeech, type SpeechPlan } from '../src/speech.ts';

interface VoiceWindow extends Window {
  SceneMoo: { playMooSpeech(context: BaseAudioContext, destination: AudioNode, plan: SpeechPlan, offset?: number, rate?: number): () => void };
}
let bundle: string;
test.beforeAll(async () => {
  const result = await build({ configFile: false, logLevel: 'silent', build: {
    write: false, minify: false, lib: { entry: resolve('src/moo.ts'), name: 'SceneMoo', formats: ['iife'] },
  } });
  const output = Array.isArray(result) ? result[0] : result;
  if (!output || !('output' in output)) throw new Error('Expected one test bundle');
  const chunk = output.output.find((item) => item.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Missing voice bundle');
  bundle = chunk.code;
});

test('real synthesized voices have signal, silence between words, different pitch and no clipping', async ({ page }) => {
  await page.goto('./');
  await page.addScriptTag({ content: bundle });
  const plans = ['officer', 'boxer', 'boxer-angry', 'grandma'].map((voice) => planSpeech('Му, му?', voice as SpeechPlan['voice']));
  const results = await page.evaluate(async (plans) => {
    const synth = (window as unknown as VoiceWindow).SceneMoo;
    const results = [];
    for (const plan of plans) {
      const context = new OfflineAudioContext(1, 48000 * 2, 48000);
      synth.playMooSpeech(context, context.destination, plan);
      const samples = (await context.startRendering()).getChannelData(0);
      const rms = (from: number, to: number): number => {
        const part = samples.subarray(from * 48000, to * 48000);
        return Math.sqrt(part.reduce((sum, x) => sum + x * x, 0) / part.length);
      };
      let best = -Infinity;
      let period = 0;
      for (let lag = 240; lag <= 540; lag++) {
        let score = 0, left = 0, right = 0;
        for (let i = 7200; i < 9600; i++) {
          score += samples[i] * samples[i + lag];
          left += samples[i] ** 2; right += samples[i + lag] ** 2;
        }
        const correlation = score / Math.sqrt(left * right);
        if (correlation > best) { best = correlation; period = lag; }
      }
      results.push({ active: rms(0.14, 0.22), initial: rms(0, 0.08), gap: rms(0.31, 0.42),
        tail: rms(1.6, 1.9), peak: samples.reduce((peak, x) => Math.max(peak, Math.abs(x)), 0), frequency: 48000 / period });
    }
    return results;
  }, plans);
  expect(results).toHaveLength(4);
  for (const result of results) {
    expect(result.active).toBeGreaterThan(0.01);
    expect(result.peak).toBeLessThan(0.95);
    expect(result.initial).toBeLessThan(0.00001);
    expect(result.gap).toBeLessThan(0.00001);
    expect(result.tail).toBeLessThan(0.00001);
  }
  expect(results[0].frequency).toBeLessThan(results[1].frequency);
  expect(results[1].frequency).toBeLessThan(results[2].frequency);
});

test('real voice resumes inside a syllable at 2x and stops immediately', async ({ page }) => {
  await page.goto('./');
  await page.addScriptTag({ content: bundle });
  const plan = planSpeech('Му му му');
  const result = await page.evaluate(async (plan) => {
    const synth = (window as unknown as VoiceWindow).SceneMoo;
    const context = new OfflineAudioContext(1, 48000 * 2, 48000);
    const offset = plan.syllables[1].at + 40;
    const stop = synth.playMooSpeech(context, context.destination, plan, offset, 2);
    const suspended = context.suspend(0.08);
    const render = context.startRendering();
    await suspended;
    stop(); stop();
    await context.resume();
    const samples = (await render).getChannelData(0);
    const energy = (from: number, to: number): number => {
      const part = samples.subarray(from * 48000, to * 48000);
      return part.reduce((sum, x) => sum + x * x, 0) / part.length;
    };
    return { beginning: energy(0.01, 0.04), cancelled: energy(0.10, 1.9) };
  }, plan);
  expect(result.beginning).toBeGreaterThan(0.0001);
  expect(result.cancelled).toBeLessThan(0.000000001);
});
