import { useRef, useState, type CSSProperties, type RefObject } from 'react';
import { observer } from 'mobx-react-lite';
import { scenes } from '../scenes.ts';
import { sceneLink } from '../scene.ts';
import { subtitleAt } from '../speech.ts';
import { PlayerStore } from './store.ts';
import { browserServices } from './browser.ts';
import { useFullscreen, usePlayerLifecycle } from './hooks.ts';

function formatTime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

const Stage = observer(function Stage({
  store,
  stage,
}: {
  store: PlayerStore;
  stage: RefObject<HTMLDivElement | null>;
}) {
  const { timeline, cue, source, animation, visual, started } = store;
  const camera = animation?.camera ?? visual.camera;
  const elapsed = timeline.time - cue.start;
  return (
    <div
      className={`stage${source.hardCuts ? ' hard-cuts' : ''}`}
      id="stage"
      ref={stage}
      tabIndex={0}
      aria-label="Кадр сцены. Пробел — пауза, стрелки — смена кадра"
    >
      <img
        id="art"
        src={visual.image}
        alt={visual.imageAlt}
        draggable={false}
        onError={store.imageFailed}
        style={{
          transform: `scale(${camera.scale})`,
          transformOrigin: `${camera.x}% ${camera.y}%`,
        }}
      />
      <div className="stage-shade" />
      <div className="stage-texture" aria-hidden="true" />
      <div
        className="scene-flash"
        id="scene-flash"
        aria-hidden="true"
        style={{ opacity: animation?.flash ?? 0 }}
        hidden={!started || !timeline.playing || !animation?.flash || store.reducedMotion}
      />
      <div
        className="scene-blackout"
        id="scene-blackout"
        aria-hidden="true"
        style={{ opacity: started ? (animation?.blackout ?? 0) : 0 }}
      />
      <span className="frame-counter" id="frame-counter">
        КАДР {String(store.cueIndex + 1).padStart(2, '0')} / {store.scene.cues.length}
      </span>
      <span
        className="scene-setting"
        id="scene-setting"
        hidden={!started || !cue.setting || !!cue.titleCard}
      >
        {cue.setting}
      </span>
      <span
        className="paused-mark"
        id="paused-mark"
        hidden={!started || timeline.playing || !!cue.fight || !!cue.titleCard}
      >
        ПАУЗА
      </span>
      <div
        className="subtitle"
        id="subtitle"
        hidden={!started || !cue.text || elapsed < (cue.speechDelay ?? 0)}
      >
        <span id="speaker">{cue.speaker}</span>
        <p id="caption" aria-label={cue.text}>
          <span id="caption-layout" aria-hidden="true">
            {cue.text}
          </span>
          <span id="caption-typed" aria-hidden="true">
            {subtitleAt(cue.speech, elapsed)}
          </span>
        </p>
      </div>
      <div className="start-overlay" id="start-overlay" hidden={started}>
        <span className="eyebrow" id="story-location">
          {store.scene.intro?.location ?? store.scene.subtitle}
        </span>
        <p className="start-title" id="story-intro">
          {store.scene.intro?.title ?? store.scene.title}
        </p>
        <button
          className="primary"
          id="start"
          disabled={store.loadState !== 'ready'}
          onClick={() => {
            void store.play();
            stage.current?.focus();
          }}
        >
          {store.startLabel}
        </button>
        <span className="start-note" id="story-duration">
          Длительность: {store.scene.duration / 1000} с · субтитры и му-озвучка
        </span>
      </div>
      <div
        className="fight-overlay"
        id="fight"
        hidden={!started || !cue.fight}
        style={
          {
            '--fight-scale': animation?.fightScale ?? 1,
            '--fight-y': `${animation?.fightY ?? 0}px`,
          } as CSSProperties
        }
      >
        <span className="eyebrow">РАЗГОВОР НЕ СЛОЖИЛСЯ</span>
        <div className="versus">
          <strong>БОКСЁР</strong>
          <em>ПРОТИВ</em>
          <strong id="opponent">{source.opponent.toUpperCase()}</strong>
        </div>
        <button
          className="primary"
          id="resolve"
          hidden={!!store.chapter || store.fightResolved}
          onClick={store.resolveFight}
        >
          Разобраться
        </button>
        <p id="fight-note" hidden={!store.fightResolved}>
          Дальше — бой. В этом стенде проверяем только сюжетную сцену.
        </p>
      </div>
      <div
        className="title-card"
        id="title-card"
        hidden={!started || !cue.titleCard}
        style={{
          background: cue.blackout?.from === 1 && cue.blackout.to === 1 ? 'transparent' : undefined,
          opacity: animation?.titleOpacity ?? 1,
          transform: `translateY(${animation?.titleY ?? 0}px)`,
        }}
      >
        <span className="eyebrow" id="title-card-eyebrow">
          {cue.titleCard?.eyebrow}
        </span>
        <p id="title-card-title">{cue.titleCard?.title}</p>
      </div>
    </div>
  );
});

