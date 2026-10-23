import { context2d, createCanvas } from './canvas';
import { isHexColor, parseHex } from './color';

/**
 * Sprites are authored as text: each frame is `size.h` strings of exactly
 * `size.w` characters, each character a palette key. This keeps art
 * reviewable in diffs and lets code generate frames procedurally.
 */
export interface PixelArtSheet<A extends string = string> {
  /** One-character key → `#rrggbb` or `#rrggbbaa`. `.` is reserved for transparent. */
  readonly palette: Readonly<Record<string, string>>;
  readonly size: { readonly w: number; readonly h: number };
  /** Anchor in frame pixels; defaults to bottom-centre so sprites stand on `y`. */
  readonly origin?: { readonly x: number; readonly y: number };
  readonly animations: Readonly<Record<A, PixelArtAnimation>>;
}

export interface PixelArtAnimation {
  readonly fps: number;
  readonly loop: boolean;
  readonly frames: readonly (readonly string[])[];
}

export const TRANSPARENT_KEY = '.';

/**
 * Turns a template literal into frame rows, trimming indentation and blank
 * lines. Lets art be written as readable blocks that formatters leave alone:
 *
 *     pixels(`
 *       .kk.
 *       kwwk
 *     `)
 */
export function pixels(source: string): string[] {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export class PixelArtError extends Error {
  override readonly name = 'PixelArtError';
}

/**
 * Checks a sheet against the authoring contract and throws a `PixelArtError`
 * that pinpoints the offending animation, frame, row and column.
 */
export function validatePixelArt(sheet: PixelArtSheet, sheetName: string): void {
  const fail = (message: string): never => {
    throw new PixelArtError(`PixelArt "${sheetName}": ${message}`);
  };
  const { w, h } = sheet.size;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) {
    fail(`size must be positive integers, got ${w}×${h}`);
  }
  for (const [key, color] of Object.entries(sheet.palette)) {
    if ([...key].length !== 1) fail(`palette key "${key}" must be exactly one character`);
    if (key === TRANSPARENT_KEY) fail(`palette key "${TRANSPARENT_KEY}" is reserved for transparency`);
    if (!isHexColor(color) || color.length === 4)
      fail(`palette "${key}" has invalid colour "${color}" (use #rrggbb or #rrggbbaa)`);
  }
  if (sheet.origin) {
    const { x, y } = sheet.origin;
    if (!Number.isInteger(x) || !Number.isInteger(y)) fail(`origin must be integers, got (${x}, ${y})`);
  }
  const names = Object.keys(sheet.animations);
  if (names.length === 0) fail('sheet has no animations');
  for (const name of names) {
    const animation = (sheet.animations as Record<string, PixelArtAnimation>)[name] as PixelArtAnimation;
    if (!(animation.fps > 0)) fail(`animation "${name}" needs fps > 0, got ${animation.fps}`);
    if (animation.frames.length === 0) fail(`animation "${name}" has no frames`);
    animation.frames.forEach((frame, frameIndex) => {
      const where = `animation "${name}" frame ${frameIndex}`;
      if (frame.length !== h) fail(`${where} has ${frame.length} rows, expected ${h}`);
      frame.forEach((row, rowIndex) => {
        const chars = [...row];
        if (chars.length !== w)
          fail(`${where} row ${rowIndex} has ${chars.length} characters, expected ${w}: "${row}"`);
        chars.forEach((char, column) => {
          if (char !== TRANSPARENT_KEY && !(char in sheet.palette)) {
            fail(`${where} row ${rowIndex} column ${column} uses "${char}", which is not in the palette`);
          }
        });
      });
    });
  }
}

/** Where one frame lives inside a compiled atlas. */
export interface AtlasFrame {
  readonly x: number;
  readonly y: number;
}

export interface CompiledAnimation {
  readonly fps: number;
  readonly loop: boolean;
  readonly frames: readonly AtlasFrame[];
}

export interface CompiledPixelArt<A extends string = string> {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly origin: { readonly x: number; readonly y: number };
  /** One row per animation, frames left to right. */
  readonly atlas: HTMLCanvasElement;
  readonly animations: Readonly<Record<A, CompiledAnimation>>;
}

/** Validates a sheet and rasterises every frame into a single atlas canvas. */
export function compilePixelArt<A extends string>(sheet: PixelArtSheet<A>, name: string): CompiledPixelArt<A> {
  validatePixelArt(sheet, name);
  const { w, h } = sheet.size;
  const entries = Object.entries(sheet.animations) as [A, PixelArtAnimation][];
  const columns = Math.max(...entries.map(([, animation]) => animation.frames.length));
  const atlas = createCanvas(columns * w, entries.length * h);
  const ctx = context2d(atlas);
  const image = ctx.createImageData(atlas.width, atlas.height);
  const colors = new Map(Object.entries(sheet.palette).map(([key, hex]) => [key, parseHex(hex)]));

  const animations = {} as Record<A, CompiledAnimation>;
  entries.forEach(([animationName, animation], rowIndex) => {
    const frames = animation.frames.map((frame, frameIndex) => {
      const originX = frameIndex * w;
      const originY = rowIndex * h;
      frame.forEach((row, y) => {
        [...row].forEach((char, x) => {
          const color = colors.get(char);
          if (!color) return;
          const offset = ((originY + y) * atlas.width + originX + x) * 4;
          image.data[offset] = color.r;
          image.data[offset + 1] = color.g;
          image.data[offset + 2] = color.b;
          image.data[offset + 3] = color.a;
        });
      });
      return { x: originX, y: originY };
    });
    animations[animationName] = { fps: animation.fps, loop: animation.loop, frames };
  });
  ctx.putImageData(image, 0, 0);

  return {
    name,
    width: w,
    height: h,
    origin: sheet.origin ?? { x: Math.floor(w / 2), y: h },
    atlas,
    animations,
  };
}
