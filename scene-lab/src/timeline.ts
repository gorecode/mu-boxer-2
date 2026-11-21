import type { CompiledScene, Sound } from './scene.ts';

export class Timeline {
  readonly scene: CompiledScene;
  time = 0;
  playing = false;
  rate = 1;

  constructor(scene: CompiledScene) { this.scene = scene; }

  play(): void {
    if (this.time >= this.scene.duration) this.time = 0;
    this.playing = true;
  }

  pause(): void { this.playing = false; }

  seek(time: number): void {
    if (!Number.isFinite(time)) throw new Error('Неверная позиция');
    this.time = Math.max(0, Math.min(this.scene.duration, time));
    if (this.time === this.scene.duration) this.pause();
  }

  setRate(rate: number): void {
    if (![0.75, 1, 1.25, 1.5, 2].includes(rate)) throw new Error('Неверная скорость');
    this.rate = rate;
  }

  advance(delta: number): Sound[] {
    if (!Number.isFinite(delta) || delta < 0) throw new Error('Неверный шаг времени');
    if (!this.playing || delta === 0) return [];
    const from = this.time;
    const end = Math.min(this.scene.duration, from + delta * this.rate);
    this.time = end;
    if (end === this.scene.duration) this.pause();
    return this.scene.events.filter((event) => event.time >= from && event.time < end).map((event) => event.sound);
  }
}
