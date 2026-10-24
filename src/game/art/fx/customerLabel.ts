import { type CustomerLabels, customerLabels } from '@/content';
import type { BitmapFont } from '@/engine/gfx/BitmapFont';
import { context2d, createCanvas } from '@/engine/gfx/canvas';
import type { ImageDrawOptions } from '@/engine/gfx/Gfx';
import { drawText, type TextStyle, textInk } from '@/engine/gfx/TextStyle';
import type { Rect } from '@/engine/math/Rect';
import { palette } from '../../palette';

/** What a customer's label is drawn from: each kind, and the flash the happy one pops in with. */
export type LabelPicture = keyof CustomerLabels | 'flash';

/** The box a picture paints, its ink outline included. */
export interface LabelSize {
  readonly width: number;
  readonly height: number;
}

export interface LabelBitmap extends LabelSize {
  readonly image: HTMLCanvasElement;
  /** Prepared once, so copying the picture allocates nothing. */
  readonly draw: ImageDrawOptions;
}

/** A font's label pictures: sized at once, painted on first use. */
export interface CustomerLabelArt {
  /** Measured from the font without a canvas, so labels can be laid out anywhere. */
  readonly sizes: Readonly<Record<LabelPicture, LabelSize>>;
  /** Painted once, on the first call: painting needs a canvas, so never at import time. */
  bitmaps(): Readonly<Record<LabelPicture, LabelBitmap>>;
}

/**
 * Letters outlined in ink, the game's lettering on a busy stage like the
 * HUD's, so every letter keeps the same contrast against its outline on
 * any street or sky. The unhappy scarlet is the frustration meter's, the
 * happy green the +MRR pop's; the flash is the happy label lit white for
 * the beat the customer is won over.
 */
const FILL: Readonly<Record<LabelPicture, string>> = {
  unhappy: palette.scarlet,
  happy: palette.green,
  flash: palette.white,
};

const TEXT: Readonly<Record<LabelPicture, string>> = {
  unhappy: customerLabels.unhappy,
  happy: customerLabels.happy,
  flash: customerLabels.happy,
};

/** How a picture is lettered in `font`. */
export function labelStyle(font: BitmapFont, picture: LabelPicture): TextStyle {
  return { font, fill: FILL[picture], outline: palette.ink };
}

const arts = new WeakMap<BitmapFont, CustomerLabelArt>();

/** The label pictures lettered in `font` (the game's small face), built once per font. */
export function customerLabelArt(font: BitmapFont): CustomerLabelArt {
  let art = arts.get(font);
  if (art === undefined) {
    art = buildArt(font);
    arts.set(font, art);
  }
  return art;
}

function buildArt(font: BitmapFont): CustomerLabelArt {
  const inks = byPicture((picture) => ink(font, picture));
  let bitmaps: Readonly<Record<LabelPicture, LabelBitmap>> | null = null;
  return {
    sizes: byPicture((picture): LabelSize => ({ width: inks[picture].w, height: inks[picture].h })),
    bitmaps: () => {
      bitmaps ??= byPicture((picture) => paint(font, picture, inks[picture]));
      return bitmaps;
    },
  };
}

/** The pixels a picture paints when lettered from (0, 0). */
function ink(font: BitmapFont, picture: LabelPicture): Rect {
  const box = textInk(labelStyle(font, picture), TEXT[picture], 0, 0);
  if (box === null) throw new Error(`the ${picture} customer label paints nothing in the ${font.name} face`);
  return box;
}

/** Letters a picture into a canvas cropped to its ink. */
function paint(font: BitmapFont, picture: LabelPicture, box: Rect): LabelBitmap {
  const image = createCanvas(box.w, box.h);
  drawText(context2d(image), labelStyle(font, picture), TEXT[picture], -box.x, -box.y);
  return { width: box.w, height: box.h, image, draw: { source: { x: 0, y: 0, w: box.w, h: box.h } } };
}

function byPicture<T>(build: (picture: LabelPicture) => T): Readonly<Record<LabelPicture, T>> {
  return { unhappy: build('unhappy'), happy: build('happy'), flash: build('flash') };
}
