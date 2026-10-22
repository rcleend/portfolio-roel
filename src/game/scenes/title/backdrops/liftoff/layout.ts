import { rect } from '@/engine/math/Rect';
import { TITLE_LAYOUT } from '../../layout';

/**
 * Liftoff's stage, in screen pixels. The pad stands right under the scene's
 * impact point, so the ignition lands where every opening hit does, only
 * down at ground level, and the plume rises through the middle of the logo.
 */
export const STAGE = {
  width: TITLE_LAYOUT.screen.width,
  height: TITLE_LAYOUT.screen.height,
  /** The first row of ground; the warmest band of sky sits just above it, below the logo and the prompt. */
  horizon: 200,
  /** Where the rocket's engine meets the pad deck: the ignition point. */
  pad: { x: TITLE_LAYOUT.impact.x, y: 203 },
  /**
   * The Earth's shadow line. Below it the evening has fallen and the plume
   * is a dusky silhouette, which keeps "PRESS ANY BUTTON" crisp; above it
   * the plume still catches the set sun and glows behind the logo.
   */
  terminator: 150,
} as const;

/**
 * Where the scene's own lines sit, with a pixel or two to spare: the
 * arcade-face prompt (outline and shadow included) and the copyright.
 * Nothing static or busy goes behind them; only the plume's soft column
 * passes behind the prompt.
 */
export const KEEP_CLEAR = {
  prompt: rect(96, TITLE_LAYOUT.promptY - 2, 128, 16),
  copyright: rect(100, TITLE_LAYOUT.copyrightY - 2, 120, 14),
} as const;
