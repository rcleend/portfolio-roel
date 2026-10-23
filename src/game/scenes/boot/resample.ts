import type { Gfx } from '@/engine/gfx/Gfx';
import type { Mask } from '../../art/logos/raster/Mask';

/** A horizontal run of set pixels in destination coordinates. */
export interface Span {
  readonly x: number;
  readonly y: number;
  readonly w: number;
}

/**
 * Nearest-neighbour resampling of `mask` into a `width × height` box, as
 * runs of set pixels. Each destination column and row picks one whole source
 * column and row, so a squeezed logo drops hairlines and looks condensed —
 * exactly how sprite-scaling hardware fakes a 3D spin — and it never blurs.
 */
export function resampleSpans(mask: Mask, width: number, height: number, mirrored: boolean): Span[] {
  const spans: Span[] = [];
  const columns = Array.from({ length: width }, (_, i) => {
    const source = Math.floor(((i + 0.5) * mask.width) / width);
    return mirrored ? mask.width - 1 - source : source;
  });
  for (let y = 0; y < height; y++) {
    const sy = Math.floor(((y + 0.5) * mask.height) / height);
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const on = x < width && mask.has(columns[x] as number, sy);
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        spans.push({ x: start, y, w: x - start });
        start = -1;
      }
    }
  }
  return spans;
}

/**
 * Draws `mask` scaled about (cx, cy). Sizes round to whole pixels and never
 * collapse below one, so an edge-on logo still shows as a 1 px line.
 */
export function drawResampled(
  gfx: Gfx,
  mask: Mask,
  cx: number,
  cy: number,
  pose: { readonly scaleX: number; readonly scaleY: number; readonly mirrored: boolean },
  color: string,
): void {
  const width = Math.max(1, Math.round(mask.width * pose.scaleX));
  const height = Math.max(1, Math.round(mask.height * pose.scaleY));
  const left = Math.round(cx - width / 2);
  const top = Math.round(cy - height / 2);
  for (const span of resampleSpans(mask, width, height, pose.mirrored)) {
    gfx.fillRect(left + span.x, top + span.y, span.w, 1, color);
  }
}
