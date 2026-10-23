import {
  type Experience,
  getExperience,
  getLevel,
  type LevelId,
  type LevelInfo,
  type LevelTeaser,
  levels,
  nextLevelTeaser,
} from '@/content';
import type { SessionState } from '../../session';

/**
 * The mission-select model: one slot per playable mission (chronological,
 * matching the career) plus the locked "YOUR TEAM?" teaser. Pure data derived
 * from content and the session, so the screen and the stage-clear tally agree
 * on what "cleared" and "n/total highlights" mean.
 */
interface SlotBase {
  /** "COMPANY 1": every slot is an employer, numbered in career order. */
  readonly label: string;
}

export interface MissionSlot extends SlotBase {
  readonly kind: 'mission';
  readonly level: LevelInfo;
  readonly experience: Experience;
  readonly progress: MissionProgress;
}

export interface TeaserSlot extends SlotBase {
  readonly kind: 'teaser';
  readonly teaser: LevelTeaser;
}

export type Slot = MissionSlot | TeaserSlot;

export interface MissionProgress {
  readonly cleared: boolean;
  /** Distinct highlights ever collected on this mission. */
  readonly collected: number;
  readonly total: number;
}

export function missionProgress(session: SessionState, levelId: LevelId): MissionProgress {
  const experience = getExperience(getLevel(levelId).experienceId);
  const known = new Set(experience.highlights.map((highlight) => highlight.id));
  const collected = new Set((session.highlights[levelId] ?? []).filter((id) => known.has(id)));
  return { cleared: session.completed.includes(levelId), collected: collected.size, total: known.size };
}

export function buildSlots(session: SessionState): readonly Slot[] {
  const missions: Slot[] = levels.map((level, index) => ({
    kind: 'mission',
    label: companyLabel(index),
    level,
    experience: getExperience(level.experienceId),
    progress: missionProgress(session, level.id),
  }));
  return [...missions, { kind: 'teaser', label: companyLabel(missions.length), teaser: nextLevelTeaser }];
}

function companyLabel(index: number): string {
  return `COMPANY ${index + 1}`;
}

/**
 * Where the cursor starts: the requested mission if any (e.g. the one just
 * cleared), otherwise the first mission not yet cleared, otherwise the
 * teaser — once every mission is done, the next step is the visitor's team.
 */
export function initialFocus(slots: readonly Slot[], focus: LevelId | undefined): number {
  const requested = slots.findIndex((slot) => slot.kind === 'mission' && slot.level.id === focus);
  if (requested >= 0) return requested;
  const open = slots.findIndex((slot) => slot.kind === 'mission' && !slot.progress.cleared);
  if (open >= 0) return open;
  return Math.max(
    0,
    slots.findIndex((slot) => slot.kind === 'teaser'),
  );
}

/** The mission after `levelId` in career order, or `null` after the last one. */
export function nextLevel(levelId: LevelId): LevelInfo | null {
  const index = levels.findIndex((level) => level.id === levelId);
  return levels[index + 1] ?? null;
}

export function allMissionsCleared(session: SessionState): boolean {
  return levels.every((level) => session.completed.includes(level.id));
}

/** "2022–2024", or "2024–NOW" for the current role. Only years: months are noise on a postcard. */
export function formatYears(experience: Pick<Experience, 'start' | 'end'>): string {
  const year = (isoMonth: string) => isoMonth.slice(0, 4);
  return `${year(experience.start)}–${experience.end === null ? 'NOW' : year(experience.end)}`;
}

/**
 * The stamp-sized company name: "Luna (Utopian Labs)" → "LUNA". The full
 * name still appears in the briefing and on the stage-clear screen.
 */
export function stampName(company: string): string {
  return company.replace(/\s*\(.*\)\s*$/, '').toUpperCase();
}

/** The first mission, in career order, that has not been cleared yet. */
export function firstOpenLevel(session: SessionState): LevelId | undefined {
  return levels.find((level) => !session.completed.includes(level.id))?.id;
}
