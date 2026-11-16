/**
 * The decorated attic's layout (docs/ROOM.md › Posters): twenty-nine printed pieces and a corkboard on the back wall
 * and the sloped ceiling. Blender's Z-up metres, as the room was designed: `back` is (a: x, b: z) on the wall
 * y = 2.405; `slope` is (a: y, b: metres down the slope from the ridge). `rot` in degrees, counter-clockwise as seen
 * from the room. Layer n sits 1 + 0.75 n mm off its surface; cork pieces (layer ≥ 11) lie on the cork.
 */
export type Surface = 'back' | 'slope';
export type Corner = 'BL' | 'BR' | 'TR' | 'TL';
export type TapeSpot = Corner | 'ML' | 'MR';
export type Finish = 'matte' | 'satin' | 'semi-gloss' | 'gloss';
export type SkirtSide = 'b' | 't' | 'l' | 'r';

export interface PosterItem {
  readonly key: string;
  readonly surface: Surface;
  readonly a: number;
  readonly b: number;
  /** Metres. */
  readonly w: number;
  readonly h: number;
  readonly rot: number;
  readonly layer: number;
  /** Masking tape at these spots; a cork piece hangs from one push pin instead. */
  readonly tapes: readonly TapeSpot[];
  /** Atlas texels per centimetre at the 2K tier. */
  readonly density: number;
  readonly finish: Finish;
  /** Corners that have come off the wall, and by how far (metres). */
  readonly curl?: Readonly<Partial<Record<Corner, number>>>;
  /** Fold lines from the magazine it was pulled out of: how many across the width and across the height. */
  readonly creases?: readonly [number, number];
  /** Tapes whose free end has let go. */
  readonly lifted?: readonly TapeSpot[];
  /** Tapes under a higher sheet: on the paper, but with no overhang of their own. */
  readonly hidden?: readonly TapeSpot[];
  /** Sides whose contact shadow is wider than SKIRT (metres). */
  readonly skirt?: Readonly<Partial<Record<SkirtSide, number>>>;
  readonly cork?: true;
}

export const BACK_Y = 2.405;
export const RIDGE: readonly [number, number] = [0.95, 3.28];
/** Down the slope, ridge to knee wall, and its normal into the room. */
export const SLOPE_DIR: readonly [number, number] = [0.797, -0.603];
export const SLOPE_NORMAL: readonly [number, number] = [-0.603, -0.797];

/** The default width of a piece's contact shadow. */
export const SKIRT = 0.025;
/** A strip of masking tape: length and width. */
export const TAPE_SIZE: readonly [number, number] = [0.0525, 0.019];
/** How far a corner tape reaches onto its sheet, along the diagonal. */
export const TAPE_IN = 0.004;

export const CORKBOARD = { key: 'corkboard', a: -2.54, b: 1.53, w: 0.46, h: 0.36, density: 4.25 } as const;
export const CORKBOARD_SKIRT: Readonly<Partial<Record<SkirtSide, number>>> = { l: 0.03, t: 0.06 };

const T4: readonly TapeSpot[] = ['BL', 'BR', 'TR', 'TL'];
const T2_ENDS: readonly TapeSpot[] = ['ML', 'MR'];
const T2_TOP: readonly TapeSpot[] = ['TL', 'TR'];
const NONE: readonly TapeSpot[] = [];

type Row = readonly [
  key: string,
  surface: Surface,
  a: number,
  b: number,
  w: number,
  h: number,
  rot: number,
  layer: number,
  tapes: readonly TapeSpot[],
  density: number,
  finish: Finish,
  extra?: Partial<PosterItem>,
];