const Transport = observer(function Transport({
  store,
  fullscreen,
  button,
}: {
  store: PlayerStore;
  fullscreen: ReturnType<typeof useFullscreen>;
  button: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="transport">
      <label className="sr-only" htmlFor="scrub">
        Позиция сцены
      </label>
      <input
        id="scrub"
        type="range"
        min={0}
        max={store.scene.duration}
        value={store.timeline.time}
        step={1}
        style={
          {
            '--progress': `${(store.timeline.time / store.scene.duration) * 100}%`,
          } as CSSProperties
        }
        onInput={(event) => store.seek(Number(event.currentTarget.value))}
      />
      <div className="transport-row">
        <div className="playback-buttons">
          <button
            className="icon-button"
            id="restart"
            aria-label="Сначала"
            title="Сначала (R)"
            onClick={store.restart}
          >
            ↺
          </button>
          <button
            className="icon-button"
            id="previous"
            aria-label="Предыдущий кадр"
            title="Предыдущий кадр (←)"
            disabled={store.timeline.time === 0}
            onClick={() => store.move(-1)}
          >
            |‹
          </button>
          <button
            className="play-button"
            id="play"
            aria-label={store.timeline.playing ? 'Пауза' : 'Воспроизвести'}
            title="Пауза / просмотр (Пробел)"
            disabled={store.loadState !== 'ready'}
            onClick={() => void store.play()}
          >
            {store.timeline.playing ? 'Ⅱ' : '▶'}
          </button>
          <button
            className="icon-button"
            id="next"
            aria-label="Следующий кадр"
            title="Следующий кадр (→)"
            disabled={store.cueIndex === store.scene.cues.length - 1}
            onClick={() => store.move(1)}
          >
            ›|
          </button>
        </div>
        <output id="clock">
          {formatTime(store.timeline.time)} / {formatTime(store.scene.duration)}
        </output>
        <div className="sound-controls">
          <button
            className="icon-button sound-button"
            id="mute"
            aria-label={store.muted ? 'Включить звук' : 'Выключить звук'}
            aria-pressed={store.muted}
            onClick={() => void store.toggleMute()}
          >
            {store.muted ? 'ЗВУК ВЫКЛ' : 'ЗВУК ВКЛ'}
          </button>
          <label className="sr-only" htmlFor="volume">
            Громкость
          </label>
          <input
            id="volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={store.volume}
            onChange={(event) => store.setVolume(Number(event.currentTarget.value))}
          />
          <button
            className="icon-button"
            id="fullscreen"
            ref={button}
            aria-label={fullscreen.expanded ? 'Свернуть просмотр' : 'Полный экран'}
            aria-pressed={fullscreen.expanded}
            title={fullscreen.expanded ? 'Свернуть просмотр (Esc / F)' : 'Полный экран (F)'}
            onClick={() => void fullscreen.toggle()}
          >
            {fullscreen.expanded ? '×' : '⛶'}
          </button>
        </div>
      </div>
    </div>
  );
});

const CueList = observer(function CueList({ store }: { store: PlayerStore }) {
  const current = store.cue.id;
  return (
    <ol className="cue-list" id="cues">
      {store.scene.cues.map((cue, index) => (
        <li key={cue.id}>
          <button
            data-cue={cue.id}
            aria-current={current === cue.id ? 'step' : undefined}
            onClick={() => store.seek(cue.start)}
          >
            <span className="cue-number">{String(index + 1).padStart(2, '0')}</span>
            <span>{cue.label}</span>
            <time>{formatTime(cue.start)}</time>
          </button>
        </li>
      ))}
    </ol>
  );
});

