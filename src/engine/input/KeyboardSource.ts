import { EdgeTracker } from './EdgeTracker';

/**
 * Listens on the window (not the canvas) so the room host can keep focus on
 * its own element. Keys are only captured — and only `preventDefault`ed —
 * while enabled, so the rest of the page scrolls and tabs normally.
 */
export class KeyboardSource {
  readonly keys = new EdgeTracker<string>();
  #enabled = true;
  readonly #isGameKey: (code: string) => boolean;
  readonly #target: Window;

  constructor(isGameKey: (code: string) => boolean, target: Window = window) {
    this.#isGameKey = isGameKey;
    this.#target = target;
    target.addEventListener('keydown', this.#onKeyDown);
    target.addEventListener('keyup', this.#onKeyUp);
    target.addEventListener('blur', this.#onBlur);
  }

  get enabled(): boolean {
    return this.#enabled;
  }

  set enabled(enabled: boolean) {
    if (enabled === this.#enabled) return;
    this.#enabled = enabled;
    // Held keys are dropped silently: releasing them would fire game actions while the game is unfocused.
    if (!enabled) this.keys.reset();
  }

  dispose(): void {
    this.#target.removeEventListener('keydown', this.#onKeyDown);
    this.#target.removeEventListener('keyup', this.#onKeyUp);
    this.#target.removeEventListener('blur', this.#onBlur);
  }

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (!this.#accepts(event)) return;
    event.preventDefault();
    if (!event.repeat) this.keys.press(event.code);
  };

  readonly #onKeyUp = (event: KeyboardEvent): void => {
    if (!this.#enabled || !this.#isGameKey(event.code)) return;
    this.keys.release(event.code);
  };

  readonly #onBlur = (): void => {
    this.keys.releaseAll();
  };

  #accepts(event: KeyboardEvent): boolean {
    if (!this.#enabled || !this.#isGameKey(event.code)) return false;
    // Leave browser and OS shortcuts (Cmd+R, Ctrl+L, …) alone.
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    return !isEditable(event.target);
  }
}

function isEditable(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target as HTMLElement).isContentEditable
  );
}
