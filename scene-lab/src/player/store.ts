import {
  actionBound,
  observableRef,
  computed,
  makeObservable,
  observable,
  runInAction,
} from 'mobx';
import {
  cueAt,
  readSceneLink,
  sceneImages,
  sceneLink,
  visualAt,
  type CompiledScene,
} from '../scene.ts';
import { chapterAt, compileFilm } from '../film.ts';
import type { Timeline } from '../timeline.ts';
import { observableTimeline } from '../observable-timeline.ts';
import { createSceneAnimation } from '../gsap-scene.ts';
import type { SceneAudio } from '../audio.ts';

export interface PlayerServices {
  createAudio(
    onError: () => void,
  ): Pick<SceneAudio, 'setActive' | 'setMuted' | 'setVolume' | 'speak' | 'play' | 'dispose'>;
  loadImages(sources: string[], signal: AbortSignal): Promise<void>;
  now(): number;
  writeLink(hash: string): void;
}

export class PlayerStore {
  readonly scenes: CompiledScene[];
  readonly film: ReturnType<typeof compileFilm>;
  readonly filmPage: boolean;
  timeline: Timeline;
  started = false;
  loadState: 'loading' | 'ready' | 'error' = 'loading';
  muted = false;
  volume = 0.65;
  reducedMotion = false;
  fightResolved = false;
  private notice: string;
  private audioUnavailable = false;
  animation: ReturnType<ReturnType<typeof createSceneAnimation>['at']> | undefined;
  private readonly services: PlayerServices;
  private audio?: ReturnType<PlayerServices['createAudio']>;
  private animations = new Map<string, ReturnType<typeof createSceneAnimation>>();
  private connected = false;
  private sessionGeneration = 0;
  private loadController?: AbortController;
  private audioGeneration = 0;
  private speechKey = '';
  private previous = 0;

  constructor(scenes: CompiledScene[], filmPage: boolean, hash: string, services: PlayerServices) {
    this.scenes = scenes;
    this.film = compileFilm(scenes);
    this.filmPage = filmPage;
    this.services = services;
    const initial = readSceneLink(
      hash,
      filmPage ? [this.film.scene] : [...scenes, this.film.scene],
    );
    this.timeline = observableTimeline(initial.scene);
    this.timeline.seek(initial.time);
    this.notice = filmPage ? '' : 'Серьёзный разговор. Нелепые обстоятельства.';
    makeObservable<this, 'notice' | 'audioUnavailable'>(this, {
      timeline: observableRef,
      started: observable,
      loadState: observable,
      muted: observable,
      volume: observable,
      reducedMotion: observable,
      fightResolved: observable,
      notice: observable,
      audioUnavailable: observable,
      status: computed,
      error: computed,
      animation: observableRef,
      scene: computed,
      chapter: computed,
      source: computed,
      cue: computed,
      cueIndex: computed,
      visual: computed,
      startLabel: computed,
      connect: actionBound,
      disconnect: actionBound,
      tick: actionBound,
      pause: actionBound,
      play: actionBound,
      seek: actionBound,
      move: actionBound,
      restart: actionBound,
      setRate: actionBound,
      setVolume: actionBound,
      toggleMute: actionBound,
      switchScene: actionBound,
      selectScene: actionBound,
      selectMode: actionBound,
      followLink: actionBound,
      imageFailed: actionBound,
      setReducedMotion: actionBound,
      resolveFight: actionBound,
      notify: actionBound,
    });
  }

  get error(): 'image' | 'audio' | undefined {
    if (this.loadState === 'error') return 'image';
    return this.audioUnavailable ? 'audio' : undefined;
  }
  get status(): string {
    if (this.error === 'image')
      return 'Не удалось загрузить иллюстрацию. Обновите страницу, чтобы попробовать снова.';
    if (this.error === 'audio')
      return 'Звук недоступен в этом браузере. Просмотр продолжится без звука.';
    return this.notice;
  }
  get scene() {
    return this.timeline.scene;
  }
  get chapter() {
    return this.scene.id === 'film' ? chapterAt(this.film, this.timeline.time) : undefined;
  }
  get source() {
    return this.chapter?.scene ?? this.scene;
  }
  get cue() {
    return cueAt(this.scene, this.timeline.time);
  }
  get cueIndex() {
    return this.scene.cues.indexOf(this.cue);
  }
  get visual() {
    return visualAt(this.scene, this.timeline.time, true);
  }
  get startLabel() {
    if (this.loadState === 'error') return 'Иллюстрация не загрузилась';
    if (this.loadState === 'loading') return 'Загрузка иллюстраций…';
    return this.timeline.time > 0
      ? 'Смотреть с этого момента'
      : this.scene.id === 'film'
        ? 'Смотреть игрофильм'
        : 'Смотреть сцену';
  }

  connect(): void {
    if (this.connected) return;
    this.connected = true;
    const session = ++this.sessionGeneration;
    this.audio = this.services.createAudio(() =>
      runInAction(() => {
        if (!this.connected || session !== this.sessionGeneration) return;
        this.audioUnavailable = true;
      }),
    );
    this.audioUnavailable = false;
    this.audio.setVolume(this.volume);
    void this.audio.setMuted(this.muted);
    this.animations = new Map(this.scenes.map((scene) => [scene.id, createSceneAnimation(scene)]));
    this.previous = this.services.now();
    this.refreshAnimation();
    this.load();
  }