const ReviewPanel = observer(function ReviewPanel({ store }: { store: PlayerStore }) {
  return (
    <aside className="review-panel" aria-label="Инструменты просмотра">
      <div className="panel-header">
        <h2>Монтажный лист</h2>
        <span id="cue-count">{store.scene.cues.length} КАДРОВ</span>
      </div>
      <label className="field-label" htmlFor="mode-select">
        РЕЖИМ
      </label>
      <select
        id="mode-select"
        value={store.scene.id === 'film' ? 'film' : 'scene'}
        onChange={(event) => store.selectMode(event.currentTarget.value)}
      >
        <option value="scene">Отдельная сцена</option>
        <option value="film">Игрофильм · всё подряд</option>
      </select>
      <label className="field-label" id="scene-label" htmlFor="scene-select">
        {store.scene.id === 'film' ? 'ГЛАВА' : 'СЦЕНА'}
      </label>
      <select
        id="scene-select"
        value={store.source.id}
        onChange={(event) => store.selectScene(event.currentTarget.value)}
      >
        {store.scenes.map((scene) => (
          <option key={scene.id} value={scene.id}>
            {scene.title}
          </option>
        ))}
      </select>
      <div className="review-settings">
        <label htmlFor="speed">Скорость</label>
        <select
          id="speed"
          value={store.timeline.rate}
          onChange={(event) => store.setRate(Number(event.currentTarget.value))}
        >
          {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
            <option key={rate} value={rate}>
              {String(rate).replace('.', ',')}×
            </option>
          ))}
        </select>
      </div>
      <CueList store={store} />
      <div className="panel-foot">
        <span className="red-dot" /> Любой кадр можно пересмотреть отдельно.
      </div>
    </aside>
  );
});

const Heading = observer(function Heading({ store }: { store: PlayerStore }) {
  return (
    <div className="scene-heading">
      <div>
        <p className="eyebrow" id="chapter">
          {store.chapter ? `ИГРОФИЛЬМ · ${store.source.subtitle}` : store.source.subtitle}
        </p>
        <h1 id="title">{store.source.title}</h1>
      </div>
      <span className="version">ПРОТОТИП / 03</span>
    </div>
  );
});

const Status = observer(function Status({
  store,
  exitError,
}: {
  store: PlayerStore;
  exitError: string | undefined;
}) {
  return (
    <p
      className={`status${exitError ? ' fullscreen-error' : ''}`}
      id="status"
      role="status"
      aria-live="polite"
      data-error={store.error}
    >
      {exitError ?? store.status}
    </p>
  );
});

async function share(store: PlayerStore): Promise<void> {
  const hash = sceneLink(store.scene, store.timeline.time);
  history.replaceState(null, '', hash);
  store.notify('Ссылка на текущий момент — в адресной строке.');
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(location.href);
      store.notify('Ссылка на текущий момент скопирована.');
    }
  } catch {
    store.notify('Ссылка на текущий момент — в адресной строке.');
  }
}

export function PlayerApp({ filmPage }: { filmPage: boolean }) {
  const [store] = useState(() => new PlayerStore(scenes, filmPage, location.hash, browserServices));
  const player = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const fullscreen = useFullscreen(store, player, button);
  usePlayerLifecycle(store, fullscreen);
  return (
    <>
      <header className="masthead">
        <a className="wordmark" href="#" aria-label="Месть боксёра 2, начало">
          МЕСТЬ БОКСЁРА <span>II</span>
        </a>
        <span className="lab-mark">
          <i /> СТЕНД СЮЖЕТНЫХ СЦЕН
        </span>
        <a className="view-link" href={filmPage ? './' : './film.html'}>
          {filmPage ? 'К сценам' : 'Смотреть игрофильм'} ↗
        </a>
      </header>
      <main>
        <Heading store={store} />
        <div className="workspace">
          <section
            className={`screen-column${fullscreen.expanded ? ' is-expanded' : ''}`}
            id="player"
            ref={player}
            aria-label="Просмотр сцены"
          >
            <Stage store={store} stage={stage} />
            <Transport store={store} fullscreen={fullscreen} button={button} />
            <Status store={store} exitError={fullscreen.exitError} />
            <div className="under-screen">
              <span>КОМИКС · МУ-ОЗВУЧКА</span>
              <button className="text-button" id="share" onClick={() => void share(store)}>
                Ссылка на этот момент ↗
              </button>
            </div>
          </section>
          <ReviewPanel store={store} />
        </div>
        <footer>
          <span>Турнир завтра. Боксёр ещё ничего не знает.</span>
          <span>
            ПРОБЕЛ — ПАУЗА <b>·</b> ← → — КАДРЫ <b>·</b> R — СНАЧАЛА
          </span>
        </footer>
      </main>
    </>
  );
}
