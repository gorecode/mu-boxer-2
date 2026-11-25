import type { Input } from './model.ts';
export interface CommandState { forward: boolean; back: boolean; facing: number; forwardTap: number; forwardDouble: number; backTap: number; backDouble: number; modifier: 'upper' | 'overhand' | 'backfist' | null; modifierUntil: number; heldModifier: CommandState['modifier'] }
export const commandState = (): CommandState => ({ forward: false, back: false, facing: 0, forwardTap: -Infinity, forwardDouble: -Infinity, backTap: -Infinity, backDouble: -Infinity, modifier: null, modifierUntil: -Infinity, heldModifier: null });
export function observeDirections(state: CommandState, input: Input, facing: number, now: number): void {
  if (state.facing !== facing) Object.assign(state, commandState(), { facing });
  const forward = facing === 1 ? input.right && !input.left : input.left && !input.right;
  if (forward && !state.forward) {
    state.forwardDouble = now - state.forwardTap <= .28 ? now : -Infinity;
    state.forwardTap = now;
  }
  state.forward = forward;
  const back = facing === 1 ? input.left && !input.right : input.right && !input.left;
  if (back && !state.back) {
    state.backDouble = now - state.backTap <= .28 ? now : -Infinity;
    state.backTap = now;
  }
  state.back = back;
  if (input.block) { state.forwardTap = state.forwardDouble = state.backTap = state.backDouble = -Infinity; }
  const modifier = input.down ? 'upper' : input.up ? 'overhand' : back ? 'backfist' : null;
  if (input.block || forward) { state.modifier = null; state.modifierUntil = -Infinity; }
  else if (modifier || state.heldModifier) { state.modifier = modifier ?? state.heldModifier; state.modifierUntil = now + .14; }
  state.heldModifier = input.block || forward ? null : modifier;
}
export function lightCommand(state: CommandState, input: Input, facing: number, now: number, grounded = true): 'light' | 'low' | 'ram' | 'counter' {
  if (grounded && input.down) return 'low';
  if (!grounded || input.block || input.up || input.left && input.right) return 'light';
  const forward = facing === 1 ? input.right : input.left, back = facing === 1 ? input.left : input.right;
  const kind = !back && now - state.forwardDouble <= .25 && state.forwardDouble >= state.backDouble ? 'ram'
    : !forward && now - state.backDouble <= .25 && state.backDouble > state.forwardDouble ? 'counter' : null;
  if (!kind) return 'light';
  state.forwardTap = state.forwardDouble = state.backTap = state.backDouble = -Infinity;
  return kind;
}
export function heavyCommand(state: CommandState, input: Input, facing: number, now: number, grounded = true): NonNullable<Input['attackPressed']> {
  if (input.down) return 'upper';
  if (input.up) return 'overhand';
  if (grounded && state.modifier && now <= state.modifierUntil) return state.modifier;
  if (now - state.forwardDouble <= .25 && !(facing === 1 ? input.left : input.right)) {
    state.forwardDouble = -Infinity; state.forwardTap = -Infinity;
    return 'long';
  }
  return (facing === 1 ? input.left && !input.right : input.right && !input.left) ? 'backfist' : 'heavy';
}
