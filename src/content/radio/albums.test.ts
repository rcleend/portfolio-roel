import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ALBUMS } from './albums';
import { resolveFile } from './files';
import type { Album } from './types';
import { type FileReader, type ImageFacts, validateAlbums } from './validate';

const FOLDER = join(import.meta.dirname, 'albums');

/** Reads the albums' folders from disk, as `pnpm verify:radio` does. */
const disk: FileReader = {
  bytes: (album, name) =>
    readFile(join(FOLDER, album.id, name)).then(
      (buffer) => new Uint8Array(buffer),
      () => null,
    ),
  image: (album, name) =>
    sharp(join(FOLDER, album.id, name))
      .metadata()
      .then(
        ({ width, height, hasAlpha, format }) => ({ width, height, hasAlpha, format }),
        () => null,
      ),
};

describe('the shelf', () => {
  it('passes every rule against its files: schema, lengths, codecs, streaming, art', async () => {
    const report = await validateAlbums(ALBUMS, disk);
    expect(report.problems).toEqual([]);
    expect(report.placeholderAudioBytes).toBe(0);
    expect(report.audioBytes).toBeGreaterThan(0);
  });

  it('bundles a URL for every local file it names', () => {
    for (const album of ALBUMS) {
      for (const name of [album.cover, album.disc, ...album.tracks.map((track) => track.file)]) {
        if (name !== undefined) expect(resolveFile(album, name), `${album.id}/${name}`).toMatch(/\S/);
      }
    }
  });

  it("holds Roel's own songs, none marked as a placeholder", () => {
    expect(ALBUMS.some((album) => album.placeholder === true)).toBe(false);
  });
});

describe('resolveFile', () => {
  it('passes https URLs through and throws for a file that is not there', () => {
    const album = { id: 'night-shift' };
    expect(resolveFile(album, 'https://example.com/a.mp3')).toBe('https://example.com/a.mp3');
    expect(() => resolveFile(album, 'missing.m4a')).toThrow(/does not exist/);
  });
});

