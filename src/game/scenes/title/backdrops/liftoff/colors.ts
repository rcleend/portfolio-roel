import { parseHex, type Rgba } from '@/engine/gfx/color';

/**
 * Liftoff's palette (docs/ART-DIRECTION.md › Title › Liftoff). Ramps run
 * dark to light, so lighting a pixel is a step along its ramp: the ignition
 * pushes the dusk sky towards white instead of laying a translucent wash
 * over it.
 */

/**
 * Dusk from the zenith (0) through twilight's purple light (7–10), which
 * sits behind the logo, to the glow on the horizon (15); then what the
 * ignition adds on top (16–19).
 */
export const SKY: readonly Rgba[] = [
  '#0c0922',
  '#110c2c',
  '#170f38',
  '#1e1345',
  '#261752',
  '#301c5e',
  '#3c2470',
  '#4a2c7c',
  '#583486',
  '#683c8c',
  '#7a448e',
  '#8e4c8a',
  '#a65480',
  '#c06274',
  '#d67a6e',
  '#e89a70',
  '#f2bc84',
  '#fcdcaa',
  '#fff4d8',
  '#ffffff',
].map(parseHex);

/**
 * High cloud: cool violet so it never fights the orange logo face, its body
 * a mid tone behind the lettering, lit pink from below by the set sun.
 */
export const CLOUD: readonly Rgba[] = [
  '#2a1c4e',
  '#33245a',
  '#3e2c66',
  '#4a3672',
  '#56407e',
  '#634a88',
  '#725692',
  '#84639a',
  '#9a72a2',
  '#b286aa',
  '#cca0b6',
  '#e8c0c8',
  '#fae4de',
].map(parseHex);

/** The plain in front of the skyline, darkest at the bottom where the copyright sits; the top steps are ignition light. */
export const GROUND: readonly Rgba[] = [
  '#07050d',
  '#0b0814',
  '#100b1b',
  '#160f23',
  '#1e132c',
  '#2c1a36',
  '#46243e',
  '#6e3444',
  '#a24e4a',
  '#d67a54',
  '#f8b66a',
].map(parseHex);

/** Silhouettes, back to front: the far haze (hills, the pyramid), the city, and what stands nearest. */
export const SILHOUETTE = {
  far: parseHex('#4a2a50'),
  farRim: parseHex('#5e3658'),
  city: parseHex('#2a1838'),
  cityRim: parseHex('#3d2346'),
  near: parseHex('#170c24'),
  nearRim: parseHex('#33203f'),
  /** The bridge keeps a trace of International Orange, even at dusk. */
  bridge: parseHex('#26101e'),
  bridgeRim: parseHex('#552030'),
  /** The bridge's hangers, so fine against the glow that they read lighter than the steel. */
  suspender: parseHex('#6a2a46'),
  window: parseHex('#f6b45e'),
  windowDim: parseHex('#a2603e'),
  /** The flame trench's mouths in the pad deck. */
  mouth: parseHex('#0a0612'),
  /** An aviation light between blinks. */
  beaconOff: parseHex('#5a1420'),
} as const;

/** Aviation lights, drawn per frame on top of `SILHOUETTE.beaconOff`. */
export const BEACON_ON = '#ff4438';

/**
 * Smoke ramps, one per lighting, each from shadow to highlight and all the
 * same length, so exhaust light can blend one into another step by step.
 */
export const SMOKE = {
  /** The banks once the rocket has gone: dusky lavender, backlit, their tops catching the warm horizon. */
  dusk: ['#141020', '#1c1729', '#252033', '#2f293f', '#3c344c', '#4c405a', '#644e66', '#87626e', '#ad7c78', '#d69f86'],
  /** Lit from below by the exhaust, like embers. */
  ember: ['#1c1220', '#2c1a2c', '#442636', '#64343e', '#8a4844', '#b46048', '#d8804c', '#f0a650', '#ffd27a', '#fff2c0'],
  /** The column below the terminator, in the Earth's shadow. */
  shadow: [
    '#211a30',
    '#2a223b',
    '#342b47',
    '#3f3552',
    '#4b405e',
    '#584b69',
    '#665774',
    '#76657e',
    '#887488',
    '#9c8590',
  ],
  /** The column above the terminator, still lit by the sun from below the horizon. */
  sunlit: [
    '#2e2250',
    '#3c2c5e',
    '#4c386c',
    '#5e467a',
    '#735588',
    '#8a6694',
    '#a27a9e',
    '#bc8fa8',
    '#d6a8b2',
    '#efc8c0',
  ],
} as const;

/** The ignition bloom's rings, outermost first: a rose rim around a white-hot core. */
export const BLOOM = ['#e2786a', '#f6b07a', '#ffe0a8', '#ffffff'] as const;
/** Under reduced motion the bloom is a small warm glow that never goes white. */
export const BLOOM_SOFT = ['#b8584e', '#e48c62', '#f8c482'] as const;

/** The exhaust flame, white-hot core to red-orange tip. */
export const FLAME = ['#ffffff', '#fff6c8', '#ffe070', '#ffb03a', '#ff7a22', '#e84a1c'] as const;

/** Twinkle steps of a star, dark to bright. */
export const STAR = ['#3a3378', '#5f58a6', '#9a92dc', '#d8d2ff', '#ffffff'] as const;

/** The sonic-boom ring, newest to oldest: it dims step by step instead of fading. */
export const BOOM = ['#f2ecff', '#c8bcf4', '#9686d6', '#6c5cb0', '#4a3c88'] as const;

/** A far rocket's trail, hottest at the rocket and coolest where it is oldest. */
export const TRAIL = ['#fff6d0', '#e8dcff', '#b8a8ea', '#8a7acc', '#6352a6', '#45387e'] as const;