const ROWS: readonly Row[] = [
  // Over the radio, right of the window: the densest cluster.
  ['M1', 'back', 0.66, 2.21, 0.6, 0.6, 1, 1, T4, 4.5, 'matte', { lifted: ['TR'], hidden: ['BL', 'BR'] }],
  [
    'M2',
    'back',
    1.17,
    2.03,
    0.5,
    0.5,
    -3,
    2,
    T4,
    4,
    'matte',
    { curl: { BR: 0.014 }, hidden: ['BR', 'TR'], skirt: { r: 0.035 } },
  ],
  ['M3', 'back', 1.06, 2.59, 0.62, 0.0748, -1.5, 1, T2_ENDS, 4.25, 'semi-gloss', { skirt: { b: 0.045, r: 0.045 } }],
  [
    'M4',
    'back',
    0.33,
    1.877,
    0.2,
    0.2667,
    -6,
    3,
    T2_TOP,
    4.5,
    'matte',
    { curl: { BL: 0.008, BR: 0.005 }, skirt: { l: 0.035 } },
  ],
  ['M5', 'back', 1.47, 1.89, 0.21, 0.2917, 4, 3, T2_TOP, 4, 'matte', { curl: { BR: 0.009 } }],
  ['M6', 'back', 0.93, 1.93, 0.1, 0.1013, 8, 4, NONE, 6, 'gloss', { skirt: { b: 0.035 } }],
  [
    'B1',
    'back',
    0.01,
    2.14,
    0.58,
    0.7907,
    1.5,
    1,
    T4,
    4.75,
    'satin',
    { curl: { TL: 0.012 }, lifted: ['TL'], skirt: { t: 0.045 } },
  ],
  [
    'R1',
    'back',
    -0.005,
    1.4,
    0.52,
    0.325,
    -1.5,
    1,
    T4,
    4.5,
    'matte',
    { curl: { BL: 0.01 }, skirt: { b: 0.035, l: 0.035 } },
  ],
  ['R2', 'back', 0.04, 1.6, 0.36, 0.1149, 3, 2, T2_ENDS, 4.5, 'matte', { skirt: { l: 0.045 } }],
  // Left of the window and over it.
  ['F1', 'back', -2.3, 2.93, 0.46, 0.368, -2.5, 1, T4, 4.5, 'gloss', { creases: [1, 0], skirt: { l: 0.035 } }],
  [
    'A1',
    'back',
    -1.7,
    2.965,
    0.33,
    0.4952,
    2.5,
    1,
    T4,
    4.5,
    'satin',
    { curl: { BR: 0.016 }, lifted: ['BR'], skirt: { b: 0.035 } },
  ],
  ['F3', 'back', -1.28, 2.87, 0.54, 0.2752, -1, 2, T4, 4.5, 'matte', { skirt: { b: 0.035, l: 0.065, r: 0.035 } }],
  ['B3', 'back', -0.62, 2.96, 0.4, 0.4158, -3, 1, T4, 4, 'matte'],
  [
    'O1',
    'back',
    -2.535,
    2.25,
    0.4,
    0.3615,
    2,
    1,
    ['BL', 'TR', 'TL'],
    4.25,
    'matte',
    { curl: { BR: 0.02 }, skirt: { b: 0.035, l: 0.035, r: 0.045, t: 0.035 } },
  ],
  // On the corkboard.
  ['C4', 'back', -2.645, 1.602, 0.15, 0.1125, -7, 11, NONE, 6, 'matte', { cork: true }],
  ['C3', 'back', -2.528, 1.57, 0.11, 0.1093, 9, 12, NONE, 6, 'gloss', { cork: true }],
  ['C7', 'back', -2.442, 1.613, 0.12, 0.12, 4, 13, NONE, 6, 'matte', { cork: true }],
  ['C5', 'back', -2.68, 1.458, 0.1, 0.1427, 6, 11, NONE, 6, 'matte', { cork: true }],
  ['C2', 'back', -2.52, 1.452, 0.14, 0.0875, -3, 12, NONE, 6, 'matte', { cork: true }],
  ['C6', 'back', -2.38, 1.408, 0.1, 0.1063, -10, 13, NONE, 6, 'matte', { cork: true }],
  // Towards the dresser.
  ['E1', 'back', 1.64, 2.36, 0.48, 0.36, -2, 3, T4, 4, 'gloss', { skirt: { b: 0.035 } }],
  ['E2', 'back', 1.98, 1.86, 0.42, 0.51, 3, 1, T4, 4, 'gloss', { curl: { BL: 0.012 }, skirt: { b: 0.035 } }],
  ['G1', 'back', 2.44, 1.66, 0.3, 0.3, -4, 1, T4, 4, 'satin', { lifted: ['TR'], skirt: { r: 0.035, t: 0.035 } }],
  // The sloped ceiling.
  ['S1', 'slope', 0.4, 1.42, 0.69, 1.0557, 2, 1, [...T4, ...T2_ENDS], 6.25, 'semi-gloss'],
  [
    'S2',
    'slope',
    1.12,
    1.05,
    0.61,
    0.9153,
    -4,
    1,
    T4,
    5.75,
    'satin',
    { curl: { BL: 0.022 }, lifted: ['BL'], skirt: { b: 0.035 } },
  ],
  ['S3', 'slope', 1.92, 1.45, 0.61, 0.9037, 4, 1, T4, 4.25, 'gloss'],
  ['S4', 'slope', -0.42, 1.2, 0.72, 0.4047, -5, 1, T4, 8.25, 'gloss', { creases: [1, 1] }],
  ['S5', 'slope', -0.3, 1.78, 0.45, 0.414, 3, 1, T4, 7.25, 'gloss', { creases: [1, 1] }],
  ['O2', 'slope', 1.76, 0.44, 0.46, 0.4744, -3, 1, T4, 5.5, 'matte', { lifted: ['TR'] }],
];

export const ITEMS: readonly PosterItem[] = ROWS.map(
  ([key, surface, a, b, w, h, rot, layer, tapes, density, finish, extra]) => ({
    key,
    surface,
    a,
    b,
    w,
    h,
    rot,
    layer,
    tapes,
    density,
    finish,
    ...extra,
  }),
);
