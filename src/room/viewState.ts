/**
 * What the room does to the game when the viewer moves between the TV and the room, as a
 * pure reducer. Keeping the policy here (instead of inside event handlers) makes the
 * pause/resume/input rules readable in one place and testable without WebGL.
 */
export type RoomView = 'tv' | 'room';

export interface ViewState {
  /** The view the camera is at or travelling to. */
  readonly view: RoomView;
  readonly moving: boolean;
}

export type ViewEvent = { readonly type: 'request'; readonly view: RoomView } | { readonly type: 'arrived' };

export type ViewEffect = 'pauseGame' | 'resumeGame' | 'enableInput' | 'disableInput' | 'moveCamera' | 'notify';

export interface ViewTransition {
  readonly state: ViewState;
  readonly effects: readonly ViewEffect[];
}

export const INITIAL_VIEW_STATE: ViewState = { view: 'tv', moving: false };

export function reduceView(state: ViewState, event: ViewEvent): ViewTransition {
  if (event.type === 'arrived') {
    if (!state.moving) return { state, effects: [] };
    // The game wakes up only once the camera has landed on the TV, so the PAUSE glyph is
    // still visible during the approach and the first input lands on a settled screen.
    return { state: { view: state.view, moving: false }, effects: state.view === 'tv' ? ['resumeGame', 'enableInput'] : [] };
  }
  if (event.view === state.view) return { state, effects: [] };
  const next: ViewState = { view: event.view, moving: true };
  return event.view === 'room'
    ? { state: next, effects: ['disableInput', 'pauseGame', 'moveCamera', 'notify'] }
    : { state: next, effects: ['moveCamera', 'notify'] };
}
