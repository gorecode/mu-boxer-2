import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { PlayerStore } from './store.ts';

export function useFullscreen(
  store: PlayerStore,
  player: RefObject<HTMLElement | null>,
  button: RefObject<HTMLButtonElement | null>,
) {
  const [expanded, setExpanded] = useState(false);
  const [exitError, setExitError] = useState<string>();
  const pending = useRef(false);
  const active = useRef(false);
  const expand = useCallback(
    (value: boolean) => {
      setExpanded(value);
      setExitError(undefined);
      if (!value) button.current?.focus({ preventScroll: true });
    },
    [button],
  );
  useEffect(() => {
    active.current = true;
    const changed = () => expand(document.fullscreenElement === player.current);
    document.addEventListener('fullscreenchange', changed);
    return () => {
      active.current = false;
      document.removeEventListener('fullscreenchange', changed);
    };
  }, [expand, player]);
  useEffect(() => {
    document.body.classList.toggle('player-expanded', expanded);
    return () => document.body.classList.remove('player-expanded');
  }, [expanded]);
  const toggle = useCallback(async () => {
    if (pending.current || !player.current) return;
    pending.current = true;
    try {
      if (document.fullscreenElement === player.current) await document.exitFullscreen();
      else if (expanded) expand(false);
      else {
        expand(true);
        await player.current.requestFullscreen?.();
      }
    } catch {
      if (!active.current) return;
      const native = document.fullscreenElement === player.current;
      setExitError(
        native
          ? 'Не удалось выйти из полного экрана. Повторите нажатие или используйте системную кнопку выхода.'
          : undefined,
      );
      if (!native && !store.error) store.notify('Просмотр развёрнут в пределах окна браузера.');
    } finally {
      pending.current = false;
    }
  }, [expanded, expand, player, store]);
  return { expanded, exitError, toggle, collapse: () => expand(false) };
}

export function usePlayerLifecycle(
  store: PlayerStore,
  fullscreen: { expanded: boolean; toggle(): Promise<void>; collapse(): void },
) {
  const fullscreenRef = useRef(fullscreen);
  useEffect(() => {
    fullscreenRef.current = fullscreen;
  });
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    store.connect();
    const motion = () => store.setReducedMotion(reduced.matches);
    motion();
    let frameId: number;
    let alive = true;
    const frame = (now: number) => {
      if (!alive) return;
      store.tick(now);
      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
    const hash = () => store.followLink(location.hash);
    const visibility = () => {
      if (document.hidden) store.pause();
    };
    const hide = (event: PageTransitionEvent) => {
      store.pause();
      if (!event.persisted) store.disconnect();
    };
    const key = (event: KeyboardEvent) => {
      const current = fullscreenRef.current;
      if (event.key === 'Escape' && current.expanded && !document.fullscreenElement) {
        current.collapse();
        return;
      }
      if (
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        (event.target instanceof HTMLElement &&
          event.target.closest('input, select, button, a, textarea, [contenteditable]'))
      )
        return;
      if (event.code === 'Space') {
        event.preventDefault();
        void store.play();
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        store.move(-1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        store.move(1);
      }
      if (event.code === 'KeyR') store.restart();
      if (event.code === 'KeyM') void store.toggleMute();
      if (event.code === 'KeyF') void current.toggle();
    };
    window.addEventListener('hashchange', hash);
    window.addEventListener('keydown', key);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', hide);
    reduced.addEventListener('change', motion);
    return () => {
      alive = false;
      cancelAnimationFrame(frameId);
      window.removeEventListener('hashchange', hash);
      window.removeEventListener('keydown', key);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', hide);
      reduced.removeEventListener('change', motion);
      store.disconnect();
    };
  }, [store]);
}
