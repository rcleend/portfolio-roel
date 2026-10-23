/**
 * Musical time. Songs are laid out in ticks, 24 to the beat, which divides
 * evenly into every subdivision a chiptune needs: 16ths (6 ticks), triplet
 * 8ths (8), 32nds (3) and triplet 16ths (4).
 */
export const TICKS_PER_BEAT = 24;

/** Swing works on pairs of 16th notes: the second of each pair is pushed late. */
const SWING_UNIT = TICKS_PER_BEAT / 4;

export interface Timing {
  readonly secondsPerTick: number;
  /** 0 is straight; 1/3 is a triplet (2:1) shuffle. */
  readonly swing: number;
}

export function timing(bpm: number, swing = 0): Timing {
  if (!(bpm > 0)) throw new RangeError(`Tempo must be positive, got ${bpm}`);
  if (!(swing >= 0 && swing < 0.5)) throw new RangeError(`Swing must be in [0, 0.5), got ${swing}`);
  return { secondsPerTick: 60 / bpm / TICKS_PER_BEAT, swing };
}

/**
 * Seconds from tick 0 to `tick`. Swing warps time inside each pair of 16ths
 * (the first 16th stretches by `swing`, the second shrinks by as much), so
 * every pair, beat and bar still starts exactly on the grid and the mapping
 * stays monotonic for notes that fall between 16ths.
 */
export function tickToSeconds(time: Timing, tick: number): number {
  if (time.swing === 0) return tick * time.secondsPerTick;
  const pair = Math.floor(tick / (2 * SWING_UNIT));
  const within = (tick - pair * 2 * SWING_UNIT) / SWING_UNIT; // 0..2 sixteenths into the pair
  const warped = within < 1 ? within * (1 + time.swing) : 1 + time.swing + (within - 1) * (1 - time.swing);
  return (pair * 2 + warped) * SWING_UNIT * time.secondsPerTick;
}
