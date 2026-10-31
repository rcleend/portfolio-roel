import { audioFileInfo, averageKbps } from './audioFiles';
import { ALBUM_LIMITS, type Album } from './types';

/**
 * The shelf's rules (docs/RADIO.md › Your own albums), checked against the files
 * themselves by `pnpm verify:radio` and `albums.test.ts`. Pure: the caller says how to
 * read a file and an image, so the same checks run under Node and in tests.
 */

export interface ImageFacts {
  readonly width: number;
  readonly height: number;
  readonly hasAlpha: boolean;
  /** `jpeg`, `webp`, `png`, … */
  readonly format: string;
}

export interface FileReader {
  /** The file's bytes, or null when it does not exist. */
  bytes(album: Album, name: string): Promise<Uint8Array | null>;
  /** The image's size and channels, or null when it does not exist or is not an image. */
  image(album: Album, name: string): Promise<ImageFacts | null>;
}

/** A track whose `seconds` disagrees with its file: what to paste into albums.ts. */
export interface Correction {
  readonly album: string;
  /** 1-based. */
  readonly track: number;
  readonly title: string;
  readonly declared: number;
  readonly seconds: number;
}

export interface ShelfReport {
  readonly problems: readonly string[];
  readonly corrections: readonly Correction[];
  /** Bytes of audio in placeholder albums (they ship in the repository). */
  readonly placeholderAudioBytes: number;
  /** Bytes of every local track together (each is fetched only when its CD plays). */
  readonly audioBytes: number;
}

/** How far `seconds` may be from the file before the verifier asks for the right value. */
export const DURATION_TOLERANCE = 0.5;
/** The highest average bitrate a track may stream at, kb/s (container overhead allowed for). */
export const MAX_KBPS = 256;
const KBPS_OVERHEAD = 1.05;
/** All placeholder audio together, in bytes. */
export const PLACEHOLDER_AUDIO_BUDGET = 5.5e6;
/**
 * One local track, in bytes: what a pick fetches (streamed, so the sound starts long before the end arrives).
 * 5 MB is about five minutes at 128 kb/s.
 */
export const TRACK_BYTES_BUDGET = 5e6;
/** Every local track together, in bytes: what ships in the repository and the deploy, never in the first load. */
export const AUDIO_BUDGET = 16e6;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REMOTE = /^https:\/\//i;
const COVER_FORMATS = new Set(['jpeg', 'webp', 'png']);

