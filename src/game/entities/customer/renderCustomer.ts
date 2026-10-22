import type { Gfx } from '@/engine/gfx/Gfx';
import { blink, bob } from '@/engine/motion/oscillators';
import { drawSpriteScaled } from '../../art/fx/drawScaled';
import type { CustomerAnimation } from '../../art/looks/contracts';
import type { RenderKit } from '../RenderKit';
import type { Customer } from './Customer';

/** The bits of the level's rules that change how a customer is drawn. */
export interface CustomerRules {
  /** UX Elixir: customers glow with a pink heart and pink pips. */
  readonly customersCalm: boolean;
}

const PIP = { w: 4, h: 3, gap: 1 } as const;
/** Frame 1 of `walk` has both feet planted: the "standing" pose. */
const STANDING_TIME = 1 / 6 + 1e-6;

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
  if (customer.escalated) {
    drawSteam(gfx, customer, kit.time);
    return;
  }
  const calm = rules.customersCalm;
  drawFrustration(gfx, customer, calm);
  if (calm) drawCalmHeart(gfx, customer.centerX, customer.feet - 46 - bob(kit.time, 1, 0.5));
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
function drawFrustration(gfx: Gfx, customer: Customer, calm: boolean): void {
  const count = customer.tuning.frustration;
  const width = count * PIP.w + (count - 1) * PIP.gap;
  const left = Math.round(customer.centerX - width / 2);
  const top = Math.round(customer.feet - 39);
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

function drawCalmHeart(gfx: Gfx, x: number, y: number): void {
  const left = Math.round(x) - 3;
  const top = Math.round(y);
  for (const [dx, dy, w] of [
    [1, 0, 2],
    [4, 0, 2],
    [0, 1, 7],
    [0, 2, 7],
    [1, 3, 5],
    [2, 4, 3],
    [3, 5, 1],
  ] as const) {
    gfx.fillRect(left + dx, top + dy, w, 1, '#ff4fa3');
  }
  gfx.pixel(left + 1, top + 1, '#ffd0ef');
}

/** Steam puffing from both sides of the escalated customer's head: more frustration than one sprite can hold. */
function drawSteam(gfx: Gfx, customer: Customer, time: number): void {
  const top = customer.feet - customer.rect.h - 4;
  for (let puff = 0; puff < 4; puff++) {
    const phase = (time * 1.4 + puff / 4) % 1;
    if (phase > 0.8 && blink(time, 2 / 60, 2 / 60)) continue;
    const side = puff % 2 === 0 ? -1 : 1;
    const x = customer.centerX + side * (10 + phase * 8);
    const y = top - phase * 16;
    gfx.circle(x, y, 1 + Math.round(phase * 2), phase < 0.5 ? '#ffffff' : '#d6d0dc');
  }
}
