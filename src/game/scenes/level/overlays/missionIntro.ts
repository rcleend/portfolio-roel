import type { LevelInfo } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import { easeInCubic, easeOutBack, easeOutExpo } from '@/engine/motion/easing';
import { segment } from '@/engine/motion/progress';
import type { TextStyles } from '../../../fonts';
import type { LevelTextStyles } from '../../../ui/hud/styles';

/** The intro's choreography, in seconds of scene time. */
export const INTRO = {
  lettersIn: 0.15,
  letterStagger: 0.05,
  startSlam: 0.85,
  leave: 2.6,
  done: 3.0,
} as const;

const MISSION_Y = 70;
const START_Y = 100;

/**
 * "MISSION 1" drops in letter by letter, "START!" slams in from the right
 * with the city underneath, then everything flies off — the Metal Slug
 * opening, while the player can already move.
 */
export function drawMissionIntro(
  gfx: Gfx,
  styles: LevelTextStyles,
  text: TextStyles,
  level: LevelInfo,
  years: string,
  time: number,
): void {
  if (time >= INTRO.done) return;
  const leave = segment(time, INTRO.leave, INTRO.done, easeInCubic);
  const lift = Math.round(leave * 140);

  const mission = level.mission;
  const total = gfx.measureText(mission, styles.banner).width;
  let x = Math.round((gfx.width - total) / 2);
  [...mission].forEach((char, index) => {
    const start = INTRO.lettersIn + index * INTRO.letterStagger;
    const drop = segment(time, start, start + 0.25, easeOutBack);
    if (time >= start) gfx.text(char, x, Math.round(MISSION_Y - 90 * (1 - drop)) - lift, styles.banner);
    x += styles.banner.font.glyph(char).advance;
  });

  if (time < INTRO.startSlam) return;
  const slam = segment(time, INTRO.startSlam, INTRO.startSlam + 0.2, easeOutExpo);
  const shake = time - INTRO.startSlam < 0.1 ? (Math.floor(time * 60) % 2 === 0 ? 2 : -2) : 0;
  const startX = Math.round(gfx.width / 2 + (1 - slam) * 260 + shake);
  gfx.text('START!', startX, START_Y + lift * 2, styles.bannerCool, { align: 'center' });

  const caption = `${level.city} · ${years}`;
  const captionY = START_Y + 30 + lift * 2;
  const width = gfx.measureText(caption, text.label).width;
  gfx.fillRect(Math.round((gfx.width - width) / 2) - 6, captionY - 3, width + 12, 14, '#0b0a1f');
  gfx.text(caption, gfx.width / 2, captionY, { ...text.label, fill: '#efe3b5' }, { align: 'center' });
}

/** "2022–2024" or "2024–NOW" from ISO year-months. */
export function missionYears(start: string, end: string | null): string {
  const year = (iso: string): string => iso.slice(0, 4);
  return `${year(start)}-${end ? year(end) : 'NOW'}`;
}
