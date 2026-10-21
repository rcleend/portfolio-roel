import type { CharacterId } from '@/content';

export type ParticleKind = 'code' | 'paint' | 'notes';

/** Per-character colour accents for the card: the pedestal glow and the drifting particles. */
export interface ClassTheme {
  readonly particles: ParticleKind;
  /** Pedestal glow ramp, darkest first; the pulse steps through it. */
  readonly glow: readonly [string, string, string, string];
  /** Colour of the class label on the right. */
  readonly accent: string;
}

export const classThemes: Readonly<Record<CharacterId, ClassTheme>> = {
  hackerman: {
    particles: 'code',
    glow: ['#123a3a', '#1b6b52', '#2fbf6a', '#9dffc4'],
    accent: '#3ddc84',
  },
  artsy: {
    particles: 'paint',
    glow: ['#3a1748', '#7a2a6e', '#e0479e', '#ffb3dc'],
    accent: '#ff7ab8',
  },
  strategy: {
    particles: 'notes',
    glow: ['#3a2c18', '#7a5a1c', '#e0a52a', '#fff1a0'],
    accent: '#ffc83d',
  },
};
