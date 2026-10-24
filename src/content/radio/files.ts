import type { Album } from './types';

/**
 * Every file in the albums' folders, as the URL the build gives it (fingerprinted, so a
 * new cover or mix is never served stale). Vite only: `pnpm verify:radio` reads the
 * folders directly instead. Only URLs are bundled; the files themselves are fetched on
 * demand.
 */
const FILES = import.meta.glob<string>('./albums/**/*.{m4a,mp3,webp,jpg,jpeg,png}', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** Absolute `https:` URLs are hosted elsewhere; everything else is a file in the album's folder. */
export function isRemote(name: string): boolean {
  return /^https:\/\//i.test(name);
}

/**
 * The URL to fetch `name` from: a file in `album`'s folder, or an `https:` URL as given.
 * A missing file throws in development (albums.test.ts proves there is none); a build
 * that somehow lacks one gets a URL that fails like any lost track, and the player
 * moves on.
 */
export function resolveFile(album: Pick<Album, 'id'>, name: string): string {
  if (isRemote(name)) return name;
  const path = `./albums/${album.id}/${name}`;
  const url = FILES[path];
  if (url !== undefined) return url;
  if (import.meta.env.DEV) throw new Error(`src/content/radio/albums/${album.id}/${name} does not exist`);
  return path;
}