  disconnect(): void {
    this.pause();
    this.connected = false;
    this.sessionGeneration++;
    this.loadController?.abort();
    this.audio?.dispose();
    this.audio = undefined;
    for (const animation of this.animations.values()) animation.dispose();
    this.animations.clear();
  }

  private load(): void {
    this.loadController?.abort();
    const controller = new AbortController();
    this.loadController = controller;
    if (this.loadState === 'error')
      this.notice = this.filmPage ? '' : 'Серьёзный разговор. Нелепые обстоятельства.';
    this.loadState = 'loading';
    void this.services
      .loadImages(sceneImages(this.scene), controller.signal)
      .then(() =>
        runInAction(() => {
          if (!controller.signal.aborted) this.loadState = 'ready';
        }),
      )
      .catch(() => {
        if (!controller.signal.aborted) this.imageFailed();
      });
  }

  private refreshAnimation(): void {
    this.animation = this.animations
      .get(this.source.id)
      ?.at(this.timeline.time - (this.chapter?.start ?? 0), this.reducedMotion);
  }

  tick(now: number): void {
    if (!this.connected) return;
    const wasPlaying = this.timeline.playing;
    const sounds = this.timeline.advance(Math.max(0, now - this.previous));
    this.previous = now;
    for (const sound of sounds) this.audio?.play(sound);
    if (wasPlaying && !this.timeline.playing) void this.audio?.setActive(false);
    if (wasPlaying) {
      this.refreshAnimation();
      this.syncSpeech();
    }
  }

  pause(): void {
    this.audioGeneration++;
    this.timeline.pause();
    this.speechKey = '';
    void this.audio?.setActive(false);
  }

  async play(): Promise<void> {
    if (!this.connected || this.loadState !== 'ready') return;
    if (this.timeline.playing) {
      this.pause();
      return;
    }
    const generation = ++this.audioGeneration;
    this.started = true;
    this.fightResolved = false;
    await this.audio!.setActive(true);
    runInAction(() => {
      if (generation !== this.audioGeneration || !this.connected) return;
      this.timeline.play();
      this.previous = this.services.now();
      this.refreshAnimation();
      this.syncSpeech();
    });
  }

  seek(time: number): void {
    this.pause();
    this.timeline.seek(time);
    this.started = true;
    this.fightResolved = false;
    this.services.writeLink(sceneLink(this.scene, this.timeline.time));
    this.refreshAnimation();
  }

  move(direction: -1 | 1): void {
    this.seek(
      this.scene.cues[Math.max(0, Math.min(this.scene.cues.length - 1, this.cueIndex + direction))]
        .start,
    );
  }
  restart(): void {
    this.seek(0);
    void this.play();
  }
  setRate(rate: number): void {
    this.timeline.setRate(rate);
    this.syncSpeech(true);
  }
  setVolume(volume: number): void {
    this.volume = volume;
    this.audio?.setVolume(volume);
  }
  async toggleMute(): Promise<void> {
    this.muted = !this.muted;
    const generation = this.audioGeneration;
    await this.audio?.setMuted(this.muted);
    if (this.connected && generation === this.audioGeneration) this.syncSpeech(true);
  }

  private syncSpeech(force = false): void {
    if (!this.timeline.playing) {
      this.speechKey = '';
      return;
    }
    const key = `${this.cue.id}:${this.timeline.rate}`;
    if (!force && key === this.speechKey) return;
    this.speechKey = key;
    this.audio?.speak(this.cue.speech, this.timeline.time - this.cue.start, this.timeline.rate);
  }

  switchScene(scene: CompiledScene, time = 0): void {
    this.pause();
    const rate = this.timeline.rate;
    this.timeline = observableTimeline(scene);
    this.timeline.setRate(rate);
    this.timeline.seek(time);
    this.started = false;
    this.fightResolved = false;
    this.services.writeLink(sceneLink(scene, this.timeline.time));
    this.refreshAnimation();
    if (this.connected) this.load();
  }
  selectScene(id: string): void {
    if (this.scene.id === 'film')
      this.seek(this.film.chapters.find((chapter) => chapter.scene.id === id)!.start);
    else this.switchScene(this.scenes.find((scene) => scene.id === id)!);
  }
  selectMode(mode: string): void {
    if (mode === 'film') this.switchScene(this.film.scene);
    else {
      const chapter = chapterAt(this.film, this.timeline.time);
      this.switchScene(chapter.scene, this.timeline.time - chapter.start);
    }
  }
  followLink(hash: string): void {
    const target = readSceneLink(
      hash,
      this.filmPage ? [this.film.scene] : [...this.scenes, this.film.scene],
    );
    if (target.scene.id !== this.scene.id) this.switchScene(target.scene);
    this.seek(target.time);
  }
  imageFailed(): void {
    this.loadController?.abort();
    this.pause();
    this.loadState = 'error';
  }
  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
    this.refreshAnimation();
  }
  resolveFight(): void {
    this.pause();
    this.fightResolved = true;
  }
  notify(text: string): void {
    this.notice = text;
  }
}
