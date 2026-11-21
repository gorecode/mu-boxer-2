import { actionBound, computed, observableRef, makeObservable, observable } from 'mobx';
import { compileScene } from '../../scene.ts';
import { observableTimeline } from '../../observable-timeline.ts';
import {
  createLayerTimeline,
  duration,
  initial,
  nativeLayers,
  reducedLayers,
  type LayerState,
} from './motion.ts';

export class LayerStore {
  engine: 'native' | 'gsap';
  lead: number;
  timeline;
  ready = false;
  reduced = false;
  status = 'Загрузка иллюстрации…';
  state: LayerState = initial;
  private track?: ReturnType<typeof createLayerTimeline>;
  private previous = 0;
  private connected = false;
  private readonly now: () => number;

  constructor(query: string, now: () => number) {
    this.now = now;
    const params = new URLSearchParams(query);
    this.engine = params.get('engine') === 'native' ? 'native' : 'gsap';
    this.lead = params.get('lead') === '1300' ? 1300 : 800;
    this.timeline = this.clock();
    makeObservable(this, {
      engine: observable,
      lead: observable,
      timeline: observableRef,
      rate: computed,
      time: computed,
      playing: computed,
      ready: observable,
      reduced: observable,
      status: observable,
      state: observableRef,
      imageReady: actionBound,
      imageFailed: actionBound,
      connect: actionBound,
      disconnect: actionBound,
      tick: actionBound,
      pause: actionBound,
      toggle: actionBound,
      seek: actionBound,
      restart: actionBound,
      setEngine: actionBound,
      setLead: actionBound,
      setRate: actionBound,
      setReduced: actionBound,
    });
  }
  get rate() {
    return this.timeline.rate;
  }
  get time() {
    return this.timeline.time;
  }
  get playing() {
    return this.timeline.playing;
  }
  private clock() {
    return observableTimeline(
      compileScene({
        id: 'layers',
        title: '',
        subtitle: '',
        image: '',
        imageAlt: '',
        opponent: '',
        cues: [
          {
            id: 'all',
            label: '',
            duration: duration(this.lead),
            speaker: '',
            text: '',
            camera: { scale: 1, x: 0, y: 0 },
          },
        ],
      }),
    );
  }
  connect(): void {
    if (this.connected) return;
    this.connected = true;
    this.ready = false;
    this.status = 'Загрузка иллюстрации…';
    this.track = createLayerTimeline(this.lead);
    this.render();
  }
  imageReady(): void {
    if (!this.connected) return;
    this.ready = true;
    this.status = 'Без звука · единые часы просмотра · reduced motion поддерживается';
  }
  imageFailed(): void {
    if (!this.connected) return;
    this.ready = false;
    this.pause();
    this.status = 'Иллюстрация не загрузилась. Обновите страницу, чтобы повторить.';
  }
  disconnect(): void {
    this.connected = false;
    this.ready = false;
    this.pause();
    this.track?.dispose();
    this.track = undefined;
  }
  private render(): void {
    this.state = this.reduced
      ? reducedLayers(this.time, this.lead)
      : this.engine === 'gsap'
        ? (this.track?.at(this.time) ?? initial)
        : nativeLayers(this.time, this.lead);
  }
  tick(now: number): void {
    if (this.playing) {
      this.timeline.advance(Math.max(0, now - this.previous));
      this.render();
    }
    this.previous = now;
  }
  pause(): void {
    this.timeline.pause();
  }
  toggle(): void {
    if (!this.ready) return;
    if (this.playing) this.pause();
    else {
      this.timeline.play();
      this.previous = this.now();
      this.render();
    }
  }
  seek(time: number): void {
    this.pause();
    this.timeline.seek(time);
    this.render();
  }
  restart(): void {
    this.seek(0);
  }
  setEngine(engine: 'native' | 'gsap'): void {
    this.pause();
    this.engine = engine;
    this.render();
  }
  setLead(lead: number): void {
    this.pause();
    this.track?.dispose();
    this.lead = lead;
    this.track = this.connected ? createLayerTimeline(lead) : undefined;
    const { time, rate } = this;
    this.timeline = this.clock();
    this.timeline.setRate(rate);
    this.timeline.seek(time);
    this.render();
  }
  setRate(rate: number): void {
    this.timeline.setRate(rate);
  }
  setReduced(value: boolean): void {
    this.reduced = value;
    this.render();
  }
}
