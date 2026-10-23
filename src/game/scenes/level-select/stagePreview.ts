import type { LevelId } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import { drawParallax } from '@/engine/gfx/Parallax';
import type { Rect } from '@/engine/math/Rect';
import type { LevelArt } from '../../levels/art/LevelArt';

/**
 * Which slice of a stage a postcard shows. Postcards are a 1:1 crop of the
 * 320 × 240 stage (never scaled: a downsampled thumbnail would smear the hand
 * placed pixels), so each stage is framed on its landmark.
 */
export interface PreviewFraming {
  /** Top-left of the crop in stage pixels, at the start of the pan. */
  readonly cropX: number;
  readonly cropY: number;
  /** Camera travel in stage pixels; layers move by it times their parallax factor. */
  readonly pan: number;
  /** Seconds for one there-and-back sweep. */
  readonly period: number;
}

export const PREVIEW_FRAMING: Readonly<Record<LevelId, PreviewFraming>> = {
  luna: { cropX: 24, cropY: 58, pan: 640, period: 48 },
  scripe: { cropX: 230, cropY: 56, pan: 640, period: 48 },
};

/**
 * Camera x for the slow pan: an eased there-and-back sweep, so the preview
 * drifts like a postcard being looked over and never jumps at the loop.
 */
export function previewCamera(time: number, framing: PreviewFraming): number {
  const phase = (time / framing.period) * Math.PI * 2;
  return Math.round(((1 - Math.cos(phase)) / 2) * framing.pan);
}

/** Paints the stage's background planes, cropped into `frame`. Foreground planes are left out: they would cover the view. */
export function drawStagePreview(gfx: Gfx, art: LevelArt, frame: Rect, framing: PreviewFraming, time: number): void {
  gfx.withClip(frame.x, frame.y, frame.w, frame.h, () => {
    gfx.withOffset(frame.x - framing.cropX, frame.y - framing.cropY, () => {
      drawParallax(gfx, art.background, previewCamera(time, framing));
    });
  });
}
