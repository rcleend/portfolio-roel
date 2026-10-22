import type { Gfx } from '@/engine/gfx/Gfx';
import { easeOutBack } from '@/engine/motion/easing';
import { bob } from '@/engine/motion/oscillators';
import { segment } from '@/engine/motion/progress';
import { defineSkillLook } from '@/game/art/looks/module';
import { drawBurst } from '@/game/entities/effects/Burst';
import { skillIconSheets } from '../icons';

const FLASK_SECONDS = 0.7;
/** The flask's bottom sits this far below the top of the hero's frame (34 px above classic's feet). */
const FLASK_DROP = 6;

/** Classic UX ELIXIR: a pink flask pops up over the hero's head and is drained; customers glow with a pink heart and sparkles. */
export const look = defineSkillLook('ux-elixir', {
  icon: skillIconSheets['ux-elixir'],
  visual: () => ({
    active: (gfx, elixir, caster, layer) => {
      if (layer !== 'front' || elixir.age > FLASK_SECONDS) return;
      // The potion pops up above the hero's head, tips, and is gone.
      const rise = segment(elixir.age, 0, 0.25, easeOutBack);
      const x = Math.round(caster.x - 3);
      const y = Math.round(caster.feet - (caster.height - FLASK_DROP) - rise * 10);
      drawFlask(gfx, x, y, elixir.age > 0.45);
    },
    effect: (gfx, fx) => {
      if (fx.role === 'sparkle') drawBurst(gfx, fx.burst);
    },
    customer: (gfx, customer, kit) =>
      drawCalmHeart(gfx, customer.x, customer.feet - 46 - customer.lift - bob(kit.time, 1, 0.5)),
  }),
});

function drawFlask(gfx: Gfx, x: number, y: number, empty: boolean): void {
  gfx.fillRect(x + 2, y, 3, 1, '#2a1830');
  gfx.fillRect(x + 2, y + 1, 3, 2, '#b48e74');
  gfx.fillRect(x, y + 3, 7, 7, '#2a1830');
  gfx.fillRect(x + 1, y + 4, 5, 5, empty ? '#d6d0dc' : '#ff4fa3');
  if (!empty) gfx.fillRect(x + 1, y + 4, 5, 1, '#ff9ad8');
  gfx.pixel(x + 2, y + 5, '#ffffff');
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
