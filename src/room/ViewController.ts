import type { GameSurface } from '@/engine/core/GameSurface';
import { INITIAL_VIEW_STATE, type RoomView, reduceView, type ViewEffect, type ViewState } from './viewState';

export interface ViewControllerOptions {
  readonly surface: GameSurface;
  /** Starts the camera towards `view`; must call `arrived()` once it is there. */
  readonly moveCamera: (view: RoomView, arrived: () => void) => void;
  /** Lets go of any pointer gesture on the game, e.g. before pausing it. */
  readonly releasePointer: () => void;
}

/**
 * Applies the view policy from viewState.ts to the real world: pauses and resumes the game,
 * gates its input, moves the camera and tells listeners.
 */
export class ViewController {
  private state: ViewState = INITIAL_VIEW_STATE;
  private pausedByRoom = false;
  private readonly listeners = new Set<(view: RoomView) => void>();

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
    this.apply(reduceView(this.state, { type: 'request', view }));
  }

  onChange(listener: (view: RoomView) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.listeners.clear();
  }

  private readonly arrived = (): void => {
    this.apply(reduceView(this.state, { type: 'arrived' }));
  };

  private apply(transition: { state: ViewState; effects: readonly ViewEffect[] }): void {
    this.state = transition.state;
    for (const effect of transition.effects) this.run(effect);
  }

  private run(effect: ViewEffect): void {
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
        this.options.moveCamera(this.state.view, this.arrived);
        return;
      case 'notify':
        for (const listener of this.listeners) listener(this.state.view);
        return;
    }
  }
}
