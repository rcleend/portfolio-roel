import { ARROW_ART, BUSY_ART } from '../cursors';
import { ArtSvg } from '../desktop/ArtSvg';

/**
 * The startup's scripted pointer: the screen's arrow (or busy arrow) as DOM,
 * moved and faded by `CursorDirector`. It renders once and never re-renders;
 * all its motion is WAAPI on transform and opacity.
 */
export function ScriptedCursor({ ref }: { readonly ref: (element: HTMLDivElement | null) => void }) {
  return (
    <div ref={ref} className="pc-cursor" aria-hidden="true" hidden>
      <div className="pc-cursor__press">
        <ArtSvg className="pc-cursor__arrow" art={ARROW_ART} size={32} />
        <ArtSvg className="pc-cursor__busy" art={BUSY_ART} size={32} />
      </div>
    </div>
  );
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Drives the scripted cursor element. While it is on stage it marks its
 * parent, the screen's root, so the real pointer hides (never two arrows).
 */
export class CursorDirector {
  readonly #element: HTMLElement;
  #at: Point = { x: 0, y: 0 };

  constructor(element: HTMLElement) {
    this.#element = element;
  }

  show(at: Point, fadeMs: number): void {
    this.#at = at;
    this.#element.hidden = false;
    this.#element.style.transform = translate(at);
    this.#element.parentElement?.setAttribute('data-scripted-cursor', 'true');
    if (fadeMs > 0) this.#element.animate({ opacity: [0, 1] }, { duration: fadeMs, easing: 'ease-out' });
  }

  /** Glides to `to` along a slight upward arc (three keyframes). */
  glide(to: Point, durationMs: number): void {
    const from = this.#at;
    const lift = Math.hypot(to.x - from.x, to.y - from.y) * 0.08;
    const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - lift };
    this.#at = to;
    this.#element.style.transform = translate(to);
    this.#element.animate(
      { transform: [translate(from), translate(middle), translate(to)] },
      { duration: durationMs, easing: 'cubic-bezier(.3, 0, .2, 1)' },
    );
  }

  press(durationMs: number): void {
    if (durationMs <= 0) return;
    this.#element.firstElementChild?.animate(
      { transform: ['scale(1)', 'scale(0.92)', 'scale(1)'] },
      { duration: durationMs, easing: 'ease-out' },
    );
  }

  setBusy(busy: boolean): void {
    this.#element.dataset.busy = String(busy);
  }

  /** Leaves the stage, fading out over `fadeMs` (0: at once); the real pointer returns immediately. */
  hide(fadeMs: number): void {
    this.#element.parentElement?.removeAttribute('data-scripted-cursor');
    if (this.#element.hidden) return;
    if (fadeMs <= 0) {
      this.#element.hidden = true;
      return;
    }
    const fade = this.#element.animate({ opacity: [1, 0] }, { duration: fadeMs, easing: 'ease-in', fill: 'forwards' });
    fade.onfinish = () => {
      this.#element.hidden = true;
      fade.cancel();
    };
  }
}

function translate(point: Point): string {
  return `translate(${point.x}px, ${point.y}px)`;
}
