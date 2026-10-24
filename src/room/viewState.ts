/**
 * What the room does to the game, the computer's screen and the radio when the viewer moves between the
 * TV, the room, the computer and the radio, as a pure reducer. Keeping the policy here (instead of inside
 * event handlers) makes the pause/resume/input/screen rules readable in one place and testable
 * without WebGL.
 */
export type RoomView = 'tv' | 'room' | 'pc' | 'radio';

export interface ViewState {
  /** The view the camera is at or travelling to. */
  readonly view: RoomView;
  readonly moving: boolean;
}

export type ViewEvent = { readonly type: 'request'; readonly view: RoomView } | { readonly type: 'arrived' };

export type ViewEffect =
  | 'pauseGame'
  | 'resumeGame'
  | 'enableInput'
  | 'disableInput'
  | 'moveCamera'
  | 'notify'
  /** Landed on the computer: show its live screen. */
  | 'revealScreen'
  /** Leaving the computer (settled or still flying in): hide its live screen before the camera moves. */
  | 'concealScreen'
  /** Flying to the radio: wake it; the lid opens as the camera arrives. */
  | 'approachRadio'
  /** Landed at the radio: its controls go live. */
  | 'revealRadio'
  /** Leaving the radio (settled or still flying in): hide the controls before the camera moves, send the discs home, close the lid. */
  | 'concealRadio';

export interface ViewTransition {
  readonly state: ViewState;
  readonly effects: readonly ViewEffect[];
}

export const INITIAL_VIEW_STATE: ViewState = { view: 'tv', moving: false };

const ARRIVAL_EFFECTS: Readonly<Record<RoomView, readonly ViewEffect[]>> = {
  // The game wakes up only once the camera has landed on the TV, so the PAUSE glyph is still
  // visible during the approach and the first input lands on a settled screen.
  tv: ['resumeGame', 'enableInput'],
  room: [],
  // The live screen replaces the monitor's still only once the camera rests exactly where the
  // screen's placement was computed for.
  pc: ['revealScreen'],
  // The radio's controls sit on its keys and discs only once the camera rests where they were placed.
  radio: ['revealRadio'],
};

/**
 * What leaving a view (settled or still flying to it) undoes first, before anything else moves: the computer's
 * screen is hidden in the same frame the flight's first step draws, over the identical still; the radio's
 * controls hide and its discs head home.
 */
export const LEAVING_EFFECTS: Readonly<Record<RoomView, readonly ViewEffect[]>> = {
  tv: [],
  room: [],
  pc: ['concealScreen'],
  radio: ['concealRadio'],
};

/** What heading for a view starts once the camera is under way: the radio wakes and opens as the camera arrives. */
export const APPROACH_EFFECTS: Readonly<Record<RoomView, readonly ViewEffect[]>> = {
  tv: [],
  room: [],
  pc: [],
  radio: ['approachRadio'],
};

export function reduceView(state: ViewState, event: ViewEvent): ViewTransition {
  if (event.type === 'arrived') {
    if (!state.moving) return { state, effects: [] };
    return { state: { view: state.view, moving: false }, effects: ARRIVAL_EFFECTS[state.view] };
  }
  if (event.view === state.view) return { state, effects: [] };
  const next: ViewState = { view: event.view, moving: true };
  const leaving = LEAVING_EFFECTS[state.view];
  const approach = APPROACH_EFFECTS[event.view];
  return event.view !== 'tv'
    ? { state: next, effects: [...leaving, 'disableInput', 'pauseGame', 'moveCamera', ...approach, 'notify'] }
    : { state: next, effects: [...leaving, 'moveCamera', ...approach, 'notify'] };
}
