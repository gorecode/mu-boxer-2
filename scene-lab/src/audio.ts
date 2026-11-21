import type { Sound } from './scene.ts';
import type { SpeechPlan } from './speech.ts';
import { playMooSpeech } from './moo.ts';

export function noiseSamples(length: number, seed = 42): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(length);
  let value = seed >>> 0;
  for (let i = 0; i < length; i++) {
    value = (Math.imul(1664525, value) + 1013904223) >>> 0;
    samples[i] = (value / 4294967296) * 2 - 1;
  }
  return samples;
}

export class SceneAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private nodes = new Set<AudioScheduledSourceNode>();
  private active = false;
  private muted = false;
  private level = 0.65;
  private generation = 0;
  private failed = false;
  private stopSpeech?: () => void;
  readonly onError: () => void;

  constructor(onError: () => void) { this.onError = onError; }

  setVolume(volume: number): void {
    this.level = Math.max(0, Math.min(1, volume));
    if (this.context && this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.level, this.context.currentTime, 0.015);
  }

  async setMuted(muted: boolean): Promise<void> {
    this.muted = muted;
    await this.setActive(this.active);
  }

  async setActive(active: boolean): Promise<void> {
    this.active = active;
    const generation = ++this.generation;
    this.stopNodes();
    if (!active || this.muted || this.failed) {
      if (this.context?.state === 'running') await this.context.suspend().catch(() => {});
      return;
    }
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.connect(this.context.destination);
      }
      this.master!.gain.value = this.level;
      await this.context.resume();
      if (generation !== this.generation || !this.active || this.muted) return;
      this.tone(58, 3600, 0.025, 'sine');
      this.tone(116, 3600, 0.008, 'sine');
    } catch {
      this.failed = true;
      this.stopNodes();
      if (this.master) this.master.gain.value = 0;
      this.onError();
    }
  }

  stopNodes(): void {
    this.stopSpeech?.();
    this.stopSpeech = undefined;
    for (const node of this.nodes) { try { node.stop(); } catch { /* Already ended. */ } node.disconnect(); }
    this.nodes.clear();
  }

  speak(plan: SpeechPlan, offset: number, rate: number): void {
    this.stopSpeech?.();
    this.stopSpeech = undefined;
    if (!this.active || this.muted || this.failed || this.context?.state !== 'running') return;
    this.stopSpeech = playMooSpeech(this.context, this.master!, plan, offset, rate);
  }

  private track<T extends AudioScheduledSourceNode>(node: T): T {
    this.nodes.add(node);
    node.onended = () => { this.nodes.delete(node); node.disconnect(); };
    return node;
  }

  private tone(frequency: number, duration: number, volume: number, type: OscillatorType = 'sine', delay = 0, fall?: number): void {
    const context = this.context!;
    const at = context.currentTime + delay;
    const oscillator = this.track(context.createOscillator());
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    if (fall) oscillator.frequency.exponentialRampToValueAtTime(fall, at + duration);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + Math.min(0.02, duration / 4));
    gain.gain.setValueAtTime(volume, at + duration * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain).connect(this.master!);
    oscillator.onended = () => { this.nodes.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(at);
    oscillator.stop(at + duration);
  }

  play(sound: Sound): void {
    if (!this.active || this.muted || this.failed || this.context?.state !== 'running') return;
    if (sound === 'queue-chime') {
      this.tone(880, 0.14, 0.09);
      this.tone(1244, 0.18, 0.07, 'sine', 0.17);
      return;
    }
    if (sound === 'ringback') { this.tone(425, 0.45, 0.065); return; }
    if (sound === 'siren') {
      for (let cycle = 0; cycle < 4; cycle++) {
        this.tone(600, 0.4, 0.075, 'triangle', cycle * 0.8, 1050);
        this.tone(1050, 0.4, 0.075, 'triangle', cycle * 0.8 + 0.4, 600);
      }
      return;
    }
    if (sound === 'ring') {
      for (const delay of [0, 0.12, 0.24, 0.36, 0.48, 0.6]) {
        this.tone(740, 0.09, 0.075, 'square', delay);
        this.tone(1040, 0.09, 0.035, 'sine', delay);
      }
      return;
    }
    if (sound === 'impact') { this.tone(95, 1.3, 0.22, 'sine', 0, 29); return; }
    const context = this.context;
    const duration = sound === 'paper' ? 0.5 : sound === 'chair' ? 0.65 : 0.12;
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
    buffer.copyToChannel(noiseSamples(buffer.length), 0);
    const source = this.track(context.createBufferSource());
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = sound === 'paper' ? 2100 : sound === 'chair' ? 480 : 1100;
    filter.Q.value = sound === 'chair' ? 8 : 0.7;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.14, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    source.connect(filter).connect(gain).connect(this.master!);
    source.onended = () => { this.nodes.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start();
  }

  dispose(): void {
    this.active = false;
    this.generation++;
    this.stopNodes();
    void this.context?.close().catch(() => {});
  }
}
