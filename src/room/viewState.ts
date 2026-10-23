/**
 * What the room does to the game and the computer's screen when the viewer moves between the
 * TV, the room and the computer, as a pure reducer. Keeping the policy here (instead of inside
 * event handlers) makes the pause/resume/input/screen rules readable in one place and testable
 * without WebGL.
 */
export type RoomView = 'tv' | 'room' | 'pc';

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
  | 'concealScreen';

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
};

export function reduceView(state: ViewState, event: ViewEvent): ViewTransition {
  if (event.type === 'arrived') {
    if (!state.moving) return { state, effects: [] };
    return { state: { view: state.view, moving: false }, effects: ARRIVAL_EFFECTS[state.view] };
  }
  if (event.view === state.view) return { state, effects: [] };
  const next: ViewState = { view: event.view, moving: true };
  // Hidden in the same frame the flight's first step draws, over the identical still.
  const leaving: readonly ViewEffect[] = state.view === 'pc' ? ['concealScreen'] : [];
  return event.view !== 'tv'
    ? { state: next, effects: [...leaving, 'disableInput', 'pauseGame', 'moveCamera', 'notify'] }
    : { state: next, effects: [...leaving, 'moveCamera', 'notify'] };
}
