import type { RoomMood } from '../atmosphere/moods';
import type { QualityTier } from '../stage/quality';

/** What the room is built and baked at; read once, from the tier the device starts on. */
export interface GeneratedTier {
  /** Chart texels a metre as a fraction of full quality, and the largest page side. */
  readonly density: number;
  readonly pageSize: number;
  /** The art page's side (the prints). */
  readonly artSize: number;
  /** The bake's shadow map side, its light pages as a fraction of the chart pages, and which sample counts (rig.ts). */
  readonly shadowSize: number;
  readonly lightScale: number;
  readonly sampleSet: 0 | 1;
  /** How finely the props are built, 0–1 (PropSink.detail): fewer segments and no smallest parts on a phone. */
  readonly detail: number;
}

/**
 * The room's making by quality tier (stage/quality.ts, docs/ROOM.md › Quality): every tier gets the same room, a lower
 * one smaller pages, coarser props and a shorter bake.
 */
export const GENERATED_TIERS: Readonly<Record<QualityTier, GeneratedTier>> = {
  high: { density: 1, pageSize: 2048, artSize: 1024, shadowSize: 1024, lightScale: 0.5, sampleSet: 0, detail: 1 },
  medium: { density: 0.5, pageSize: 1024, artSize: 512, shadowSize: 1024, lightScale: 1, sampleSet: 0, detail: 0.6 },
  low: { density: 0.5, pageSize: 1024, artSize: 512, shadowSize: 512, lightScale: 1, sampleSet: 1, detail: 0.45 },
};

/**
 * The finish's static lights, as the room's own code sets them (gen.test.ts holds these to atmosphere/tvLamp.ts,
 * bulbLamp.ts and moods.ts): the opal lamp's intensity on its colour, and each mood's warmth on the lamps' pools.
 * Copies, so that nothing under gen/ imports the room's own modules at run time (genKit.ts says why).
 */
export const TV_LAMP_INTENSITY = 0.14;
export const POOL_WARMTH: Readonly<Record<RoomMood, number>> = { original: 0, honey: 1.7, rose: 1.5, midnight: 2.1 };
