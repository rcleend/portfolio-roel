/**
 * The CD player's shelf (docs/RADIO.md › Your own albums). Pure data: the
 * radio's lazy chunk is the only code that reads it, so nothing here reaches
 * the first load.
 */
export interface Album {
  /** kebab-case, unique: also the folder name under src/content/radio/albums/. */
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly year?: number;
  /** File in the album's folder (or an https URL served with CORS): square, ≥ 512 px, JPEG/WebP/PNG. */
  readonly cover: string;
  /** Optional 512² RGBA disc print; alpha is ink coverage (transparent shows bare foil). Defaults to the cover. */
  readonly disc?: string;
  /** Loudness correction ≤ 0 dB for albums louder than the game (see `pnpm verify:radio`). */
  readonly gainDb?: number;
  /** Placeholder content: the caption says so. */
  readonly placeholder?: boolean;
  readonly tracks: readonly Track[];
}

export interface Track {
  readonly title: string;
  /** File in the album's folder (or an https URL): AAC-LC .m4a with moov before mdat, or .mp3; ≤ 256 kb/s. */
  readonly file: string;
  /** Length in seconds; `pnpm verify:radio` prints the right value when it is missing or wrong. */
  readonly seconds: number;
}

/** What the shelf holds: 1–12 albums of 1–20 tracks each (the disc layout and the verifier enforce it). */
export const ALBUM_LIMITS = { albums: { min: 1, max: 12 }, tracks: { min: 1, max: 20 } } as const;
