import type { RoomView } from '@/room';
import { type FlagStorage, readJson, writeJson } from '../../storage/localFlag';

/**
 * Which view-change gestures the visitor has already discovered. Each hint
 * retires for good once its gesture has been done, on this visit and later ones.
 */
export interface ViewHintProgress {
  /** Has left the TV for the room at least once. */
  readonly lookedAround: boolean;
  /** Has come back from the room to the TV at least once. */
  readonly returned: boolean;
  /** Has sat down at the computer at least once. */
  readonly visitedComputer: boolean;
  /** Has got up from the computer again at least once. */
  readonly leftComputer: boolean;
}

export const VIEW_HINT_STORAGE_KEY = 'reo-leo:view-hints';

/** Unknown or missing fields (e.g. a record saved before the computer existed) count as not done. */
export function loadViewHintProgress(storage: FlagStorage | null): ViewHintProgress {
  const raw = readJson(storage, VIEW_HINT_STORAGE_KEY);
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    lookedAround: record.lookedAround === true,
    returned: record.returned === true,
    visitedComputer: record.visitedComputer === true,
    leftComputer: record.leftComputer === true,
  };
}

export function saveViewHintProgress(storage: FlagStorage | null, progress: ViewHintProgress): void {
  writeJson(storage, VIEW_HINT_STORAGE_KEY, progress);
}

/** Records a view change; returns the same object when nothing new was learnt. */
export function recordView(progress: ViewHintProgress, view: RoomView): ViewHintProgress {
  const learnt: Partial<{ -readonly [K in keyof ViewHintProgress]: boolean }> = {};
  if (view !== 'tv' && !progress.lookedAround) learnt.lookedAround = true;
  if (view === 'tv' && progress.lookedAround && !progress.returned) learnt.returned = true;
  if (view === 'pc' && !progress.visitedComputer) learnt.visitedComputer = true;
  if (view !== 'pc' && progress.visitedComputer && !progress.leftComputer) learnt.leftComputer = true;
  return Object.keys(learnt).length > 0 ? { ...progress, ...learnt } : progress;
}

export type ViewHintKind = 'look-around' | 'return' | 'leave-computer';

/**
 * The hint to show for the current view, or null once the visitor has outgrown it. Leaving the
 * computer is taught to mouse users only: on touch screens the reader fills the screen and has
 * its own close button. At the radio its own controls teach it.
 */
export function hintFor(progress: ViewHintProgress, view: RoomView, touch: boolean): ViewHintKind | null {
  // The radio teaches its own gestures (its controls show their hints).
  if (view === 'radio') return null;
  if (view === 'pc') return touch || progress.leftComputer ? null : 'leave-computer';
  if (view === 'tv') return progress.lookedAround ? null : 'look-around';
  return progress.returned ? null : 'return';
}

export function hintText(kind: ViewHintKind, touch: boolean): string {
  const verb = touch ? 'Tap' : 'Click';
  switch (kind) {
    case 'look-around':
      return `${verb} outside the TV to look around`;
    case 'return':
      return `${verb} the computer, the radio or the TV to look closer`;
    case 'leave-computer':
      return `${verb} outside the computer to look around`;
  }
}
