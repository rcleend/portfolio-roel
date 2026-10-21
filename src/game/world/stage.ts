import type { LevelId } from '@/content';
import type { MusicId } from '../audio/ids';
import type { LevelLayout } from './map/layout';

/**
 * A playable stage: the layout from the DSL plus the theme that dresses its
 * generic markers in level-specific props (a moving platform is a cable car
 * in San Francisco and a U-Bahn carriage in Berlin).
 */
export interface StageDefinition {
  readonly levelId: LevelId;
  readonly layout: LevelLayout;
  readonly theme: StageTheme;
}

export interface StageTheme {
  readonly music: MusicId;
  readonly mover: MoverStyle;
  readonly gate: GateStyle | null;
  readonly slowZone: SlowZoneStyle | null;
  readonly barrier: BarrierStyle | null;
  readonly pit: PitStyle;
  /** What happens after the escalated customer is retained. */
  readonly finale: 'acquired' | 'product-market-fit';
  /** Shown on the boss bar: "UNHAPPY CUSTOMER — <plan>". */
  readonly bossPlan: string;
  /** How sparsely the art's foreground layer (poles, lamps) is drawn in front of the player. */
  readonly foreground: ForegroundStyle;
}

/** A prop that rides along the ground on rails and carries the player on its roof. */
export interface MoverStyle {
  /** Prop sheet name in the level's `layers.json`. */
  readonly prop: string;
  /** Rows of transparent pixels above the walkable roof in the prop image. */
  readonly roofInset: number;
  /** Horizontal inset of the walkable roof from each side of the prop image. */
  readonly roofMargin: number;
  readonly speed: number;
  /** Seconds the vehicle waits at each end of its track. */
  readonly dwell: number;
  readonly railColor: string;
  readonly railShade: string;
}

/** A barrier that closes and opens on a cycle; closed, it blocks the whole column of the screen. */
export interface GateStyle {
  readonly prop: string;
  readonly closedSeconds: number;
  readonly openSeconds: number;
  readonly beamColor: string;
}

/** A zone that slows the player down while inside (scope creep). */
export interface SlowZoneStyle {
  readonly prop: string;
  readonly speed: number;
  readonly jump: number;
}

/** A low construction barrier whose top bar can be stood on. */
export interface BarrierStyle {
  readonly prop: string;
  /** Rows above the walkable top bar in the prop image. */
  readonly topInset: number;
}

export interface PitStyle {
  /** A sign drawn inside each pit, e.g. "SPAM". */
  readonly label: string;
  readonly labelColor: string;
}

export interface ForegroundStyle {
  /** Draw only every n-th repetition of a foreground layer. */
  readonly every: number;
  /** Which repetition (mod `every`) is drawn. */
  readonly offset: number;
}
