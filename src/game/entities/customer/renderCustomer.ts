import type { Gfx } from '@/engine/gfx/Gfx';
import { blink } from '@/engine/motion/oscillators';
import { drawSpriteScaled } from '../../art/fx/drawScaled';
import type { CustomerAnimation } from '../../art/looks/contracts';
import type { UxElixirState } from '../../skills/SkillVisual';
import type { RenderKit } from '../RenderKit';
import type { Customer } from './Customer';

/** The bits of the level's rules that change how a customer is drawn. */
export interface CustomerRules {
  /** UX ELIXIR: frustration pips turn pink, and the elixir's look marks every customer (classic: a pink heart). */
  readonly customersCalm: boolean;
  /** The running elixir, for its look; null on the one frame its rule outlasts it. */
  readonly elixir: UxElixirState | null;
}

const PIP = { w: 4, h: 3, gap: 1 } as const;
/** Frame 1 of `walk` has both feet planted: the "standing" pose. */
const STANDING_TIME = 1 / 6 + 1e-6;
/** How high above his feet classic's standing customer's head reaches: what everything above a customer was placed for. */
const TUNED_HEAD = 30;
/** How far below the top of its 40 px frame classic's head sits; a look without a `head` anchor is taken to stand the same way. */
const TUNED_HEADROOM = 10;

/**
 * How far everything shown above a customer — pips, hearts, steam, the +MRR
 * pop — must rise so a look's taller sprite does not wear it on its face:
 * measured from the standing frame's `head` anchor where the look marks one,
 * else from its frame's top. Zero for classic, negative for a look whose head
 * stands lower; the hitbox, and so play, never changes.
 */
export function overheadLift(kit: RenderKit, scale: number): number {
  const sheet = kit.looks.customer.sheet;
  const head = sheet.anchor('walk', 'head', STANDING_TIME);
  const height = head ? sheet.origin.y - head.y : sheet.height - TUNED_HEADROOM;
  return (height - TUNED_HEAD) * scale;
}

/** Draws a customer: the right animation for their mood, hit flash, and the frustration meter above their head. */
export function renderCustomer(gfx: Gfx, kit: RenderKit, customer: Customer, rules: CustomerRules): void {
  const { animation, time } = pose(customer, kit.time);
  // Hits flicker white on alternate frames and a charge is telegraphed in red, both brief enough to keep the sprite readable.
  const hitFlash = customer.isFlashing(kit.time) && blink(kit.time, 1 / 60, 1 / 60);
  const windingUp = customer.mood.kind === 'chargeWindup' && blink(kit.time, 2 / 60, 6 / 60);
  const flash = hitFlash ? '#ffffff' : windingUp ? '#ff5a3a' : undefined;
  drawSpriteScaled(
    gfx,
    kit.looks.customer.sheet,
    animation,
    time,
    customer.centerX,
    customer.feet,
    customer.tuning.scale,
    { flipX: customer.facing < 0, flash },
  );
  if (customer.won) return;
  const lift = overheadLift(kit, customer.tuning.scale);
  if (customer.escalated) {
    drawSteam(gfx, customer, lift, kit.time);
    return;
  }
  const calm = rules.customersCalm;
  drawFrustration(gfx, customer, lift, calm);
  if (calm) {
    const calmed = {
      x: customer.centerX,
      feet: customer.feet,
      scale: customer.tuning.scale,
      lift,
      elixir: rules.elixir,
    };
    kit.looks.skills['ux-elixir'].visual.customer?.(gfx, calmed, kit);
  }
}

function pose(customer: Customer, now: number): { animation: CustomerAnimation; time: number } {
  const age = customer.moodAge(now);
  switch (customer.mood.kind) {
    case 'won':
      return { animation: 'happy', time: age };
    case 'stunned':
      return { animation: 'stunned', time: age };
    case 'hurt':
      return { animation: 'hurt', time: age };
    case 'entering':
    case 'windup':
    case 'recover':
    case 'chargeWindup':
      return { animation: 'shout', time: age };
    case 'charge':
      return { animation: 'walk', time: age * 2.5 };
    default:
      return Math.abs(customer.body.vx) > 1
        ? { animation: 'walk', time: now }
        : { animation: 'walk', time: STANDING_TIME };
  }
}

/** One pip per point of frustration, emptying as they are won over. */
function drawFrustration(gfx: Gfx, customer: Customer, lift: number, calm: boolean): void {
  const count = customer.tuning.frustration;
  const width = count * PIP.w + (count - 1) * PIP.gap;
  const left = Math.round(customer.centerX - width / 2);
  const top = Math.round(customer.feet - 39 - lift);
  gfx.fillRect(left - 1, top - 1, width + 2, PIP.h + 2, '#1a0a14');
  for (let i = 0; i < count; i++) {
    const x = left + i * (PIP.w + PIP.gap);
    const fill = Math.min(1, Math.max(0, customer.frustration - i));
    gfx.fillRect(x, top, PIP.w, PIP.h, '#3a2240');
    if (fill <= 0) continue;
    const w = fill >= 1 ? PIP.w : Math.ceil(PIP.w * fill);
    gfx.fillRect(x, top, w, PIP.h, calm ? '#ff9ad8' : '#ff3a4a');
    gfx.fillRect(x, top, w, 1, calm ? '#ffd0ef' : '#ff9a9a');
  }
}

/** Steam puffing from both sides of the escalated customer's head: more frustration than one sprite can hold. */
function drawSteam(gfx: Gfx, customer: Customer, lift: number, time: number): void {
  const top = customer.feet - customer.rect.h - 4 - lift;
  for (let puff = 0; puff < 4; puff++) {
    const phase = (time * 1.4 + puff / 4) % 1;
    if (phase > 0.8 && blink(time, 2 / 60, 2 / 60)) continue;
    const side = puff % 2 === 0 ? -1 : 1;
    const x = customer.centerX + side * (10 + phase * 8);
    const y = top - phase * 16;
    gfx.circle(x, y, 1 + Math.round(phase * 2), phase < 0.5 ? '#ffffff' : '#d6d0dc');
  }
}
