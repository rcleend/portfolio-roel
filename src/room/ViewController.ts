import type { GameSurface } from '@/engine/core/GameSurface';
import { INITIAL_VIEW_STATE, type RoomView, reduceView, type ViewEffect, type ViewState } from './viewState';

export interface ViewControllerOptions {
  readonly surface: GameSurface;
  /**
   * Starts the camera from `from` (the view it was at or flying to) towards `to`; must call
   * `arrived()` once it is there.
   */
  readonly moveCamera: (from: RoomView, to: RoomView, arrived: () => void) => void;
  /** Lets go of any pointer gesture on the game, e.g. before pausing it. */
  readonly releasePointer: () => void;
  /** The camera landed on the computer: show its live screen. */
  readonly revealScreen: () => void;
  /** The camera is about to leave the computer: hide its live screen. */
  readonly concealScreen: () => void;
  /** The camera is on its way to the radio: wake it and open its lid as the camera arrives. */
  readonly approachRadio: () => void;
  /** The camera landed at the radio: its controls go live. */
  readonly revealRadio: () => void;
  /** The camera is about to leave the radio (or turn back on the way there): hide its controls, close it up. */
  readonly concealRadio: () => void;
  /**
   * A view whose code is still loading (the radio's, which leaves the first load): a promise the request waits for
   * before the camera sets off, else null. A later request supersedes a waiting one; a rejected wait drops it.
   */
  readonly whenReady?: (view: RoomView) => Promise<unknown> | null;
}

/**
 * Applies the view policy from viewState.ts to the real world: pauses and resumes the game,
 * gates its input, shows and hides the computer's screen and the radio's controls, moves the
 * camera and tells listeners.
 */
export class ViewController {
  private state: ViewState = INITIAL_VIEW_STATE;
  private pausedByRoom = false;
  private readonly listeners = new Set<(view: RoomView) => void>();
  private readonly settleListeners = new Set<(view: RoomView) => void>();
  /** Counts requests, so a request waiting for its view's code knows whether a later one superseded it. */
  private requests = 0;

  constructor(private readonly options: ViewControllerOptions) {
    options.surface.setInputEnabled(true);
  }

  get view(): RoomView {
    return this.state.view;
  }

  get moving(): boolean {
    return this.state.moving;
  }

  /** Settled on the TV: the game may receive pointer input. */
  get atTv(): boolean {
    return this.state.view === 'tv' && !this.state.moving;
  }

  request(view: RoomView): void {
    const request = ++this.requests;
    const wait = view === this.state.view ? null : (this.options.whenReady?.(view) ?? null);
    if (!wait) {
      this.apply(reduceView(this.state, { type: 'request', view }));
      return;
    }
    wait.then(
      () => request === this.requests && this.apply(reduceView(this.state, { type: 'request', view })),
      () => undefined,
    );
  }

  /** Called as the camera sets off towards a new view. */
  onChange(listener: (view: RoomView) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Called as the camera comes to rest at the view. */
  onSettle(listener: (view: RoomView) => void): () => void {
    this.settleListeners.add(listener);
    return () => this.settleListeners.delete(listener);
  }

  dispose(): void {
    this.listeners.clear();
    this.settleListeners.clear();
  }

  private readonly arrived = (): void => {
    this.apply(reduceView(this.state, { type: 'arrived' }));
  };

  private apply(transition: { state: ViewState; effects: readonly ViewEffect[] }): void {
    const from = this.state.view;
    this.state = transition.state;
    for (const effect of transition.effects) this.run(effect, from);
  }

  private run(effect: ViewEffect, from: RoomView): void {
    const { surface } = this.options;
    switch (effect) {
      case 'pauseGame':
        if (!surface.paused) {
          surface.pause();
          this.pausedByRoom = true;
        }
        return;
      case 'resumeGame':
        // Only undo our own pause: a game the app paused (e.g. a menu) stays paused.
        if (this.pausedByRoom) surface.resume();
        this.pausedByRoom = false;
        return;
      case 'enableInput':
        surface.setInputEnabled(true);
        return;
      case 'disableInput':
        this.options.releasePointer();
        surface.setInputEnabled(false);
        return;
      case 'moveCamera':
        this.options.moveCamera(from, this.state.view, this.arrived);
        return;
      case 'notify':
        for (const listener of this.listeners) listener(this.state.view);
        return;
      case 'notifySettled':
        for (const listener of this.settleListeners) listener(this.state.view);
        return;
      case 'revealScreen':
        this.options.revealScreen();
        return;
      case 'concealScreen':
        this.options.concealScreen();
        return;
      case 'approachRadio':
        this.options.approachRadio();
        return;
      case 'revealRadio':
        this.options.revealRadio();
        return;
      case 'concealRadio':
        this.options.concealRadio();
        return;
    }
  }
}
