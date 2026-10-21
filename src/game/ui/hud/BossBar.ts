import type { Gfx } from '@/engine/gfx/Gfx';
import { easeOutBack } from '@/engine/motion/easing';
import { segment } from '@/engine/motion/progress';
import type { TextStyles } from '../../fonts';

export interface BossBarState {
  readonly label: string;
  /** 0–1 frustration left. */
  readonly fraction: number;
  /** A trailing "damage" fraction that drains after the real one, so each hit reads. */
  readonly trail: number;
  /** Seconds since the bar appeared. */
  readonly age: number;
}

const WIDTH = 216;
const HEIGHT = 7;
const BOTTOM = 236;

/** The escalated customer's frustration, as a segmented arcade boss bar along the bottom of the screen. */
export function drawBossBar(gfx: Gfx, text: TextStyles, state: BossBarState): void {
  const rise = segment(state.age, 0, 0.35, easeOutBack);
  const y = Math.round(BOTTOM + 24 - rise * 24) - HEIGHT;
  const x = Math.round((gfx.width - WIDTH) / 2);
  // A dark strip behind the bar, like the control hints, keeps it legible over the busy street.
  gfx.fillRect(0, y - 14, gfx.width, gfx.height - y + 14, '#0b0a1f');
  gfx.fillRect(0, y - 15, gfx.width, 1, '#5a1c24');
  gfx.text(state.label, gfx.width / 2, y - 11, { ...text.hud, fill: '#ffb0a0' }, { align: 'center' });
  gfx.fillRect(x - 2, y - 2, WIDTH + 4, HEIGHT + 4, '#0b0a1f');
  gfx.fillRect(x - 1, y - 1, WIDTH + 2, HEIGHT + 2, '#8a90a8');
  gfx.fillRect(x, y, WIDTH, HEIGHT, '#2a1020');
  const trail = Math.round(WIDTH * Math.max(state.trail, state.fraction));
  const fill = Math.round(WIDTH * state.fraction);
  gfx.fillRect(x, y, trail, HEIGHT, '#ffffff');
  gfx.fillRect(x, y, fill, HEIGHT, { stops: ['#ff9a6a', '#e2352d', '#9e1c1c'], bands: 3 });
  gfx.fillRect(x, y, fill, 1, '#ffd0b0');
  // Segment ticks every 12 px make the bar read as countable chunks of anger.
  for (let tick = x + 12; tick < x + WIDTH; tick += 12) gfx.fillRect(tick, y, 1, HEIGHT, '#0b0a1f');
}
