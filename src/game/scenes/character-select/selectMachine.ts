import { mod } from '@/engine/math/scalar';

/**
 * The character select's decisions as a pure state machine: which character
 * is shown and whether the player has committed. The scene feeds it events
 * read from input and turns the returned effects into sound, animation and
 * scene switches, so every rule here is testable without a canvas.
 */

export type SelectPhase = 'browsing' | 'chosen' | 'leaving';

export interface SelectState {
  /** Index into the character list. */
  readonly index: number;
  readonly count: number;
  readonly phase: SelectPhase;
}

export type SelectEvent =
  /** Left/right or an arrow click: show the previous or next character (wraps). */
  | { readonly type: 'switch'; readonly delta: -1 | 1 }
  /** Confirm from keyboard, pad or the on-screen CONFIRM key. */
  | { readonly type: 'confirm' }
  /** Back from keyboard, pad or the on-screen BACK key. */
  | { readonly type: 'back' };

export type SelectEffect =
  | { readonly type: 'switched'; readonly delta: -1 | 1; readonly from: number }
  | { readonly type: 'chosen'; readonly index: number }
  | { readonly type: 'left' };

export interface SelectResult {
  readonly state: SelectState;
  readonly effects: readonly SelectEffect[];
}

export function initialSelectState(count: number, index = 0): SelectState {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('initialSelectState: count must be at least 1');
  return { index: mod(Math.trunc(index), count), count, phase: 'browsing' };
}

export function reduceSelect(state: SelectState, event: SelectEvent): SelectResult {
  // Once the player has committed (or walked away) the screen only plays out its exit.
  if (state.phase !== 'browsing') return { state, effects: [] };

  switch (event.type) {
    case 'switch': {
      if (state.count < 2) return { state, effects: [] };
      const next = { ...state, index: mod(state.index + event.delta, state.count) };
      return { state: next, effects: [{ type: 'switched', delta: event.delta, from: state.index }] };
    }
    case 'confirm':
      return { state: { ...state, phase: 'chosen' }, effects: [{ type: 'chosen', index: state.index }] };
    case 'back':
      return { state: { ...state, phase: 'leaving' }, effects: [{ type: 'left' }] };
  }
}

/** Applies events in order, collecting every effect. */
export function reduceSelectAll(state: SelectState, events: readonly SelectEvent[]): SelectResult {
  let current = state;
  const effects: SelectEffect[] = [];
  for (const event of events) {
    const result = reduceSelect(current, event);
    current = result.state;
    effects.push(...result.effects);
  }
  return { state: current, effects };
}
