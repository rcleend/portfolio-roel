import { type FlagStorage, readJson, writeJson } from '../storage/localFlag';

/** What the visitor has already seen of the room, on this visit and earlier ones: the props' tour plays once. */
export interface GuideProgress {
  /** Has seen the props light up one by one on a first look around (or cut it short). */
  readonly toured: boolean;
}

/** The record the earlier view hints kept (fields they wrote then are left out on the next save). */
export const GUIDE_STORAGE_KEY = 'reo-leo:view-hints';

/** Unknown or missing fields (e.g. a record saved before the tour existed) count as not done. */
export function loadGuideProgress(storage: FlagStorage | null): GuideProgress {
  const raw = readJson(storage, GUIDE_STORAGE_KEY);
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return { toured: record.toured === true };
}

export function saveGuideProgress(storage: FlagStorage | null, progress: GuideProgress): void {
  writeJson(storage, GUIDE_STORAGE_KEY, progress);
}

/** Records the tour as seen; the same object when it already was. */
export function recordTour(progress: GuideProgress): GuideProgress {
  return progress.toured ? progress : { ...progress, toured: true };
}
