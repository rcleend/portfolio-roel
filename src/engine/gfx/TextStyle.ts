import type { BitmapFont, Glyph } from './BitmapFont';
import { context2d, createCanvas } from './canvas';
import { bandColors, parseHex, type Rgba } from './color';
import { alignedX, type TextAlign, wrapText } from './textLayout';

/**
 * How a `BitmapFont` is painted: a solid or banded fill, an optional 1 px
 * outline and an optional drop shadow — the recipe behind arcade lettering
 * like "INSERT COIN".
 */
export interface TextStyle {
  readonly font: BitmapFont;
  /** A colour, or colour stops banded top → bottom across the font's ascent. */
  readonly fill: string | readonly string[];
  /** Number of flat bands when `fill` is a ramp. Defaults to one band per stop. */
  readonly bands?: number;
  /** 1 px outline around every glyph (8-connected, so corners stay square). */
  readonly outline?: string;
  /** Hard drop shadow of the outlined silhouette. */
  readonly shadow?: { readonly color: string; readonly x: number; readonly y: number };
  /** Extra pixels between wrapped lines, on top of the font's line height. */
  readonly lineSpacing?: number;
}

export interface TextOptions {
  /** How `x` anchors each line. Defaults to `left`. */
  readonly align?: TextAlign;
  /** Wrap at this width in pixels. Without it, only `\n` breaks lines. */
  readonly maxWidth?: number;
}

export interface TextBlock {
  readonly lines: readonly string[];
  /** Width of the widest line, decorations excluded. */
  readonly width: number;
  /** From the top of the first line's cell to the bottom of the last line's cell. */
  readonly height: number;
  readonly lineHeight: number;
}

/** Lays out text without drawing, e.g. to size a window around it. */
export function layoutText(style: TextStyle, text: string, options: TextOptions = {}): TextBlock {
  const { font } = style;
  const lines =
    options.maxWidth === undefined ? text.split('\n') : wrapText(text, options.maxWidth, (s) => font.measure(s));
  const lineHeight = font.lineHeight + (style.lineSpacing ?? 0);
  const width = Math.max(0, ...lines.map((line) => font.measure(line)));
  const height = lines.length === 0 ? 0 : (lines.length - 1) * lineHeight + font.cellHeight;
  return { lines, width, height, lineHeight };
}

/**
 * Draws text with the top-left of the first glyph cell at (x, y). Outline
 * and shadow extend outside that box. Returns the layout for chaining.
 */
export function drawText(
  ctx: CanvasRenderingContext2D,
  style: TextStyle,
  text: string,
  x: number,
  y: number,
  options: TextOptions = {},
): TextBlock {
  const block = layoutText(style, text, options);
  const atlas = styledAtlasFor(style);
  const align = options.align ?? 'left';
  // Draw layer by layer across the whole block so a glyph's outline never covers its neighbour's fill.
  for (const layer of LAYERS) {
    if (!atlas.hasLayer(layer)) continue;
    block.lines.forEach((line, index) => {
      let penX = alignedX(x, style.font.measure(line), align);
      const penY = y + index * block.lineHeight;
      for (const char of line) {
        const glyph = style.font.glyph(char);
        atlas.draw(ctx, layer, char, penX, penY);
        penX += glyph.advance;
      }
    });
  }
  return block;
}

type Layer = 'shadow' | 'outline' | 'fill';
const LAYERS: readonly Layer[] = ['shadow', 'outline', 'fill'];

interface GlyphSlot {
  readonly x: number;
  readonly width: number;
}

/**
 * Every glyph of one style pre-rendered into three layer rows. Styles are
 * cached by value, so inline variants like `{ ...style, fill: 'red' }` reuse
 * the atlas instead of rebuilding it every frame.
 */
class StyledAtlas {
  readonly #canvas: HTMLCanvasElement;
  readonly #slots = new Map<string, GlyphSlot>();
  readonly #pad: number;
  readonly #rowHeight: number;
  readonly #layers: ReadonlySet<Layer>;

