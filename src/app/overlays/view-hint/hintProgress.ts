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
}

export const VIEW_HINT_STORAGE_KEY = 'reo-leo:view-hints';

export function loadViewHintProgress(storage: FlagStorage | null): ViewHintProgress {
  const raw = readJson(storage, VIEW_HINT_STORAGE_KEY);
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return { lookedAround: record.lookedAround === true, returned: record.returned === true };
}

export function saveViewHintProgress(storage: FlagStorage | null, progress: ViewHintProgress): void {
  writeJson(storage, VIEW_HINT_STORAGE_KEY, progress);
}

/** Records a view change; returns the same object when nothing new was learnt. */
export function recordView(progress: ViewHintProgress, view: RoomView): ViewHintProgress {
  if (view === 'room' && !progress.lookedAround) return { ...progress, lookedAround: true };
  if (view === 'tv' && progress.lookedAround && !progress.returned) return { ...progress, returned: true };
  return progress;
}

export type ViewHintKind = 'look-around' | 'return';

/** The hint to show for the current view, or null once the visitor has outgrown it. */
export function hintFor(progress: ViewHintProgress, view: RoomView): ViewHintKind | null {
  if (view === 'tv') return progress.lookedAround ? null : 'look-around';
  return progress.returned ? null : 'return';
}

export function hintText(kind: ViewHintKind, touch: boolean): string {
  const verb = touch ? 'Tap' : 'Click';
  return kind === 'look-around' ? `${verb} outside the TV to look around` : `${verb} the TV to keep playing`;
}
