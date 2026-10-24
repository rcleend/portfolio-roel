import { type FlagStorage, readJson, writeJson } from '../../storage/localFlag';

/**
 * The radio's own teaching line (SPEC §8.9): how to choose a CD until the visitor has,
 * then, for mouse users, how to leave until they have. Each retires for good. The
 * global view hint shows nothing at the radio.
 */
export interface RadioHintProgress {
  /** Has chosen a CD at least once. */
  readonly pickedCd: boolean;
  /** Has left the radio at least once. */
  readonly leftRadio: boolean;
}

export const RADIO_HINT_STORAGE_KEY = 'reo-leo:radio-hints';

export type RadioHintKind = 'pick' | 'leave';

/** Unknown or missing fields count as not done. */
export function loadRadioHints(storage: FlagStorage | null): RadioHintProgress {
  const raw = readJson(storage, RADIO_HINT_STORAGE_KEY);
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return { pickedCd: record.pickedCd === true, leftRadio: record.leftRadio === true };
}

export function saveRadioHints(storage: FlagStorage | null, progress: RadioHintProgress): void {
  writeJson(storage, RADIO_HINT_STORAGE_KEY, progress);
}

/** Records what the visitor just did; returns the same object when nothing new was learnt. */
export function learn(progress: RadioHintProgress, done: keyof RadioHintProgress): RadioHintProgress {
  return progress[done] ? progress : { ...progress, [done]: true };
}

/** The line to show at the radio, or null. Touch screens have the bar's back button instead of a leave hint. */
export function radioHintFor(progress: RadioHintProgress, coarse: boolean): RadioHintKind | null {
  if (!progress.pickedCd) return 'pick';
  return coarse || progress.leftRadio ? null : 'leave';
}

export function radioHintText(kind: RadioHintKind, coarse: boolean): string {
  return kind === 'pick' ? `${coarse ? 'Tap' : 'Click'} a CD to play it` : 'Click outside the radio to look around';
}

/** The first line waits for the camera to settle and the discs to rise. */
export const RADIO_HINT_DELAY_MS = 1200;
