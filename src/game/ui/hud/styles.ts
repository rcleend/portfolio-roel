import type { TextStyle } from '@/engine/gfx/TextStyle';
import type { TextStyles } from '../../fonts';
import { palette } from '../../palette';
import { scoreFont } from './scoreFont';

/** Text styles that only the level uses: HUD numerals, speech bubbles, pops and banners. */
export interface LevelTextStyles {
  /** Big banded-orange numerals with an euro sign, like the Metal Slug timer. */
  readonly score: TextStyle;
  /** "+€99" above a customer who was just won over. */
  readonly mrrPop: TextStyle;
  /** Complaint lines inside a speech bubble: dark ink on the bubble's white. */
  readonly bubble: TextStyle;
  /** "POP!", "CHECKPOINT!" and other small world pops. */
  readonly pop: TextStyle;
  /** Small HUD labels in cream, e.g. the character name. */
  readonly hudLabel: TextStyle;
}

export function createLevelTextStyles(text: TextStyles): LevelTextStyles {
  return {
    score: {
      font: scoreFont,
      fill: ['#fff3a0', '#ffc83d', '#ff9a1f', '#f06414'],
      bands: 4,
      outline: '#1a0804',
      shadow: { color: '#1a0804', x: 1, y: 1 },
    },
    mrrPop: {
      font: scoreFont,
      fill: ['#ffffff', '#c8ffd8', '#3ddc84'],
      bands: 3,
      outline: '#0a2e18',
    },
    bubble: { font: text.body.font, fill: palette.ink },
    pop: { ...text.hud, fill: palette.white },
    hudLabel: { ...text.hud, fill: palette.cream },
  };
}
