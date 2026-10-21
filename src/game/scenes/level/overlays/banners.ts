import type { Gfx } from '@/engine/gfx/Gfx';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import { easeInCubic, easeOutBack, easeOutExpo } from '@/engine/motion/easing';
import { blink } from '@/engine/motion/oscillators';
import { segment } from '@/engine/motion/progress';
import type { TextStyles } from '../../../fonts';
import type { LevelTextStyles } from '../../../ui/hud/styles';

/**
 * The escalated customer's entrance: red alarm bars sweep in from both
 * sides with "ESCALATED!" and the plan underneath, blinking like an arcade
 * WARNING.
 */
export function drawEscalationBanner(
  gfx: Gfx,
  styles: LevelTextStyles,
  text: TextStyles,
  plan: string,
  age: number,
): void {
  const DURATION = 2.2;
  if (age < 0 || age > DURATION) return;
  const open = segment(age, 0, 0.25, easeOutExpo) * (1 - segment(age, DURATION - 0.25, DURATION, easeInCubic));
  const y = 78;
  const barWidth = Math.round(gfx.width * open);
  for (const [top, side] of [
    [y - 8, -1],
    [y + 30, 1],
  ] as const) {
    const left = side < 0 ? 0 : gfx.width - barWidth;
    gfx.fillRect(left, top, barWidth, 6, '#9e1c1c');
    // Hazard chevrons crawl along the bars.
    const crawl = Math.floor(age * 40) % 8;
    for (let x = left - 8 + crawl * side; x < left + barWidth; x += 8) gfx.fillRect(x, top + 1, 4, 4, '#ffd84a');
  }
  if (open < 1 || !blink(age, 10 / 60, 4 / 60)) return;
  gfx.text('ESCALATED!', gfx.width / 2, y, styles.bannerAlarm, { align: 'center' });
  gfx.text(
    `UNHAPPY CUSTOMER - ${plan}`,
    gfx.width / 2,
    y + 40,
    { ...text.label, fill: '#ffb0a0' },
    { align: 'center' },
  );
}

/** A two-line announcer callout that slams in and holds, e.g. "CUSTOMER RETAINED!". */
export function drawSlamBanner(gfx: Gfx, lines: readonly string[], style: TextStyle, age: number, y = 82): void {
  if (age < 0) return;
  lines.forEach((line, index) => {
    const start = index * 0.18;
    const arrive = segment(age, start, start + 0.22, easeOutBack);
    if (age < start) return;
    const from = index % 2 === 0 ? -1 : 1;
    const x = Math.round(gfx.width / 2 + from * (1 - arrive) * 300);
    gfx.text(line, x, y + index * 26, style, { align: 'center' });
  });
}