export async function validateAlbums(albums: readonly Album[], files: FileReader): Promise<ShelfReport> {
  const problems: string[] = [];
  const corrections: Correction[] = [];
  let placeholderAudioBytes = 0;
  let audioBytes = 0;

  if (albums.length < ALBUM_LIMITS.albums.min || albums.length > ALBUM_LIMITS.albums.max) {
    problems.push(
      `the shelf holds ${albums.length} albums; it takes ${ALBUM_LIMITS.albums.min}–${ALBUM_LIMITS.albums.max}`,
    );
  }
  const seen = new Set<string>();
  for (const album of albums) {
    const where = `album "${album.id}"`;
    if (!ID.test(album.id)) problems.push(`${where}: the id must be kebab-case (it is also the folder name)`);
    if (seen.has(album.id)) problems.push(`${where}: the id is used twice`);
    seen.add(album.id);
    if (!album.title.trim() || !album.artist.trim()) problems.push(`${where}: needs a title and an artist`);
    if (album.gainDb !== undefined && !(album.gainDb <= 0)) problems.push(`${where}: gainDb must be 0 or less`);
    if (album.tracks.length < ALBUM_LIMITS.tracks.min || album.tracks.length > ALBUM_LIMITS.tracks.max) {
      problems.push(
        `${where}: has ${album.tracks.length} tracks; a disc takes ${ALBUM_LIMITS.tracks.min}–${ALBUM_LIMITS.tracks.max}`,
      );
    }

    if (!REMOTE.test(album.cover)) {
      const cover = await files.image(album, album.cover);
      if (!cover) problems.push(`${where}: the cover ${album.cover} is missing or not an image`);
      else if (cover.width !== cover.height || cover.width < 512 || !COVER_FORMATS.has(cover.format)) {
        problems.push(
          `${where}: the cover must be a square JPEG, WebP or PNG of at least 512 px (it is ${cover.format} ${cover.width} × ${cover.height})`,
        );
      }
    }
    if (album.disc !== undefined && !REMOTE.test(album.disc)) {
      const disc = await files.image(album, album.disc);
      if (!disc) problems.push(`${where}: the disc print ${album.disc} is missing or not an image`);
      else if (disc.width !== 512 || disc.height !== 512 || !disc.hasAlpha) {
        problems.push(
          `${where}: the disc print must be 512 × 512 with transparency (it is ${disc.width} × ${disc.height}${disc.hasAlpha ? '' : ', opaque'})`,
        );
      }
    }

    for (const [index, track] of album.tracks.entries()) {
      const at = `${where}, track ${index + 1} "${track.title}"`;
      if (!track.title.trim()) problems.push(`${at}: needs a title`);
      if (REMOTE.test(track.file)) continue;
      const bytes = await files.bytes(album, track.file);
      if (!bytes) {
        problems.push(`${at}: ${track.file} is missing`);
        continue;
      }
      const info = audioFileInfo(track.file, bytes);
      if (!info) {
        problems.push(`${at}: ${track.file} must be .m4a (AAC) or .mp3`);
        continue;
      }
      if (info.kind === 'mp4' && info.codec !== 'aac-lc') problems.push(`${at}: ${track.file} is not AAC-LC`);
      if (info.kind === 'mp4' && !info.moovBeforeMdat) {
        problems.push(
          `${at}: ${track.file} cannot stream: its moov box comes after the audio (ffmpeg -movflags +faststart)`,
        );
      }
      if (info.kind === 'mp3' && !info.mpeg1Layer3) problems.push(`${at}: ${track.file} is not MPEG-1 Layer III`);
      if (info.seconds === null) {
        problems.push(`${at}: cannot read the length of ${track.file}`);
        continue;
      }
      if (averageKbps(bytes.length, info.seconds) > MAX_KBPS * KBPS_OVERHEAD) {
        problems.push(
          `${at}: ${track.file} streams at ${averageKbps(bytes.length, info.seconds).toFixed(0)} kb/s; keep it at ${MAX_KBPS} or less`,
        );
      }
      if (!(Math.abs(info.seconds - track.seconds) <= DURATION_TOLERANCE)) {
        corrections.push({
          album: album.id,
          track: index + 1,
          title: track.title,
          declared: track.seconds,
          seconds: round(info.seconds),
        });
      }
      if (bytes.length > TRACK_BYTES_BUDGET) {
        problems.push(
          `${at}: ${track.file} is ${(bytes.length / 1e6).toFixed(2)} MB; a track may take ${TRACK_BYTES_BUDGET / 1e6} MB`,
        );
      }
      audioBytes += bytes.length;
      if (album.placeholder) placeholderAudioBytes += bytes.length;
    }
  }
  if (placeholderAudioBytes > PLACEHOLDER_AUDIO_BUDGET) {
    problems.push(
      `the placeholder audio takes ${(placeholderAudioBytes / 1e6).toFixed(2)} MB of ${PLACEHOLDER_AUDIO_BUDGET / 1e6} MB`,
    );
  }
  if (audioBytes > AUDIO_BUDGET) {
    problems.push(`the shelf's audio takes ${(audioBytes / 1e6).toFixed(2)} MB of ${AUDIO_BUDGET / 1e6} MB`);
  }
  for (const correction of corrections) {
    problems.push(
      `album "${correction.album}", track ${correction.track} "${correction.title}": seconds is ${correction.declared}, the file is ${correction.seconds}`,
    );
  }
  return { problems, corrections, placeholderAudioBytes, audioBytes };
}

function round(seconds: number): number {
  return Math.round(seconds * 100) / 100;
}
