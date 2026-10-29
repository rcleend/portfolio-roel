import { type FlagStorage, readJson, writeJson } from '../../storage/localFlag';

/**
 * The radio's own teaching line (SPEC §8.9): how to choose a CD until the visitor has,
 * then, for mouse users, how to leave until they have. Each retires for good. The
 * room's guide shows nothing at the radio (app/guide/guideProgress.ts).
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

/** How the visitor is reaching the radio: the words follow it. */
export type HintInput = 'mouse' | 'touch' | 'keyboard';

/** A hint in the room UI's two voices: a Chewy heading and a Nunito line (docs/ART-DIRECTION.md › The room's UI). */
export interface HintWords {
  readonly title: string;
  readonly body: string;
}

export function radioHintText(kind: RadioHintKind, input: HintInput): HintWords {
  if (kind === 'pick') {
    const how = input === 'keyboard' ? 'Press Enter' : input === 'touch' ? 'Tap one' : 'Click one';
    return { title: 'Pick a CD', body: `${how} to play` };
  }
  return {
    title: 'Look around',
    body: input === 'keyboard' ? 'Press Escape to get up' : 'Click anywhere outside the radio',
  };
}

/** The first line waits for the discs to be up in their slots (it names them), and a beat more. */
export const RADIO_HINT_DELAY_MS = 450;
