import type { SfxId } from '../../audio/ids';

/**
 * The stage-clear choreography as named beats in seconds of scene time:
 * the title slams in letter by letter, then makes room for the tally and the
 * career payoff. Everything on screen is a pure function of scene time
 * against these beats, which is also what makes "skip" trivial: jump the
 * clock to `settled`.
 */
export interface StageClearTimeline {
  /** When letter `i` of the slam title starts falling. */
  readonly letterStart: (index: number) => number;
  /** When letter `i` hits its resting place. */
  readonly letterLand: (index: number) => number;
  readonly slamEnd: number;
  /** The big title leaves and the panels slide in. */
  readonly collapse: number;
  readonly customers: Span;
  readonly mrr: Span;
  readonly time: number;
  readonly record: number;
  /** When highlight row `i` lights up. */
  readonly row: (index: number) => number;
  readonly stack: number;
  /** Everything is on screen and the options accept input. */
  readonly settled: number;
}

export interface Span {
  readonly start: number;
  readonly duration: number;
}

export const LETTER_FALL = 0.2;
const LETTER_INTERVAL = 0.055;
const SLAM_START = 0.2;
const ROW_INTERVAL = 0.22;

export function stageClearTimeline(letters: number, rows: number): StageClearTimeline {
  const letterStart = (index: number) => SLAM_START + index * LETTER_INTERVAL;
  const letterLand = (index: number) => letterStart(index) + LETTER_FALL;
  const slamEnd = letterLand(Math.max(0, letters - 1));
  const collapse = slamEnd + 0.75;
  const customers = { start: collapse + 0.45, duration: 0.5 };
  const mrr = { start: customers.start + customers.duration + 0.15, duration: 1.2 };
  const time = mrr.start + mrr.duration + 0.2;
  const record = time + 0.3;
  const firstRow = record + 0.35;
  const row = (index: number) => firstRow + index * ROW_INTERVAL;
  const stack = row(rows) + 0.1;
  return {
    letterStart,
    letterLand,
    slamEnd,
    collapse,
    customers,
    mrr,
    time,
    record,
    row,
    stack,
    settled: stack + 0.3,
  };
}

export interface Cue {
  readonly time: number;
  readonly sfx: SfxId;
}

const TICK_SECONDS = 0.05;

export interface CueInputs {
  readonly letters: number;
  /** Per highlight row: collected rows earn the achievement jingle, missed rows stay quiet. */
  readonly collected: readonly boolean[];
  readonly newRecord: boolean;
}

/** Every sound the sequence makes, in time order. */
export function stageClearCues(timeline: StageClearTimeline, inputs: CueInputs): Cue[] {
  const cues: Cue[] = [];
  for (let i = 0; i < inputs.letters; i++) cues.push({ time: timeline.letterLand(i), sfx: 'hit' });
  cues.push({ time: timeline.collapse, sfx: 'stage-clear' });
  for (const span of [timeline.customers, timeline.mrr]) {
    for (let t = span.start; t < span.start + span.duration; t += TICK_SECONDS) cues.push({ time: t, sfx: 'coin' });
  }
  cues.push({ time: timeline.time, sfx: 'menu-move' });
  if (inputs.newRecord) cues.push({ time: timeline.record, sfx: 'checkpoint' });
  inputs.collected.forEach((lit, index) => {
    if (lit) cues.push({ time: timeline.row(index), sfx: 'achievement' });
  });
  return cues.sort((a, b) => a.time - b.time);
}

/** Cues that fire when the clock moves from `from` (exclusive) to `to` (inclusive). */
export function cuesBetween(cues: readonly Cue[], from: number, to: number): Cue[] {
  return cues.filter((cue) => cue.time > from && cue.time <= to);
}
