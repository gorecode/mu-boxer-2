import { commandState, observeDirections, heavyCommand, lightCommand } from './commands.ts';
import './style.css';
import { mountTraining } from './training.ts';
import { celAt } from './moves.ts';
import { createFight, endingTiming, idleInput, pauseFight, resumeFight, startFight, stepFight, type Input, type Phase } from './model.ts';
import { FightAudio, FightRenderer, loadAssets } from './render.ts';

type Button = Exclude<keyof Input, 'attackPressed' | 'attackPresses'>;

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error(`Missing fight element: ${id}`);
  return result as T;
}
const canvas = element<HTMLCanvasElement>('arena');
const start = element<HTMLButtonElement>('start');
const pause = element<HTMLButtonElement>('pause');
const difficulty = element<HTMLSelectElement>('difficulty');
const overlay = element('overlay');
const hitboxes = element<HTMLInputElement>('hitboxes');
const audio = new FightAudio();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let fight = createFight();
let renderer: FightRenderer | undefined;
let lastPhase: Phase | undefined;
let accumulator = 0;
let lastFrame = 0;
let loading = false;
let pendingJump = false;
let pendingDodge = false;
let pendingAttacks: NonNullable<Input['attackPresses']> = [];
let lastDrawPhase: Phase | undefined;
let commands = commandState();
const keys = new Map<string, Button>();
const pointers = new Map<number, Button>();
const bindings: Record<string, Button> = {
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyS: 'down', ArrowDown: 'down',
  KeyW: 'up', ArrowUp: 'up', Space: 'jump', KeyJ: 'light', KeyK: 'heavy', KeyL: 'block', KeyU: 'dodge',
};
function clearInput(): void {
  commands = commandState(); keys.clear(); pointers.clear(); pendingJump = false; pendingDodge = false; pendingAttacks = []; fight.comboQueue = [];
  document.querySelectorAll('.touch-controls .active').forEach(button => button.classList.remove('active'));
}
function input(): Input {
  const current = idleInput();
  for (const key of [...keys.values(), ...pointers.values()]) current[key] = true;
  current.jump = pendingJump; pendingJump = false;
  current.dodge = pendingDodge; pendingDodge = false;
  current.attackPresses = pendingAttacks; pendingAttacks = [];
  return current;
}
function heldInput(): Input {
  const held = idleInput();
  for (const key of [...keys.values(), ...pointers.values()]) held[key] = true;
  return held;
}
function directions(): void { observeDirections(commands, heldInput(), fight.player.facing, performance.now() / 1000); }
function queueAttack(action: Button): void {
  directions();
  if (action === 'dodge') pendingDodge = true;
  if (action === 'long' || action === 'overhand' || action === 'backfist' || action === 'ram' || action === 'counter') { if (pendingAttacks.length < 3) pendingAttacks.push(action); return; }
  if (action !== 'light' && action !== 'heavy') return;
  const held = heldInput();
  if (pendingAttacks.length >= 3) return;
  pendingAttacks.push(action === 'heavy' ? heavyCommand(commands, { ...held, down: held.down && fight.player.y === 0 }, fight.player.facing, performance.now() / 1000, fight.player.y === 0)
    : lightCommand(commands, held, fight.player.facing, performance.now() / 1000, fight.player.y === 0));
}
function reset(play = true): void {
  const chosen = difficulty.value === 'warmup' ? 'warmup' : 'street';
  fight = createFight(chosen, element<HTMLInputElement>('training-mode').checked);
  fight.training.dummy = element<HTMLSelectElement>('training-dummy').value as typeof fight.training.dummy; renderer?.clear(); clearInput(); accumulator = 0; lastPhase = undefined; lastDrawPhase = undefined;
  if (play) { startFight(fight); audio.resume(); canvas.focus({ preventScroll: true }); }
  training.reset(); update();
}
function setPause(): void { pauseFight(fight); clearInput(); audio.stop(); accumulator = 0; update(); }
function resume(): void { resumeFight(fight); clearInput(); audio.resume(); accumulator = 0; canvas.focus({ preventScroll: true }); update(); }
function result(): void {
  const won = fight.phase === 'win', draw = fight.phase === 'draw';
  element('result-label').textContent = fight.remaining <= 0 ? 'ВРЕМЯ ВЫШЛО' : won ? 'ПУТЬ СВОБОДЕН' : 'БОЙ ОКОНЧЕН';
  element('result-title').textContent = won ? 'ВОПРОС РЕШЁН.' : draw ? 'ОБА ПРИ СВОЁМ.' : 'НЕ ТОТ АРГУМЕНТ.';
  element('result-copy').textContent = won ? 'Рабочий больше не возражал.' : draw ? 'Придётся обсудить ещё раз.' : 'У лопаты оказались свои доводы. Попробуй блок и контратаку.';
  element('result-stats').replaceChildren(...[
    [String(fight.hits), 'ПОПАДАНИЙ'], [String(fight.blocked), 'БЛОКОВ'], [`${Math.ceil(90 - fight.remaining)}с`, 'ВРЕМЯ БОЯ'],
  ].map(([value, label]) => { const div = document.createElement('div'); const b = document.createElement('b'); b.textContent = value; div.append(b, label); return div; }));
  element('next-scene').hidden = !won;
}
function update(): void {
  const phase = fight.phase;
  for (const [name, fighter] of [['player', fight.player], ['worker', fight.worker]] as const) {
    element(`${name}-hp`).textContent = `${fighter.hp} / ${fighter.maxHp}`;
    element(`${name}-health`).style.width = `${fighter.hp / fighter.maxHp * 100}%`;
    element(`${name}-health`).setAttribute('aria-valuenow', String(fighter.hp));
    element(`${name}-guard`).style.width = `${fighter.guard}%`;
    element(`${name}-guard`).setAttribute('aria-valuenow', String(Math.round(fighter.guard)));
    element(`${name}-guard`).setAttribute('aria-valuetext', `${Math.round(fighter.guard)}%${fighter.guard < 30 ? ' · низкая защита' : ''}`);
    canvas.dataset[`${name}X`] = fighter.x.toFixed(1);
    canvas.dataset[`${name}Y`] = fighter.y.toFixed(1);
    canvas.dataset[`${name}Action`] = fighter.action?.kind ?? '';
    canvas.dataset[`${name}Reaction`] = fighter.reaction ?? '';
    canvas.dataset[`${name}Stop`] = fighter.stop.toFixed(3);
    canvas.dataset[`${name}ActionTime`] = String(fighter.action?.time ?? 0);
    canvas.dataset[`${name}Hand`] = fighter.action?.hand ?? '';
    canvas.dataset[`${name}Facing`] = String(fighter.facing);
    canvas.dataset[`${name}Contacts`] = fighter.action?.contacts?.join(',') ?? '';
    canvas.dataset[`${name}Cel`] = fighter.action ? celAt(fighter.action.kind, fighter.action.time).cel.phase : '';
    canvas.dataset[`${name}Guard`] = String(fighter.guard);
    element(`${name}-guard-value`).textContent = `${Math.round(fighter.guard)}%`;
    canvas.dataset[`${name}Dodge`] = String(fighter.dodge);
    element(`${name}-guard`).parentElement!.classList.toggle('low-guard', fighter.guard < 30);
  }
  const p = fight.player, guardStatus = element('guard-state');
  let guardState = 'idle', guardText = 'L — УДЕРЖИВАЙ БЛОК';
  if (phase !== 'fighting') { guardState = 'inactive'; guardText = phase === 'paused' ? 'БЛОК НА ПАУЗЕ' : 'L — БЛОК · S + L — НИЗКИЙ'; }
  else if (p.guard === 0 && p.stun > 0) { guardState = 'broken'; guardText = 'ЗАЩИТА СЛОМАНА'; }
  else if (p.reaction === 'guard') { guardState = 'impact'; guardText = p.crouch ? 'НИЗКИЙ БЛОК · УДАР ПРИНЯТ' : 'БЛОК СТОЯ · УДАР ПРИНЯТ'; }
  else if (p.blocking) { guardState = p.crouch ? 'low' : 'high'; guardText = p.crouch ? 'НИЗКИЙ БЛОК · ОТ ПОДСЕЧКИ' : 'БЛОК СТОЯ · ОТ УДАРА СВЕРХУ'; }
  else if (fight.held.block) {
    guardState = 'unavailable';
    guardText = p.action ? 'БЛОК ПОСЛЕ ЗАВЕРШЕНИЯ УДАРА' : p.y > 0 ? 'В ВОЗДУХЕ БЛОК НЕДОСТУПЕН'
      : p.dodge > 0 ? 'БЛОК ПОСЛЕ ОТСКОКА' : 'ОГЛУШЕНИЕ · БЛОК НЕДОСТУПЕН';
  }
  guardStatus.dataset.state = guardState;
  if (guardStatus.textContent !== guardText) guardStatus.textContent = guardText;
  const names = { jab: 'ДЖЕБ', cross: 'ВТОРОЙ ЛЁГКИЙ', heavy: 'ТЯЖЁЛЫЙ', low: 'ПО НОГАМ', upper: 'АППЕРКОТ', rising: 'АППЕРКОТ СТОЯ', long: 'ДЛИННЫЙ ПРЯМОЙ', overhand: 'СВЕРХУ', backfist: 'БЭКФИСТ', ram: 'ТАРАННЫЙ ПРЯМОЙ', counter: 'ПОДШАГ → ДВОЙКА', poke: 'ТЫЧОК', sweep: 'ПОДСЕЧКА', overhead: 'СВЕРХУ', thrust: 'ВЫПАД', spin: 'ВЕРТУШКА' };
  const technique = fight.player.action?.kind === 'heavy' ? fight.player.action.hand === 'right' ? 'ПРАВЫЙ БОКОВОЙ' : 'ЛЕВЫЙ БОКОВОЙ'
    : fight.player.action ? names[fight.player.action.kind] : 'СТОЙКА';
  element('player-technique').textContent = `ПРИЁМ: ${technique}${fight.comboQueue.length ? ' → ' + fight.comboQueue.map(kind => names[kind]).join(' → ') : ''}`;
  canvas.dataset.playerBlock = guardState; canvas.dataset.workerBlock = String(fight.worker.blocking);
  element('timer').textContent = String(Math.ceil(fight.remaining)).padStart(2, '0');
  canvas.dataset.training = String(fight.training.enabled); canvas.dataset.frozen = String(training.frozen());
  canvas.dataset.time = String(fight.time); canvas.dataset.aiIntent = fight.brain.intent; canvas.dataset.gap = String(fight.training.gap);
  canvas.dataset.combo = String(fight.combo);
  canvas.dataset.buffered = fight.buffered?.kind ?? ''; canvas.dataset.comboQueue = fight.comboQueue.join(',');
  canvas.dataset.phase = phase;
  canvas.dataset.loaded = renderer ? 'true' : 'false';
  const ended = phase === 'win' || phase === 'loss' || phase === 'draw';
  training.refresh();
  overlay.hidden = phase === 'fighting' || phase === 'countdown' || phase === 'ending';
  const ending = fight.ending, title = element('ko-callout');
  const progress = ending ? Math.min(1, ending.elapsed / endingTiming[ending.stage]) : 0;
  title.hidden = !ending || ending.stage === 'fall';
  title.textContent = ending?.reason === 'time' ? 'ВРЕМЯ!' : ending?.result === 'draw' ? 'DOUBLE K.O.' : 'K.O.';
  title.style.transform = `translate(-50%, -50%) scale(${reducedMotion || ending?.stage !== 'ko' ? 1 : 1 + .7 * Math.max(0, 1 - ending.elapsed / .25) ** 3})`;
  title.style.opacity = String(ending?.stage === 'fade' ? 1 - progress : 1);
  element('finish-fade').style.opacity = String(ending?.stage === 'fade' ? progress * .92 : 0);
  canvas.dataset.ending = ending?.stage ?? ''; canvas.dataset.endingTime = String(ending?.elapsed ?? 0);
  canvas.dataset.endingReason = ending?.reason ?? '';
  element('intro-card').hidden = phase !== 'menu';
  element('pause-card').hidden = phase !== 'paused';
  element('result-card').hidden = !ended;
  pause.disabled = !['fighting', 'countdown', 'ending', 'paused'].includes(phase);
  pause.firstChild!.textContent = phase === 'paused' ? 'ПРОДОЛЖИТЬ ' : 'ПАУЗА ';
  let callout = '';
  if (phase === 'countdown') callout = fight.countdown > .55 ? 'БОКСЁР ПРОТИВ РАБОЧЕГО' : 'БОЙ!';
  else if (phase === 'fighting' && fight.combo > 1 && fight.comboTime > 0) callout = `${fight.combo} УДАРА ПОДРЯД`;
  element('callout').textContent = callout;
  const attack = fight.worker.action, brain = fight.brain;
  const stageNames = { 1: 'ДЕРЖИТ ДИСТАНЦИЮ', 2: 'ИДЁТ В НАПОР', 3: 'ВЫДЫХАЕТСЯ' };
  const workerStatus = element('worker-state');
  const workerText = `РАБОЧИЙ · ${brain.stage}/3 · ${stageNames[brain.stage]}${brain.stageTime > 0 ? ' · МЕНЯЕТ ХВАТ' : ''}`;
  if (workerStatus.textContent !== workerText) workerStatus.textContent = workerText;
  canvas.dataset.workerStage = String(brain.stage); canvas.dataset.workerStageTime = String(brain.stageTime);
  let hint = brain.stageTime > 0 ? 'МЕНЯЕТ ХВАТ — МОЖНО АТАКОВАТЬ' : 'ВЫМАНИ ВЫПАД. ВОЙДИ ПОСЛЕ ПРОМАХА.';
  if (attack) {
    const m = celAt(attack.kind, attack.time).cel.phase;
    if (m === 'settle' || m === 'recovery') hint = 'ВОЗВРАЩАЕТ ЛОПАТУ — ОКНО ДЛЯ ОТВЕТА';
    else hint = attack.kind === 'sweep' ? 'ЛОПАТА НИЗКО — НИЗКИЙ БЛОК ИЛИ ОТОЙДИ'
      : attack.kind === 'overhead' ? 'УДАР СВЕРХУ — БЛОК СТОЯ ИЛИ ОТСТУПИ'
      : attack.kind === 'spin' ? 'ВЕРТУШКА — ДВА УДАРА. БЛОК И ОТВЕТ ПОСЛЕ ОСТАНОВКИ'
      : attack.kind === 'thrust' ? 'ДАЛЬНИЙ ВЫПАД — ОТСТУПИ ИЛИ ПОСТАВЬ БЛОК' : 'ТЫЧОК — ПРИСЯДЬ ИЛИ ПОСТАВЬ БЛОК';
  }
  element('fight-hint').textContent = phase === 'ending' ? '' : hint;
  element('worker-tell').textContent = phase === 'fighting' ? hint : phase === 'paused' ? 'БОЙ НА ПАУЗЕ' : '';
  element('worker-tell').hidden = !['fighting', 'paused'].includes(phase);
  if (lastPhase !== phase) {
    const labels: Record<Phase, string> = { menu: 'Двор у участкового', countdown: 'Боксёр против Рабочего', fighting: 'Бой идёт', ending: 'Завершение боя', paused: 'Пауза', win: 'Победа Боксёра', loss: 'Победа Рабочего', draw: 'Ничья' };
    element('state-label').textContent = labels[phase];
    if (phase === 'ending') clearInput();
    if (ended) { result(); clearInput(); element('restart').focus({ preventScroll: true }); }
    if (phase === 'paused') element('resume').focus({ preventScroll: true });
    lastPhase = phase;
  }
  if (phase === 'ending' && ending?.stage === 'ko') {
    const label = ending.reason === 'ko' ? 'Нокаут' : 'Время вышло';
    if (element('state-label').textContent !== label) element('state-label').textContent = label;
  }
}
async function load(): Promise<void> {
  if (loading) return;
  loading = true; start.disabled = true; start.textContent = 'ЗАГРУЗКА РИСУНКОВ…';
  element('load-status').textContent = 'Готовим двор и бойцов.';
  try {
    const assets = await loadAssets();
    renderer = new FightRenderer(canvas, assets, reducedMotion);
    renderer.draw(fight, hitboxes.checked); start.disabled = false; start.textContent = 'НАЧАТЬ БОЙ →';
    element('load-status').textContent = 'Клавиатура или кнопки под ареной.';
  } catch (error) {
    element('load-status').textContent = error instanceof Error ? error.message : 'Не удалось подготовить бой.';
    start.disabled = false; start.textContent = 'ПОВТОРИТЬ ЗАГРУЗКУ';
  } finally { loading = false; update(); }
}
function tick(): void {
  stepFight(fight, input(), 1 / 120);
  renderer?.events(fight.events, fight);
  for (const event of fight.events) audio.event(event);
  renderer?.update(1 / 120);
}
const training = mountTraining(canvas, {
  fight: () => fight, clear: clearInput, step: tick,
  draw: () => { update(); renderer?.draw(fight, hitboxes.checked); },
  reset: () => reset(fight.phase !== 'menu'),
  replace: s => { fight = s; clearInput(); accumulator = 0; lastPhase = undefined; renderer?.clear(); update(); renderer?.draw(fight, hitboxes.checked); },
});
hitboxes.addEventListener('change', () => renderer?.draw(fight, hitboxes.checked));
start.addEventListener('click', () => { if (!renderer) { void load(); return; } reset(); });
element('resume').addEventListener('click', resume);
pause.addEventListener('click', () => { if (fight.phase === 'paused') resume(); else setPause(); });
for (const id of ['restart', 'pause-restart']) element(id).addEventListener('click', () => reset());
element('sound').addEventListener('click', async () => {
  try {
    const enabled = await audio.toggle(); element('sound').textContent = enabled ? 'ЗВУК ВКЛ' : 'ЗВУК ВЫКЛ';
    element('sound').setAttribute('aria-pressed', String(enabled));
    if (fight.phase === 'paused' || fight.phase === 'menu') audio.stop();
  } catch { element('sound').textContent = 'ЗВУК НЕДОСТУПЕН'; }
});
element('fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.querySelector('.arena-shell')!.requestFullscreen(); }
  catch { element('state-label').textContent = 'Полный экран недоступен в этом браузере.'; }
});
document.addEventListener('keydown', event => {
  if (event.target instanceof HTMLElement && event.target.closest('input:not([type=checkbox]),select,textarea,[contenteditable=true]')) return;
  if (event.code === 'Space' && event.target instanceof HTMLElement && event.target.closest('button,a,input,summary')) return;
  if (event.code === 'Escape' || event.code === 'KeyP') {
    if (!event.repeat) { if (fight.phase === 'paused') resume(); else setPause(); } return;
  }
  if (event.code === 'KeyR' && !event.repeat && renderer && fight.phase !== 'menu') { reset(); return; }
  const action = bindings[event.code];
  if (!action || !['countdown', 'fighting'].includes(fight.phase)) return;
  event.preventDefault();
  if (event.repeat) return;
  if (action === 'jump' && !event.repeat && ![...keys.values()].includes('jump')) pendingJump = true;
  keys.set(event.code, action);
  queueAttack(action);
});
document.addEventListener('keyup', event => {
  keys.delete(event.code); directions();
});
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-input]')) {
  const action = button.dataset.input as Button;
  const key = `button:${action}`;
  button.addEventListener('keydown', event => {
    if (!['Space', 'Enter'].includes(event.code) || !['fighting', 'countdown'].includes(fight.phase)) return;
    event.preventDefault(); event.stopPropagation();
    if (event.repeat) return;
    if (action === 'jump' && !event.repeat) pendingJump = true;
    keys.set(key, action); queueAttack(action); button.classList.add('active');
  });
  button.addEventListener('keyup', event => {
    if (!['Space', 'Enter'].includes(event.code)) return;
    event.preventDefault(); keys.delete(key); directions(); button.classList.remove('active');
  });
  button.addEventListener('blur', () => { keys.delete(key); directions(); button.classList.remove('active'); });
  button.addEventListener('pointerdown', event => {
    if (fight.phase !== 'fighting' && fight.phase !== 'countdown') return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId); pointers.set(event.pointerId, action);
    if (action === 'jump') pendingJump = true;
    queueAttack(action);
    button.classList.add('active');
  });
  const release = (event: PointerEvent) => {
    pointers.delete(event.pointerId); directions();
    button.classList.toggle('active', [...pointers.values()].includes(button.dataset.input as Button));
  };
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) button.addEventListener(name, release);
}
window.addEventListener('blur', setPause);
window.addEventListener('pagehide', setPause);
document.addEventListener('visibilitychange', () => { if (document.hidden) setPause(); });
function frame(now: number): void {
  const dt = lastFrame ? Math.min(.1, (now - lastFrame) / 1000) : 0; lastFrame = now;
  const active = (fight.phase === 'fighting' || fight.phase === 'countdown' || fight.phase === 'ending') && !training.frozen();
  if (active) {
    accumulator += dt * training.speed();
    while (accumulator >= 1 / 120) {
      tick(); accumulator -= 1 / 120;
      if (fight.phase !== 'fighting' && fight.phase !== 'countdown' && fight.phase !== 'ending') { accumulator = 0; break; }
    }
  }
  if (!active) accumulator = 0;
  if (active || lastDrawPhase !== fight.phase) {
    update(); renderer?.draw(fight, hitboxes.checked); lastDrawPhase = fight.phase;
  }
  requestAnimationFrame(frame);
}
void load(); requestAnimationFrame(frame);
