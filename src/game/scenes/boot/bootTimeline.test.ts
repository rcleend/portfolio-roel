import { describe, expect, it } from 'vitest';
import { frames } from '@/engine/motion/progress';
import { palette } from '../../palette';
import {
  BOOT_TIMES,
  backgroundGrey,
  charsTypedBetween,
  FRAMES_PER_CHAR,
  logoPose,
  MARK_COLORS,
  markColor,
  SKIP_FROM,
  skippableFrom,
  TYPED_LINES,
  typedCounts,
} from './bootTimeline';

/** Scene time after `n` fixed steps, accumulated exactly as a scene does it. */
function stepped(n: number): number {
  let time = 0;
  for (let i = 0; i < n; i++) time += 1 / 60;
  return time;
}

describe('background', () => {
  it('is white, steps down to mid grey at the flip and reaches black when the logo is readable', () => {
    expect(backgroundGrey(0)).toBe(255);
    expect(backgroundGrey(BOOT_TIMES.flipStart)).toBe(255);
    const mid = backgroundGrey(BOOT_TIMES.flipMid);
    expect(mid).toBeGreaterThan(100);
    expect(mid).toBeLessThan(180);
    expect(backgroundGrey(BOOT_TIMES.flipEnd)).toBe(0);
  });

  it('fades in a handful of flat steps rather than gliding', () => {
    const greys = new Set(Array.from({ length: 120 }, (_, i) => backgroundGrey(BOOT_TIMES.flipStart + i / 60)));
    expect(greys.size).toBeGreaterThanOrEqual(12);
    expect(greys.size).toBeLessThanOrEqual(16);
  });
});

describe('logo pose', () => {
  it('spins in mirrored, from a sliver to full width, and grows a little taller', () => {
    const first = logoPose(0);
    expect(first.mirrored).toBe(true);
    expect(first.scaleX).toBeLessThan(0.1);
    expect(first.scaleY).toBeLessThan(1);
    expect(logoPose(BOOT_TIMES.spinEnd)).toMatchObject({ scaleX: 1, scaleY: 1, mirrored: true, color: '#000000' });
  });

  it('holds still between the spin and the flip', () => {
    expect(logoPose(0.6)).toEqual(logoPose(0.75));
  });

  it('turns edge-on at the midpoint and comes back readable in white', () => {
    expect(logoPose(BOOT_TIMES.flipMid - 0.01).scaleY).toBeLessThan(0.05);
    const after = logoPose(BOOT_TIMES.flipEnd);
    expect(after).toMatchObject({ scaleX: 1, scaleY: 1, mirrored: false, color: '#ffffff' });
  });

  it('fades towards the background as it turns edge-on', () => {
    const quarter = (BOOT_TIMES.flipMid - BOOT_TIMES.flipStart) / 4;
    const early = logoPose(BOOT_TIMES.flipStart + quarter).color;
    const late = logoPose(BOOT_TIMES.flipMid - quarter).color;
    expect(Number.parseInt(late.slice(1, 3), 16)).toBeGreaterThan(Number.parseInt(early.slice(1, 3), 16));
  });
});

describe('typewriter', () => {
  it('reveals the first character at the start and one more every four frames', () => {
    const start = Math.round(BOOT_TIMES.typeStart * 60);
    expect(typedCounts(stepped(start - 1))).toEqual([0, 0]);
    expect(typedCounts(stepped(start))).toEqual([1, 0]);
    expect(typedCounts(stepped(start + FRAMES_PER_CHAR - 1))).toEqual([1, 0]);
    expect(typedCounts(stepped(start + FRAMES_PER_CHAR))).toEqual([2, 0]);
  });

  it('pauses one character at the line break and finishes before the mark appears', () => {
    const start = Math.round(BOOT_TIMES.typeStart * 60);
    const firstLine = TYPED_LINES[0].length;
    expect(typedCounts(stepped(start + FRAMES_PER_CHAR * firstLine))).toEqual([firstLine, 0]);
    expect(typedCounts(stepped(start + FRAMES_PER_CHAR * (firstLine + 1)))).toEqual([firstLine, 1]);
    expect(typedCounts(BOOT_TIMES.markStart)).toEqual(TYPED_LINES.map((line) => line.length));
  });

  it('reports each character exactly once across consecutive steps', () => {
    const typed: string[] = [];
    for (let i = 1; i < 400; i++) typed.push(...charsTypedBetween(stepped(i - 1), stepped(i)));
    expect(typed.join('')).toBe(TYPED_LINES.join(''));
  });
});

describe('RCL mark', () => {
  it('is hidden until its cue, steps through five colours and settles on royal blue', () => {
    expect(markColor(BOOT_TIMES.markStart - frames(1))).toBeNull();
    const seen = new Set(Array.from({ length: 40 }, (_, i) => markColor(BOOT_TIMES.markStart + i / 60)));
    expect([...seen]).toEqual([...MARK_COLORS]);
    expect(markColor(BOOT_TIMES.end)).toBe(palette.royal);
  });

  it('makes the logo glint only while the mark flares', () => {
    const colors = new Set(Array.from({ length: 40 }, (_, i) => logoPose(BOOT_TIMES.markStart + i / 60).color));
    expect(colors.size).toBe(2);
    expect(logoPose(BOOT_TIMES.markEnd).color).toBe('#ffffff');
  });
});

describe('skipping', () => {
  it('lets first-time visitors skip only once the logo has played', () => {
    expect(skippableFrom(false)).toBe(SKIP_FROM.firstVisit);
    expect(skippableFrom(true)).toBe(SKIP_FROM.returning);
    expect(SKIP_FROM.firstVisit).toBe(BOOT_TIMES.markEnd);
  });
});
