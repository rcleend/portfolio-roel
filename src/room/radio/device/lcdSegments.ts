import type { LcdReadout } from '../RadioDeck';

/**
 * The radio's segment display as data: a readout becomes an icon, six seven-segment cells (two for the track,
 * four for minutes and seconds) and the colon, as a positive STN display shows them. Words are spelt in segments
 * the way the device's own display does: "no dISC", "-- --:--", "00 -- --".
 */

/** Seven-segment bits: a (top), b (top right), c (bottom right), d (bottom), e (bottom left), f (top left), g (middle). */
export const SEGMENT = { a: 1, b: 2, c: 4, d: 8, e: 16, f: 32, g: 64 } as const;
const { a, b, c, d, e, f, g } = SEGMENT;

export const GLYPHS: Readonly<Record<string, number>> = {
  '0': a | b | c | d | e | f,
  '1': b | c,
  '2': a | b | d | e | g,
  '3': a | b | c | d | g,
  '4': b | c | f | g,
  '5': a | c | d | f | g,
  '6': a | c | d | e | f | g,
  '7': a | b | c,
  '8': a | b | c | d | e | f | g,
  '9': a | b | c | d | f | g,
  '-': g,
  ' ': 0,
  n: c | e | g,
  o: c | d | e | g,
  d: b | c | d | e | g,
  I: e | f,
  S: a | c | d | f | g,
  C: a | d | e | f,
};

export interface LcdFrame {
  readonly icon: 'play' | 'pause' | null;
  /** Lit segments of the six cells: track ×2, then minutes ×2 and seconds ×2. */
  readonly cells: readonly number[];
  readonly colon: boolean;
}

/** The display is dark (the readout is off). */
export const BLANK: LcdFrame = { icon: null, cells: [0, 0, 0, 0, 0, 0], colon: false };

const two = (value: number): string => String(Math.max(0, Math.min(99, Math.floor(value)))).padStart(2, '0');

/** "mm" and "ss" for a time in seconds, minutes capped at 99 (99:59 beyond). */
export function clock(seconds: number): [string, string] {
  const whole = Math.max(0, Math.floor(seconds));
  if (whole >= 100 * 60) return ['99', '59'];
  return [two(whole / 60), two(whole % 60)];
}

function cellsOf(text: string): number[] {
  return [...text].map((character) => GLYPHS[character] ?? 0);
}

/**
 * The segments a readout lights. `blinkOn` false hides a paused time (it blinks 500 ms on, 500 off while the
 * visitor is there).
 */
export function lcdFrame(readout: LcdReadout, blinkOn = true): LcdFrame {
  switch (readout.kind) {
    case 'off':
      return BLANK;
    case 'no-disc':
      return { icon: null, cells: cellsOf('nodISC'), colon: false };
    case 'reading':
      return { icon: null, cells: cellsOf('------'), colon: true };
    case 'error':
      return { icon: null, cells: cellsOf('00----'), colon: false };
    case 'total': {
      const [m, s] = clock(readout.seconds);
      return { icon: null, cells: cellsOf(`${two(readout.tracks)}${m}${s}`), colon: true };
    }
    case 'track': {
      const [m, s] = clock(readout.seconds);
      const hidden = readout.transport === 'paused' && !blinkOn;
      return {
        icon: readout.transport === 'playing' ? 'play' : 'pause',
        cells: cellsOf(`${two(readout.track)}${hidden ? '    ' : `${m}${s}`}`),
        colon: !hidden,
      };
    }
  }
}

/** True when two frames light exactly the same segments (nothing to repaint). */
export function sameFrame(x: LcdFrame, y: LcdFrame): boolean {
  return x.icon === y.icon && x.colon === y.colon && x.cells.every((cell, i) => cell === y.cells[i]);
}

/** The readout blinks (a paused time). */
export function blinks(readout: LcdReadout): boolean {
  return readout.kind === 'track' && readout.transport === 'paused';
}
