import './style.css';
import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { duration } from './motion.ts';
import { LayerStore } from './store.ts';

export const LayerApp = observer(function LayerApp() {
  const [store] = useState(() => new LayerStore(location.search, () => performance.now()));
  const city = useRef<HTMLImageElement>(null);
  useEffect(() => {
    store.connect();
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => store.setReduced(media.matches);
    motion();
    let frameId: number;
    let alive = true;
    void city
      .current!.decode()
      .then(() => {
        if (alive) store.imageReady();
      })
      .catch(() => {
        if (alive) store.imageFailed();
      });
    const cleanup = () => {
      alive = false;
      cancelAnimationFrame(frameId);
      store.disconnect();
    };
    const frame = (now: number) => {
      if (!alive) return;
      store.tick(now);
      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
    const visibility = () => {
      if (document.hidden) store.pause();
    };
    const hide = (event: PageTransitionEvent) => {
      store.pause();
      if (!event.persisted) cleanup();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', hide);
    media.addEventListener('change', motion);
    return () => {
      cleanup();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', hide);
      media.removeEventListener('change', motion);
    };
  }, [store]);
  const state = store.state;
  return (
    <main>
      <a href="./">← Основной стенд</a>
      <p className="eyebrow">GSAP / ЭКСПЕРИМЕНТ 02</p>
      <h1>Город. Справка. Печать.</h1>
      <p>Технический этюд вне сюжета. Одинаковая постановка, два способа анимации.</p>
      <div id="layer-stage" role="img" aria-label="Город, передний план, справка и штамп ОБЕД">
        <img
          id="city"
          ref={city}
          src={`${import.meta.env.BASE_URL}art/epilogue-city-v1.webp`}
          alt="Промышленный город из эпилога"
          style={{ transform: `translateX(${state.city}%)` }}
        />
        <div
          id="rail"
          aria-hidden="true"
          style={{ transform: `translateX(${state.rail}%) rotate(-4deg)` }}
        />
        <div
          id="paper"
          aria-hidden="true"
          style={{ transform: `translateY(${state.paper}%) rotate(${state.angle}deg)` }}
        >
          <small>МИНИСТЕРСТВО БЫТОВЫХ ОБСТОЯТЕЛЬСТВ</small>
          <h2>СПРАВКА</h2>
          <p>ОБ ОТСУТСТВИИ СУДИМОСТИ</p>
          <hr />
          <hr />
          <hr />
          <span
            id="stamp"
            style={{ transform: `rotate(-12deg) scale(${state.stamp})`, opacity: state.ink }}
          >
            ОБЕД
          </span>
        </div>
        <div id="black" aria-hidden="true" style={{ opacity: state.black }} />
      </div>
      <div className="controls">
        <label>
          Анимация{' '}
          <select
            id="engine"
            value={store.engine}
            onChange={(event) => store.setEngine(event.currentTarget.value as 'native' | 'gsap')}
          >
            <option value="gsap">GSAP</option>
            <option value="native">Без библиотеки</option>
          </select>
        </label>
        <label>
          Начальная выдержка{' '}
          <select
            id="lead"
            value={store.lead}
            onChange={(event) => store.setLead(Number(event.currentTarget.value))}
          >
            <option value="800">0,8 с</option>
            <option value="1300">1,3 с</option>
          </select>
        </label>
        <label>
          Скорость{' '}
          <select
            id="speed"
            value={store.rate}
            onChange={(event) => store.setRate(Number(event.currentTarget.value))}
          >
            <option value="1">1×</option>
            <option value="2">2×</option>
          </select>
        </label>
      </div>
      <label className="seek">
        Позиция{' '}
        <input
          id="seek"
          type="range"
          min={0}
          max={duration(store.lead)}
          step={1}
          value={store.time}
          onInput={(event) => store.seek(Number(event.currentTarget.value))}
        />
      </label>
      <div className="controls">
        <button id="play" disabled={!store.ready} onClick={store.toggle}>
          {store.playing ? 'Пауза' : 'Смотреть'}
        </button>
        <button id="restart" disabled={!store.ready} onClick={store.restart}>
          Сначала
        </button>
        <output id="time">
          {(store.time / 1000).toFixed(2)} / {(duration(store.lead) / 1000).toFixed(2)} с
        </output>
      </div>
      <p id="status" role="status">
        {store.status}
      </p>
      <p className="note">
        Камера города и передний план движутся параллельно; лист появляется, затем штамп оседает с
        отскоком. После выдержки — затемнение. Переключение движка сохраняет позицию и ставит
        просмотр на паузу.
      </p>
    </main>
  );
});
