import { createCanvas, paintCanvas } from './canvas';

/**
 * A picture stored in code: its size, its palette and every pixel as a palette index, in one string.
 *
 *     <width>x<height>,<colour>,<colour>,…;<pixels>
 *
 * A colour is `rrggbb`, or `rrggbbaa` where it is not opaque, in hex. The pixels run left to right, top to bottom, one
 * character each: the palette index as `pixelSymbol` spells it, followed, where the same colour runs on, by the
 * length of the run in decimal (`;120` is 120 pixels of the second colour). Digits are no symbols, so a run needs no
 * end mark. Long runs are counted so the string stays small in memory (a sprite sheet is mostly empty); everything
 * else is left for the transfer's own compression, which packs the plain indices better than a PNG's deflate does.
 *
 * `scripts/build-art.ts` writes these as `*.art.ts` modules (docs/ARCHITECTURE.md › Art in code).
 */
export type PixelData = string;

/** How many colours a picture can have: one for each symbol. */
export const PIXEL_COLOURS = 68;

/**
 * The character of palette index `index`: the ASCII characters from `:` to `~` in order, without the backslash, so
 * the string needs no escapes and holds no digit, quote, comma or space.
 */
export function pixelSymbol(index: number): string {
  return String.fromCharCode(index + (index < 34 ? 58 : 59));
}

export interface DecodedPixels {
  readonly width: number;
  readonly height: number;
  /** Straight (not premultiplied) RGBA, as `ImageData` holds it. */
  readonly rgba: Uint8ClampedArray<ArrayBuffer>;
}

/** The picture's size, read from its header alone. */
export function pixelDataSize(data: PixelData): { readonly width: number; readonly height: number } {
  const [width, height] = data.slice(0, data.indexOf(',')).split('x').map(Number);
  if (!width || !height) throw new Error('Pixel data: no size');
  return { width, height };
}

/**
 * Every pixel of `data` as RGBA. Throws on data that names a colour its palette does not have or does not fill its
 * picture exactly; what is in the palette is the writer's to get right (scripts/art/encodePixelData.ts).
 */
export function decodePixelData(data: PixelData): DecodedPixels {
  const { width, height } = pixelDataSize(data);
  const start = data.indexOf(';') + 1;
  const colours = data
    .slice(0, start - 1)
    .split(',')
    .slice(1);

  // Colours as the four bytes a pixel takes in memory, so a pixel is one 32-bit store whatever the byte order.
  const paletteBytes = new Uint8Array(colours.length * 4);
  colours.forEach((hex, index) => {
    // `rrggbb` is opaque; parsed in two halves, as a whole `rrggbbaa` would not fit a 32-bit shift.
    paletteBytes[index * 4 + 3] = 255;
    for (let byte = 0; byte * 2 < hex.length; byte++) {
      paletteBytes[index * 4 + byte] = Number.parseInt(hex.slice(byte * 2, byte * 2 + 2), 16);
    }
  });
  const palette = new Uint32Array(paletteBytes.buffer);

  const rgba = new Uint8ClampedArray(width * height * 4);
  const pixels = new Uint32Array(rgba.buffer);
  const end = data.length;
  let at = 0;
  let i = start;
  while (i < end) {
    let code = data.charCodeAt(i);
    const index = code - (code > 92 ? 59 : 58);
    // Past the end of the picture too: a store there would be dropped, and the count below would not tell.
    if (index < 0 || index >= colours.length || at >= pixels.length) break;
    const colour = palette[index] as number;
    code = data.charCodeAt(++i);
    if (code >= 48 && code <= 57) {
      let run = 0;
      do {
        run = run * 10 + code - 48;
        code = data.charCodeAt(++i);
      } while (code >= 48 && code <= 57);
      // A fresh buffer is transparent black already, which is what most long runs are.
      if (colour !== 0) pixels.fill(colour, at, at + run);
      at += run;
    } else {
      pixels[at++] = colour;
    }
  }
  if (i !== end || at !== pixels.length) throw new Error(`Pixel data: bad pixels at ${i}`);
  return { width, height, rgba };
}

/**
 * `data` drawn on a canvas of its size, ready to draw from. Painted through `paintCanvas`, so a canvas a GPU reset
 * hands back blank is decoded again from the string, which the module that holds it keeps anyway.
 */
export function pixelDataCanvas(data: PixelData): HTMLCanvasElement {
  const { width, height } = pixelDataSize(data);
  const canvas = createCanvas(width, height);
  paintCanvas(canvas, (ctx) => {
    const decoded = decodePixelData(data);
    ctx.putImageData(new ImageData(decoded.rgba, decoded.width, decoded.height), 0, 0);
  });
  return canvas;
}
