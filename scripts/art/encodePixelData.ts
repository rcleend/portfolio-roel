import { PIXEL_COLOURS, type PixelData, pixelSymbol } from '@/engine/gfx/PixelData';

/** Runs at least this long are written as a count; shorter ones as they are, which the transfer's compression packs better. */
const MIN_RUN = 8;

/**
 * 8-bit RGBA pixels as the string `decodePixelData` reads (src/engine/gfx/PixelData.ts): every pixel exactly, hidden
 * colour and alpha included. The palette is ordered by use, then by value, so the same picture always gives the same
 * string. Throws on a picture of more colours than there are symbols.
 */
export function encodePixelData(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): PixelData {
  if (rgba.length !== width * height * 4) throw new Error(`${rgba.length} bytes is not ${width}×${height} RGBA`);
  const colourAt = (pixel: number): number => {
    const at = pixel * 4;
    // Unsigned, as r, g, b, a from the top byte down.
    return (
      (((rgba[at] as number) << 24) |
        ((rgba[at + 1] as number) << 16) |
        ((rgba[at + 2] as number) << 8) |
        (rgba[at + 3] as number)) >>>
      0
    );
  };
  const uses = new Map<number, number>();
  for (let pixel = 0; pixel < width * height; pixel++) uses.set(colourAt(pixel), (uses.get(colourAt(pixel)) ?? 0) + 1);
  const colours = [...uses].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([colour]) => colour);
  if (colours.length > PIXEL_COLOURS) {
    throw new Error(`${colours.length} colours: pixel data holds ${PIXEL_COLOURS} at most`);
  }
  const symbols = new Map(colours.map((colour, index) => [colour, pixelSymbol(index)]));
  const hex = (colour: number): string => {
    const full = colour.toString(16).padStart(8, '0');
    return full.endsWith('ff') ? full.slice(0, 6) : full;
  };

  const parts: string[] = [];
  const total = width * height;
  for (let pixel = 0; pixel < total; ) {
    const colour = colourAt(pixel);
    let end = pixel + 1;
    while (end < total && colourAt(end) === colour) end++;
    const run = end - pixel;
    const symbol = symbols.get(colour) as string;
    parts.push(run >= MIN_RUN ? `${symbol}${run}` : symbol.repeat(run));
    pixel = end;
  }
  return `${width}x${height},${colours.map(hex).join(',')};${parts.join('')}`;
}
