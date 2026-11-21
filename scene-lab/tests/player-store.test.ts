import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autorun, configure } from 'mobx';
import { compileScene } from '../src/scene.ts';
import { PlayerStore, type PlayerServices } from '../src/player/store.ts';

configure({ enforceActions: 'always' });
const scenes = ['one', 'two'].map((id) =>
  compileScene({
    id,
    title: id,
    subtitle: '',
    image: `${id}.webp`,
    imageAlt: id,
    opponent: id,
    cues: [
      {
        id: 'first',
        label: '',
        duration: 2000,
        speaker: id,
        text: 'Да.',
        voice: 'boxer',
        camera: { scale: 1, x: 50, y: 50 },
      },
      {
        id: 'last',
        label: '',
        duration: 1000,
        speaker: '',
        text: '',
        camera: { scale: 1.5, x: 60, y: 40 },
        fight: true,
      },
    ],
  }),
);
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup(hash = '') {
  let now = 0;
  let pendingAudio: ReturnType<typeof deferred> | undefined;
  const loads: (ReturnType<typeof deferred> & { signal: AbortSignal })[] = [];
  const calls: string[] = [];
  const links: string[] = [];
  let audioError = () => {};
  const audioErrors: (() => void)[] = [];
  const services: PlayerServices = {
    now: () => now,
    writeLink: (hash) => links.push(hash),
    loadImages: (_sources, signal) => {
      const request = { ...deferred(), signal };
      loads.push(request);
      return request.promise;
    },
    createAudio: (onError) => {
      audioError = onError;
      audioErrors.push(onError);
      calls.push('create');
      return {
        setActive: async (value) => {
          calls.push(`active:${value}`);
          if (value) await pendingAudio?.promise;
        },
        setMuted: async (value) => {
          calls.push(`muted:${value}`);
        },
        setVolume: (value) => {
          calls.push(`volume:${value}`);
        },
        speak: (_plan, offset, rate) => {
          calls.push(`speak:${offset}:${rate}`);
        },
        play: (sound) => {
          calls.push(sound);
        },
        dispose: () => {
          calls.push('dispose');
        },
      };
    },
  };
  const store = new PlayerStore(scenes, false, hash, services);
  return {
    store,
    loads,
    calls,
    links,
    audioErrors,
    audioError: () => audioError(),
    setNow: (value: number) => {
      now = value;
    },
    delayAudio: () => {
      pendingAudio = deferred();
      return pendingAudio;
    },
  };
}
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

test('construction is inert; loading gates playback and reconnect disposes resources and ignores stale results', async () => {
  const h = setup('#scene=two&t=0.5');
  assert.equal(h.store.timeline.time, 500);
  assert.deepEqual(h.calls, []);
  h.store.connect();
  await h.store.play();
  assert.equal(h.store.timeline.playing, false);
  h.store.disconnect();
  assert.equal(h.loads[0].signal.aborted, true);
  h.store.connect();
  h.loads[0].resolve();
  await flush();
  assert.equal(h.store.loadState, 'loading');
  h.loads[1].resolve();
  await flush();
  assert.equal(h.store.loadState, 'ready');
  assert.equal(h.calls.filter((call) => call === 'create').length, 2);
  assert.equal(h.calls.filter((call) => call === 'dispose').length, 1);
  h.store.disconnect();
});

test('stale load failures cannot poison another scene; current failure blocks play and switching recovers', async () => {
  const h = setup();
  h.store.connect();
  h.store.switchScene(scenes[1]);
  h.loads[0].reject(new Error('late'));
  await flush();
  assert.equal(h.store.error, undefined);
  h.loads[1].reject(new Error('missing'));
  await flush();
  assert.equal(h.store.error, 'image');
  assert.match(h.store.status, /Обновите/);
  await h.store.play();
  assert.equal(h.store.timeline.playing, false);
  h.store.notify('Shared');
  h.store.switchScene(scenes[0]);
  assert.equal(h.store.error, undefined);
  h.loads[2].resolve();
  await flush();
  assert.equal(h.store.loadState, 'ready');
  h.store.disconnect();
});

test('pause, seek, scene switch and disconnect cancel in-flight audio resume', async () => {
  for (const interrupt of ['pause', 'seek', 'switch', 'disconnect'] as const) {
    const h = setup();
    h.store.connect();
    h.loads[0].resolve();
    await flush();
    const pending = h.delayAudio();
    const play = h.store.play();
    if (interrupt === 'pause') h.store.pause();
    if (interrupt === 'seek') h.store.seek(1500);
    if (interrupt === 'switch') h.store.switchScene(scenes[1]);
    if (interrupt === 'disconnect') h.store.disconnect();
    pending.resolve();
    await play;
    assert.equal(h.store.timeline.playing, false, interrupt);
    assert.equal(
      h.calls.some((call) => call.startsWith('speak:')),
      false,
      interrupt,
    );
    h.store.disconnect();
  }
});

