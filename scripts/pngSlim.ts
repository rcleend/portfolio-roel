import sharp from 'sharp';
import type { Plugin } from 'vite';

/** An indexed PNG holds at most this many colours (one of them the transparent one). */
const PALETTE_SIZE = 256;

/**
 * Clears the colour of every fully transparent pixel of an 8-bit RGBA buffer, in place, so they all count as one
 * colour. Nothing on the page shows it: the game's art and the cursors are drawn through premultiplied 2D canvases
 * and CSS, where a transparent pixel has no colour.
 */
export function clearHiddenColour(rgba: Uint8Array): void {
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) {
      rgba[i] = 0;
      rgba[i + 1] = 0;
      rgba[i + 2] = 0;
    }
  }
}

/** How many different RGBA colours `rgba` holds, counting no further than `limit + 1`. */
export function countColours(rgba: Uint8Array, limit = PALETTE_SIZE): number {
  const colours = new Set<number>();
  const view = new DataView(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  for (let i = 0; i < rgba.length && colours.size <= limit; i += 4) colours.add(view.getUint32(i));
  return colours.size;
}

/** Same alpha everywhere and the same colour wherever a pixel shows. */
export function sameVisiblePixels(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] !== b[i + 3]) return false;
    if (a[i + 3] !== 0 && (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2])) return false;
  }
  return true;
}

async function rgbaOf(png: Uint8Array): Promise<{ data: Uint8Array; width: number; height: number } | null> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4 || data.length !== info.width * info.height * 4) return null;
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

/**
 * The same visible pixels in fewer bytes. Pixel art keeps to a few dozen colours, so an image of at most 256 (every
 * transparent pixel counting as one) is written as an indexed PNG, which holds each exactly; the result is decoded
 * again and kept only if every alpha and every visible colour came back unchanged and it is smaller. Anything else
 * (more colours, not plain 8-bit) is left as it is.
 */
export async function slimPng(png: Uint8Array): Promise<Uint8Array> {
  const image = await rgbaOf(png);
  if (!image) return png;
  clearHiddenColour(image.data);
  if (countColours(image.data) > PALETTE_SIZE) return png;
  const slim = new Uint8Array(
    await sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } })
      .png({ palette: true, colours: PALETTE_SIZE, quality: 100, dither: 0, compressionLevel: 9, effort: 10 })
      .toBuffer(),
  );
  if (slim.length >= png.length) return png;
  const back = await rgbaOf(slim);
  return back && sameVisiblePixels(image.data, back.data) ? slim : png;
}

/**
 * Slims every PNG the build emits (`slimPng`), so the committed art stays exactly what its generators write (their
 * `--check`s compare bytes) and only what visitors download changes. Build only: the dev server serves the sources.
 */
export function pngSlimPlugin(): Plugin {
  return {
    name: 'png-slim',
    apply: 'build',
    enforce: 'post',
    async generateBundle(_options, bundle) {
      await Promise.all(
        Object.values(bundle).map(async (file) => {
          if (file.type !== 'asset' || !file.fileName.endsWith('.png') || typeof file.source === 'string') return;
          file.source = await slimPng(file.source);
        }),
      );
    },
  };
}
