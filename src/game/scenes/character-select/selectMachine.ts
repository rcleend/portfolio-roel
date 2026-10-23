import { mod } from '@/engine/math/scalar';

/**
 * The character select's decisions as a pure state machine: which character
 * is shown, which element has focus, and whether the player has committed.
 * The scene feeds it events read from input and turns the returned effects
 * into sound, animation and scene switches, so every rule here is testable
 * without a canvas.
 */

/** Focusable elements, top to bottom: the card (the character itself, shown at its heading) and both skills. */
export type FocusTarget = 'card' | 'skill1' | 'skill2';

export const FOCUS_ORDER: readonly FocusTarget[] = ['card', 'skill1', 'skill2'];

/**
 * How focus arrived. Hover focus follows the pointer, so its tooltip closes
 * when the pointer leaves; keyboard, pad and tap focus is sticky — a tap on a
 * touch screen ends with the finger lifting off, which must not close the
 * tooltip it just opened.
 */
export type FocusSource = 'nav' | 'hover' | 'tap';

export type SelectPhase = 'browsing' | 'chosen' | 'leaving';

export interface SelectState {
  /** Index into the character list. */
  readonly index: number;
  readonly count: number;
  readonly focus: FocusTarget;
  readonly focusSource: FocusSource;
  readonly phase: SelectPhase;
}

export type SelectEvent =
  /** Left/right or an arrow click: show the previous or next character (wraps). */
  | { readonly type: 'switch'; readonly delta: -1 | 1 }
  /** Up/down: move focus through {@link FOCUS_ORDER} (wraps). */
  | { readonly type: 'move'; readonly delta: -1 | 1 }
  /** The pointer moved onto (or pressed) a focusable element. */
  | { readonly type: 'point'; readonly target: FocusTarget; readonly pressed: boolean }
  /** Confirm from keyboard, pad or the on-screen CONFIRM key: commits from any focus, as arcade selects do. */
  | { readonly type: 'confirm' }
  /** Back from keyboard, pad or the on-screen BACK key. */
  | { readonly type: 'back' };

export type SelectEffect =
  | { readonly type: 'switched'; readonly delta: -1 | 1; readonly from: number }
  | { readonly type: 'focused'; readonly target: FocusTarget }
  | { readonly type: 'chosen'; readonly index: number }
  | { readonly type: 'left' };

export interface SelectResult {
  readonly state: SelectState;
  readonly effects: readonly SelectEffect[];
}

export function initialSelectState(count: number, index = 0): SelectState {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('initialSelectState: count must be at least 1');
  return { index: mod(Math.trunc(index), count), count, focus: 'card', focusSource: 'nav', phase: 'browsing' };
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
    case 'move': {
      const position = FOCUS_ORDER.indexOf(state.focus);
      const target = FOCUS_ORDER[mod(position + event.delta, FOCUS_ORDER.length)] ?? state.focus;
      return {
        state: { ...state, focus: target, focusSource: 'nav' },
        effects: [{ type: 'focused', target }],
      };
    }
    case 'point': {
      const focusSource: FocusSource = event.pressed ? 'tap' : 'hover';
      // Pointing at what already has focus only changes how it is held, so it makes no sound.
      if (event.target === state.focus) return { state: { ...state, focusSource }, effects: [] };
      return {
        state: { ...state, focus: event.target, focusSource },
        effects: [{ type: 'focused', target: event.target }],
      };
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

/** The skill slot (0 or 1) that has focus, or `null` when focus is elsewhere. */
export function focusedSkillSlot(focus: FocusTarget): 0 | 1 | null {
  return focus === 'skill1' ? 0 : focus === 'skill2' ? 1 : null;
}