test('clock, voice and derived camera follow rate, seek, completion and replay without duplicate speech', async () => {
  const h = setup();
  h.store.connect();
  h.loads[0].resolve();
  await flush();
  const observed: string[] = [];
  const unsubscribe = autorun(() => {
    observed.push(h.store.cue.id);
  });
  await h.store.play();
  h.store.tick(500);
  h.store.tick(600);
  assert.equal(h.store.timeline.time, 600);
  assert.equal(h.calls.filter((call) => call.startsWith('speak:')).length, 1);
  h.store.setRate(2);
  assert.equal(h.calls.at(-1), 'speak:600:2');
  h.store.pause();
  h.store.tick(1000);
  assert.equal(h.store.timeline.time, 600);
  h.store.seek(2500);
  assert.equal(h.store.animation?.camera.scale, 1.5);
  assert.equal(h.links.at(-1), '#scene=one&t=2.5');
  assert.deepEqual(observed, ['first', 'last']);
  h.store.move(1);
  assert.equal(h.store.timeline.time, 2000);
  h.setNow(1000);
  await h.store.play();
  h.store.tick(1500);
  assert.equal(h.store.timeline.time, 3000);
  assert.equal(h.store.timeline.playing, false);
  await h.store.play();
  assert.equal(h.store.timeline.time, 0);
  h.audioError();
  assert.equal(h.store.error, 'audio');
  assert.equal(h.store.timeline.playing, true);
  await h.store.toggleMute();
  assert.equal(h.store.muted, true);
  assert.throws(() => h.store.setRate(4), /скорость/);
  assert.throws(() => h.store.seek(NaN), /позиция/);
  unsubscribe();
  h.store.disconnect();
});

test('film chapters reuse scenes; mode changes and hash navigation preserve rate and exact position', async () => {
  const h = setup();
  h.store.connect();
  h.store.setRate(1.5);
  h.store.selectMode('film');
  h.store.selectScene('two');
  assert.equal(h.store.timeline.time, 3000);
  assert.equal(h.store.source, scenes[1]);
  assert.equal(h.store.scene.cues[2].image, scenes[1].image);
  h.store.seek(3500);
  h.store.selectMode('scene');
  assert.equal(h.store.source, scenes[1]);
  assert.equal(h.store.timeline.time, 500);
  assert.equal(h.store.timeline.rate, 1.5);
  assert.equal(h.store.started, false);
  h.store.followLink('#scene=one&t=1.3');
  assert.equal(h.store.timeline.time, 1300);
  assert.equal(h.store.started, true);
  assert.equal(h.store.timeline.rate, 1.5);
  h.store.disconnect();
});

test('audio failures from a disposed connection cannot overwrite the active connection', () => {
  const h = setup();
  h.store.connect();
  h.store.disconnect();
  h.store.connect();
  h.audioErrors[0]();
  assert.equal(h.store.error, undefined);
  h.audioErrors[1]();
  assert.equal(h.store.error, 'audio');
  h.store.disconnect();
});

test('reconnecting restores saved mute and volume before playback', async () => {
  const h = setup();
  h.store.connect();
  h.store.setVolume(0.2);
  await h.store.toggleMute();
  h.store.disconnect();
  const boundary = h.calls.length;
  h.store.connect();
  assert.equal(h.store.muted, true);
  assert.equal(h.store.volume, 0.2);
  assert.ok(h.calls.slice(boundary).includes('volume:0.2'));
  assert.ok(h.calls.slice(boundary).includes('muted:true'));
  h.loads[1].resolve();
  await flush();
  await h.store.play();
  assert.equal(h.store.timeline.playing, true);
  h.store.disconnect();
});

test('transient notifications cannot replace image or audio recovery diagnostics', () => {
  const h = setup();
  h.store.connect();
  h.store.imageFailed();
  const imageError = h.store.status;
  h.store.notify('Ссылка скопирована');
  assert.equal(h.store.status, imageError);
  assert.equal(h.store.error, 'image');
  h.store.switchScene(scenes[1]);
  assert.equal(h.store.error, undefined);
  assert.doesNotMatch(h.store.status, /Ссылка скопирована/);
  h.audioError();
  const audioError = h.store.status;
  h.store.notify('Другой ответ буфера обмена');
  assert.equal(h.store.status, audioError);
  assert.equal(h.store.error, 'audio');
  h.store.disconnect();
});

test('image failure takes priority over a late audio error until image loading recovers', async () => {
  const h = setup();
  h.store.connect();
  h.store.imageFailed();
  h.audioError();
  assert.equal(h.store.error, 'image');
  assert.match(h.store.status, /Обновите страницу/);
  h.store.switchScene(scenes[1]);
  h.loads[1].resolve();
  await flush();
  assert.equal(h.store.loadState, 'ready');
  assert.equal(h.store.error, 'audio');
  assert.match(h.store.status, /Звук недоступен/);
  h.store.disconnect();
});
