import { intersects, type Rect } from '@/engine/math/Rect';
import type { Rng } from '@/engine/math/Rng';
import { type BubbleText, SpeechBubble } from '../entities/complaints/SpeechBubble';
import type { Customer } from '../entities/customer/Customer';
import { BURSTS, Burst } from '../entities/effects/Burst';
import { FloatingText } from '../entities/effects/FloatingText';
import type { Feedback } from './Feedback';

const SPEED = { regular: 52, escalated: 66 } as const;
/** Bubble centre heights above the feet: regular customers aim at the torso. */
const REGULAR_HEIGHT = 19;
/** The escalated volley alternates a low bubble (jump it) and a high one (walk under it). */
const ESCALATED_HEIGHTS = [16, 66] as const;
const VOLLEY_SPACING = 28;

/** Every complaint bubble in flight: shouting them, moving them, popping them. */
export class Complaints {
  readonly #lines: readonly string[];
  readonly #layout: (text: string) => BubbleText;
  readonly #feedback: Feedback;
  readonly #rng: Rng;
  #bubbles: SpeechBubble[] = [];
  #next = 0;

  /** `lines` are the level's complaints, shouted in rotation so every one gets heard. */
  constructor(lines: readonly string[], layout: (text: string) => BubbleText, feedback: Feedback, rng: Rng) {
    this.#lines = lines;
    this.#layout = layout;
    this.#feedback = feedback;
    this.#rng = rng;
  }

  get bubbles(): readonly SpeechBubble[] {
    return this.#bubbles;
  }

  /** Releases bubble `index` of a customer's volley from their mouth. */
  shout(customer: Customer, index: number): void {
    const text = this.#lines[this.#next++ % Math.max(1, this.#lines.length)] ?? '!';
    const height = customer.escalated ? (ESCALATED_HEIGHTS[index % 2] ?? REGULAR_HEIGHT) : REGULAR_HEIGHT;
    const fromX = customer.mouth.x - customer.facing * index * VOLLEY_SPACING * customer.tuning.scale;
    const speed = customer.escalated ? SPEED.escalated : SPEED.regular;
    this.#bubbles.push(new SpeechBubble(this.#layout(text), fromX, customer.feet - height, customer.facing, speed));
    if (index === 0) this.#feedback.sfx('complaint');
  }

  update(dt: number): void {
    for (const bubble of this.#bubbles) bubble.update(dt);
    this.#bubbles = this.#bubbles.filter((bubble) => bubble.alive);
  }

  /** Live bubbles overlapping `rect`. */
  touching(rect: Rect): SpeechBubble[] {
    return this.#bubbles.filter((bubble) => bubble.alive && intersects(bubble.rect, rect));
  }

  pop(bubble: SpeechBubble): void {
    if (!bubble.alive) return;
    bubble.pop();
    const { x, y } = bubble.center;
    this.#feedback.effect(new Burst(x, y, BURSTS.bubblePop, this.#rng));
    this.#feedback.effect(new FloatingText('POP!', x, y - 6, 'pop', { rise: 8, life: 0.5 }));
    this.#feedback.sfx('hit');
  }

  /** Pops every bubble overlapping `area`; returns how many. */
  popWithin(area: Rect): number {
    const popped = this.touching(area);
    for (const bubble of popped) this.pop(bubble);
    return popped.length;
  }

  popAll(): void {
    for (const bubble of this.#bubbles) this.pop(bubble);
  }

  /** Removes every bubble silently, e.g. on respawn. */
  clear(): void {
    this.#bubbles = [];
  }
}