  constructor(style: TextStyle) {
    const { font } = style;
    const shadow = style.shadow;
    const outline = style.outline ? 1 : 0;
    this.#pad = outline + (shadow ? Math.max(Math.abs(shadow.x), Math.abs(shadow.y)) : 0);
    this.#rowHeight = font.cellHeight + this.#pad * 2;
    this.#layers = new Set<Layer>([
      'fill',
      ...(style.outline ? (['outline'] as const) : []),
      ...(shadow ? (['shadow'] as const) : []),
    ]);

    let x = 0;
    for (const char of font.chars) {
      const width = font.glyph(char).width + this.#pad * 2;
      this.#slots.set(char, { x, width });
      x += width;
    }
    this.#canvas = createCanvas(Math.max(1, x), this.#rowHeight * LAYERS.length);
    const ctx = context2d(this.#canvas);
    const image = ctx.createImageData(this.#canvas.width, this.#canvas.height);
    const fillRows = fillRowColors(style);
    const outlineColor = style.outline ? parseHex(style.outline) : null;
    const shadowColor = shadow ? parseHex(shadow.color) : null;

    for (const char of font.chars) {
      const slot = this.#slots.get(char) as GlyphSlot;
      const glyph = font.glyph(char);
      const silhouette = outlineColor ? dilate(glyph, font.cellHeight) : (gx: number, gy: number) => ink(glyph, gx, gy);
      for (let row = -this.#pad; row < font.cellHeight + this.#pad; row++) {
        for (let col = -this.#pad; col < glyph.width + this.#pad; col++) {
          const px = slot.x + col + this.#pad;
          const py = row + this.#pad;
          if (ink(glyph, col, row)) put(image, px, py + this.#layerOffset('fill'), fillRows[row] as Rgba);
          if (outlineColor && silhouette(col, row)) put(image, px, py + this.#layerOffset('outline'), outlineColor);
          if (shadow && shadowColor && silhouette(col - shadow.x, row - shadow.y)) {
            put(image, px, py + this.#layerOffset('shadow'), shadowColor);
          }
        }
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  hasLayer(layer: Layer): boolean {
    return this.#layers.has(layer);
  }

  draw(ctx: CanvasRenderingContext2D, layer: Layer, char: string, x: number, y: number): void {
    const slot = this.#slots.get(char) ?? this.#slots.get('?');
    if (!slot) return;
    const sy = this.#layerOffset(layer);
    ctx.drawImage(
      this.#canvas,
      slot.x,
      sy,
      slot.width,
      this.#rowHeight,
      x - this.#pad,
      y - this.#pad,
      slot.width,
      this.#rowHeight,
    );
  }

  #layerOffset(layer: Layer): number {
    return LAYERS.indexOf(layer) * this.#rowHeight;
  }
}

const atlasCache = new Map<string, StyledAtlas>();
const fontIds = new WeakMap<BitmapFont, number>();
let nextFontId = 0;

function styledAtlasFor(style: TextStyle): StyledAtlas {
  let fontId = fontIds.get(style.font);
  if (fontId === undefined) {
    fontId = nextFontId++;
    fontIds.set(style.font, fontId);
  }
  const key = JSON.stringify([style.font.name, fontId, style.fill, style.bands, style.outline, style.shadow]);
  let atlas = atlasCache.get(key);
  if (!atlas) {
    atlas = new StyledAtlas(style);
    atlasCache.set(key, atlas);
  }
  return atlas;
}

/** Colour of each cell row: the ramp spans the ascent; descenders keep the last band. */
function fillRowColors(style: TextStyle): Rgba[] {
  const { font } = style;
  const stops = typeof style.fill === 'string' ? [style.fill] : style.fill;
  const bands = bandColors(stops, style.bands ?? stops.length).map(parseHex);
  return Array.from({ length: font.cellHeight }, (_, row) => {
    const band = Math.min(Math.floor((row * bands.length) / font.ascent), bands.length - 1);
    return bands[band] as Rgba;
  });
}

function ink(glyph: Glyph, x: number, y: number): boolean {
  if (x < 0 || x >= glyph.width || y < 0) return false;
  return glyph.bits[y * glyph.width + x] === 1;
}

function dilate(glyph: Glyph, cellHeight: number): (x: number, y: number) => boolean {
  return (x, y) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (y + dy < cellHeight && ink(glyph, x + dx, y + dy)) return true;
      }
    }
    return false;
  };
}

function put(image: ImageData, x: number, y: number, color: Rgba): void {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const offset = (y * image.width + x) * 4;
  image.data[offset] = color.r;
  image.data[offset + 1] = color.g;
  image.data[offset + 2] = color.b;
  image.data[offset + 3] = color.a;
}
