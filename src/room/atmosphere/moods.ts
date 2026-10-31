type Tint = readonly [number, number, number];

/** Displays keep their original contrast; only a trace of the room's colour reaches the picture. */
export const SCREEN_FINISH_STRENGTH = 0.12;

/** Multipliers for the preview's air controls; 1 uses the chosen mood's art direction. */
export interface RoomAir {
  readonly haze: number;
  readonly dust: number;
}

export interface MoodFinish {
  readonly exposure: number;
  readonly shadows: Tint;
  readonly highlights: Tint;
  readonly bloomTint: Tint;
  readonly saturation: number;
  readonly bloom: number;
  readonly diffusion: number;
  readonly vignette: number;
  readonly gloss: number;
  readonly warmth: number;
  readonly haze: number;
  readonly airTint: Tint;
  readonly windowTint: Tint;
  readonly dust: number;
  readonly drift: number;
}

/** Three deliberately different night-time finishes; the bake is kept as a fourth, unprocessed comparison. */
export const ROOM_MOODS = {
  honey: {
    name: 'Honey & dust',
    description: 'Golden lamplight, tobacco-brown shadows, and slow dust in the warm evening air.',
    finish: {
      exposure: 0.51,
      shadows: [1.22, 0.69, 0.43],
      highlights: [1.48, 1.02, 0.67],
      bloomTint: [1.0, 0.68, 0.37],
      saturation: 0.86,
      bloom: 0.5,
      diffusion: 0.15,
      vignette: 0.38,
      gloss: 0.55,
      warmth: 1.7,
      haze: 0.09,
      airTint: [1.0, 0.42, 0.14],
      windowTint: [0.64, 0.45, 0.25],
      dust: 0.9,
      drift: 0.7,
    },
  },
  rose: {
    name: 'Velvet dusk',
    description: 'Peach-coloured pools of light, plum shadows, and a softer, dustier summer dream.',
    finish: {
      exposure: 0.5,
      shadows: [1.12, 0.55, 1.15],
      highlights: [1.34, 0.87, 0.84],
      bloomTint: [1.0, 0.52, 0.48],
      saturation: 0.8,
      bloom: 0.65,
      diffusion: 0.24,
      vignette: 0.39,
      gloss: 0.55,
      warmth: 1.5,
      haze: 0.12,
      airTint: [1.0, 0.36, 0.26],
      windowTint: [0.47, 0.35, 0.68],
      dust: 1.2,
      drift: 0.5,
    },
  },
  midnight: {
    name: 'Moonlit hideaway',
    description: 'Cool blue air at the window, tiny copper lamps, and silver dust after everyone is asleep.',
    finish: {
      exposure: 0.42,
      shadows: [0.42, 0.67, 1.38],
      highlights: [1.03, 0.97, 1.12],
      bloomTint: [1.0, 0.67, 0.4],
      saturation: 0.85,
      bloom: 0.46,
      diffusion: 0.13,
      vignette: 0.45,
      gloss: 0.65,
      warmth: 2.1,
      haze: 0.075,
      airTint: [1.0, 0.38, 0.12],
      windowTint: [0.26, 0.49, 1.0],
      dust: 0.8,
      drift: 0.85,
    },
  },
} as const satisfies Record<string, { name: string; description: string; finish: MoodFinish }>;

export type RoomMood = 'original' | keyof typeof ROOM_MOODS;

/** Unknown or stale preview links use the unchanged bake. */
export function readRoomMood(value: string | null): RoomMood {
  return value === 'honey' || value === 'rose' || value === 'midnight' ? value : 'original';
}
