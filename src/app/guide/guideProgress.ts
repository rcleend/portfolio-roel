import type { RoomView } from '@/room';
import { type FlagStorage, readJson, writeJson } from '../storage/localFlag';

/**
 * What the visitor has already found out about the room, on this visit and earlier ones. Each hint retires for good
 * once its gesture has been done, and the props' tour plays once.
 */
export interface GuideProgress {
  /** Has left the TV for the room at least once (the click-outside hint retires). */
  readonly lookedAround: boolean;
  /** Has sat down at the computer at least once. */
  readonly visitedComputer: boolean;
  /** Has got up from the computer again at least once. */
  readonly leftComputer: boolean;
  /** Has seen the props light up one by one on a first look around (or cut it short). */
  readonly toured: boolean;
}

/** The record the earlier view hints kept: a visitor who learnt a gesture then is not taught it again. */
export const GUIDE_STORAGE_KEY = 'reo-leo:view-hints';

/** Unknown or missing fields (e.g. a record saved before the tour existed) count as not done. */
export function loadGuideProgress(storage: FlagStorage | null): GuideProgress {
  const raw = readJson(storage, GUIDE_STORAGE_KEY);
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    lookedAround: record.lookedAround === true,
    visitedComputer: record.visitedComputer === true,
    leftComputer: record.leftComputer === true,
    toured: record.toured === true,
  };
}

export function saveGuideProgress(storage: FlagStorage | null, progress: GuideProgress): void {
  writeJson(storage, GUIDE_STORAGE_KEY, progress);
}

type Learnt = Partial<{ -readonly [K in keyof GuideProgress]: boolean }>;

/** Records a view change; returns the same object when nothing new was learnt. */
export function recordView(progress: GuideProgress, view: RoomView): GuideProgress {
  const learnt: Learnt = {};
  if (view !== 'tv' && !progress.lookedAround) learnt.lookedAround = true;
  if (view === 'pc' && !progress.visitedComputer) learnt.visitedComputer = true;
  if (view !== 'pc' && progress.visitedComputer && !progress.leftComputer) learnt.leftComputer = true;
  return learn(progress, learnt);
}

/** Records the tour as seen; the same object when it already was. */
export function recordTour(progress: GuideProgress): GuideProgress {
  return learn(progress, { toured: true });
}

function learn(progress: GuideProgress, learnt: Learnt): GuideProgress {
  return Object.keys(learnt).some((key) => !progress[key as keyof GuideProgress])
    ? { ...progress, ...learnt }
    : progress;
}

/**
 * The computer still owes the visitor the way back up. Taught to mouse users only: on touch screens the reader fills
 * the screen and has its own close button. The TV's hint is the look-around button itself, and the radio and the room
 * view teach their own.
 */
export function leaveHintDue(progress: GuideProgress, touch: boolean): boolean {
  return !touch && !progress.leftComputer;
}
