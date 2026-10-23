import type { PixelImage } from './canvas';
import type { Gfx } from './Gfx';

/** Border widths of a nine-slice source image, in pixels. */
export interface NineSliceInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface NineSlice {
  readonly image: PixelImage;
  readonly insets: NineSliceInsets;
}

/**
 * Draws a frame at any size by tiling (never stretching) its edges and centre,
 * so bevel and texture pixels stay 1:1 at every size.
 */
export function drawNineSlice(gfx: Gfx, slice: NineSlice, x: number, y: number, w: number, h: number): void {
  const { image, insets } = slice;
  const [left, right, top, bottom] = [insets.left, insets.right, insets.top, insets.bottom];
  const [x0, y0, ww, hh] = [Math.round(x), Math.round(y), Math.round(w), Math.round(h)];
  if (ww < left + right || hh < top + bottom) return;
  const srcMidW = image.width - left - right;
  const srcMidH = image.height - top - bottom;
  const dstMidW = ww - left - right;
  const dstMidH = hh - top - bottom;

  const columns: readonly [number, number, number, number][] = [
    [0, left, x0, left],
    [left, srcMidW, x0 + left, dstMidW],
    [image.width - right, right, x0 + ww - right, right],
  ];
  const rows: readonly [number, number, number, number][] = [
    [0, top, y0, top],
    [top, srcMidH, y0 + top, dstMidH],
    [image.height - bottom, bottom, y0 + hh - bottom, bottom],
  ];
  for (const [sy, sh, dy, dh] of rows) {
    for (const [sx, sw, dx, dw] of columns) tile(gfx, image, sx, sy, sw, sh, dx, dy, dw, dh);
  }
}

function tile(
  gfx: Gfx,
  image: PixelImage,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return;
  for (let y = 0; y < dh; y += sh) {
    for (let x = 0; x < dw; x += sw) {
      const w = Math.min(sw, dw - x);
      const h = Math.min(sh, dh - y);
      gfx.ctx.drawImage(image, sx, sy, w, h, dx + x, dy + y, w, h);
    }
  }
}