describe('validateAlbums', () => {
  const track = { title: 'One', file: '01-one.m4a', seconds: 2 };
  const album = (overrides: Partial<Album> = {}): Album => ({
    id: 'a-b',
    title: 'Title',
    artist: 'Artist',
    cover: 'cover.jpg',
    tracks: [track],
    ...overrides,
  });
  /** A fake folder: every image is a 512² JPEG cover unless named, every track a 2 s AAC file. */
  const fake = (images: Record<string, ImageFacts | null> = {}, tracks: Record<string, Uint8Array | null> = {}) =>
    ({
      bytes: async (_album, name) => (name in tracks ? (tracks[name] ?? null) : aac(2)),
      image: async (_album, name) =>
        name in images ? (images[name] ?? null) : { width: 512, height: 512, hasAlpha: false, format: 'jpeg' },
    }) satisfies FileReader;

  it('accepts a minimal, correct album', async () => {
    expect((await validateAlbums([album()], fake())).problems).toEqual([]);
  });

  it('refuses an empty or overfull shelf, bad or repeated ids and too many tracks', async () => {
    expect((await validateAlbums([], fake())).problems.join()).toMatch(/0 albums/);
    const thirteen = Array.from({ length: 13 }, (_, i) => album({ id: `album-${i}` }));
    expect((await validateAlbums(thirteen, fake())).problems.join()).toMatch(/13 albums/);
    const report = await validateAlbums([album({ id: 'Bad Id' }), album(), album()], fake());
    expect(report.problems.join('\n')).toMatch(/kebab-case[\s\S]*used twice/);
    const long = album({ tracks: Array.from({ length: 21 }, () => track) });
    expect((await validateAlbums([long], fake())).problems.join()).toMatch(/21 tracks/);
  });

  it('asks for a quieter gain only', async () => {
    expect((await validateAlbums([album({ gainDb: 2 })], fake())).problems.join()).toMatch(/gainDb/);
    expect((await validateAlbums([album({ gainDb: -3 })], fake())).problems).toEqual([]);
  });

  it('checks the cover and the disc print', async () => {
    const wide = fake({ 'cover.jpg': { width: 600, height: 512, hasAlpha: false, format: 'jpeg' } });
    expect((await validateAlbums([album()], wide)).problems.join()).toMatch(/square/);
    const opaque = fake({ 'disc.png': { width: 512, height: 512, hasAlpha: false, format: 'png' } });
    expect((await validateAlbums([album({ disc: 'disc.png' })], opaque)).problems.join()).toMatch(/transparency/);
    expect((await validateAlbums([album()], fake({ 'cover.jpg': null }))).problems.join()).toMatch(/missing/);
    expect((await validateAlbums([album({ cover: 'https://cdn.example/c.jpg' })], fake({}))).problems).toEqual([]);
  });

  it('prints the right length for a track whose seconds are off', async () => {
    const report = await validateAlbums([album({ tracks: [{ ...track, seconds: 3 }] })], fake());
    expect(report.corrections).toEqual([{ album: 'a-b', track: 1, title: 'One', declared: 3, seconds: 2 }]);
    expect(report.problems.join()).toMatch(/seconds is 3, the file is 2/);
  });

  it('refuses files that are missing, cannot stream, or are another codec', async () => {
    const missing = await validateAlbums([album()], fake({}, { '01-one.m4a': null }));
    expect(missing.problems.join()).toMatch(/missing/);
    const late = await validateAlbums([album()], fake({}, { '01-one.m4a': aac(2, 'mdat-first') }));
    expect(late.problems.join()).toMatch(/cannot stream/);
    const flac = await validateAlbums([album({ tracks: [{ ...track, file: '01.flac' }] })], fake());
    expect(flac.problems.join()).toMatch(/\.m4a \(AAC\) or \.mp3/);
  });

  it('caps the bitrate and the placeholders’ size', async () => {
    const heavy = await validateAlbums([album()], fake({}, { '01-one.m4a': aac(2, 'moov-first', 100_000) }));
    expect(heavy.problems.join()).toMatch(/kb\/s/);
    const big = Array.from({ length: 12 }, (_, i) =>
      album({ id: `big-${i}`, placeholder: true, tracks: [{ ...track, seconds: 200 }] }),
    );
    const report = await validateAlbums(big, fake({}, { '01-one.m4a': aac(200, 'moov-first', 6_000_000) }));
    expect(report.problems.join()).toMatch(/placeholder audio/);
    expect(report.problems.join()).toMatch(/a track may take 5 MB/);
    expect(report.problems.join()).toMatch(/the shelf's audio takes/);
  });
});

/** A tiny AAC-LC .m4a: ftyp, a movie of `seconds`, and `payload` bytes of media data. */
function aac(seconds: number, order: 'moov-first' | 'mdat-first' = 'moov-first', payload = 64): Uint8Array {
  const box = (type: string, ...parts: Uint8Array[]): Uint8Array => {
    const body = concat(...parts);
    const out = new Uint8Array(8 + body.length);
    new DataView(out.buffer).setUint32(0, out.length);
    out.set(
      Uint8Array.from(type, (char) => char.charCodeAt(0)),
      4,
    );
    out.set(body, 8);
    return out;
  };
  const u32 = (value: number): Uint8Array => {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, value);
    return out;
  };
  const mvhd = box('mvhd', new Uint8Array(12), u32(1000), u32(seconds * 1000), new Uint8Array(80));
  const esds = box(
    'esds',
    new Uint8Array(4),
    Uint8Array.from([0x03, 22, 0, 1, 0, 0x04, 17, 0x40, 0x15, ...new Array(11).fill(0), 0x05, 2, 0x12, 0x10]),
  );
  const stsd = box('stsd', new Uint8Array(4), u32(1), box('mp4a', new Uint8Array(28), esds));
  const moov = box('moov', mvhd, box('trak', box('mdia', box('minf', box('stbl', stsd)))));
  const mdat = box('mdat', new Uint8Array(payload));
  const ftyp = box('ftyp', new Uint8Array(8));
  return order === 'moov-first' ? concat(ftyp, moov, mdat) : concat(ftyp, mdat, moov);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
