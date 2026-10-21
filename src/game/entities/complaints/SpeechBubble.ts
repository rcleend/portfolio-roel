import type { Gfx } from '@/engine/gfx/Gfx';
import type { Rect } from '@/engine/math/Rect';
import { blink } from '@/engine/motion/oscillators';
import { drawSpeechBubble } from '../../art/fx/speechBubble';
import type { RenderKit } from '../RenderKit';

/** A complaint's text, already wrapped to bubble width. */
export interface BubbleText {
  readonly lines: readonly string[];
  readonly width: number;
  readonly height: number;
  readonly lineHeight: number;
}

const PADDING_X = 4;
const PADDING_TOP = 3;
const PADDING_BOTTOM = 2;
/** The hitbox is smaller than the drawing: grazing a bubble's corner should not cost a heart. */
const HITBOX_INSET = 3;
const LIFE = 4.2;
const GROW_SECONDS = 0.1;

/**
 * A complaint shouted by an unhappy customer: a speech bubble that drifts
 * towards the player, hurts on contact and pops when attacked.
 */
export class SpeechBubble {
  readonly text: BubbleText;
  readonly width: number;
  readonly height: number;
  /** Which way it drifts; the tail points back at the speaker. */
  readonly direction: -1 | 1;
  readonly #speed: number;
  /** Body top-left. */
  x: number;
  y: number;
  #age = 0;
  #popped = false;

  /** `centerY` is the body's vertical centre; the bubble starts just in front of `fromX`. */
  constructor(text: BubbleText, fromX: number, centerY: number, direction: -1 | 1, speed: number) {
    this.text = text;
    this.width = text.width + PADDING_X * 2;
    this.height = text.height + PADDING_TOP + PADDING_BOTTOM;
    this.direction = direction;
    this.#speed = speed;
    this.x = direction > 0 ? fromX : fromX - this.width;
    this.y = centerY - this.height / 2;
  }

  get alive(): boolean {
    return !this.#popped && this.#age < LIFE;
  }

  get popped(): boolean {
    return this.#popped;
  }

  get center(): { readonly x: number; readonly y: number } {
    return { x: this.x + this.width / 2, y: this.y + this.height / 2 };
  }

  get rect(): Rect {
    return {
      x: this.x + HITBOX_INSET,
      y: this.y + HITBOX_INSET,
      w: this.width - HITBOX_INSET * 2,
      h: this.height - HITBOX_INSET * 2,
    };
  }

  update(dt: number): void {
    this.#age += dt;
    this.x += this.direction * this.#speed * dt;
  }

  pop(): void {
    this.#popped = true;
  }

  render(gfx: Gfx, kit: RenderKit): void {
    if (!this.alive) return;
    // Blink out over the last half second instead of vanishing mid-flight.
    if (LIFE - this.#age < 0.5 && !blink(this.#age, 1 / 15, 1 / 15)) return;
    const bob = Math.round(Math.sin(this.#age * 7) * 1);
    const grow = Math.min(1, this.#age / GROW_SECONDS);
    const w = Math.max(8, Math.round(this.width * grow));
    const h = Math.max(8, Math.round(this.height * grow));
    const left = this.x + (this.width - w) / 2;
    const top = this.y + (this.height - h) / 2 + bob;
    drawSpeechBubble(gfx, left, top, w, h, this.direction > 0 ? 'left' : 'right');
    if (grow < 1) return;
    this.text.lines.forEach((line, index) => {
      gfx.text(
        line,
        Math.round(this.x + this.width / 2),
        Math.round(top + PADDING_TOP + index * this.text.lineHeight),
        kit.levelText.bubble,
        {
          align: 'center',
        },
      );
    });
  }
}
