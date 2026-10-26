/**
 * The radio's controls slot: one DOM element over the room the app portals its CD and transport controls into.
 * It lives in the overlay container, outside the canvas's `role="application"`, so screen readers browse it, and
 * it never takes a pointer itself (the discs are clicked on the canvas; the app's own bar opts back in). Shown
 * when the camera lands at the radio and hidden synchronously in the request to leave, before the first flight
 * frame, like the computer's live screen.
 *
 * ```
 * div[data-radio-controls][data-live]   absolute, inset 0, pointer-events none; visibility follows `live`
 * ```
 */
export class ControlsLayer {
  readonly element: HTMLDivElement;
  #isLive = false;
  readonly #listeners = new Set<(live: boolean) => void>();

  constructor(container: HTMLElement) {
    this.element = document.createElement('div');
    this.element.dataset.radioControls = '';
    this.element.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    this.#apply();
    container.append(this.element);
  }

  get live(): boolean {
    return this.#isLive;
  }

  onLiveChange(listener: (live: boolean) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** The camera rests at the radio: the controls go live. */
  reveal(): void {
    this.#setLive(true);
  }

  /** The camera is asked to leave (or turn back on the way there): hidden now, in the same task. */
  conceal(): void {
    this.#setLive(false);
  }

  dispose(): void {
    this.#listeners.clear();
    this.element.remove();
  }

  #setLive(live: boolean): void {
    if (live === this.#isLive) return;
    this.#isLive = live;
    this.#apply();
    for (const listener of this.#listeners) listener(live);
  }

  #apply(): void {
    const { style, dataset } = this.element;
    style.visibility = this.#isLive ? 'visible' : 'hidden';
    dataset.live = String(this.#isLive);
  }
}
