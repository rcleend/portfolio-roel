import type { TextStyle } from '@/engine/gfx/TextStyle';
import type { TextStyles } from '../../fonts';
import { palette } from '../../palette';
import { bannerFont } from './bannerFont';
import { cardFont } from './cardFont';
import { metricFont } from './metricFont';
import { scoreFont } from './scoreFont';

/** Text styles that only the level uses: HUD numerals, banners, speech bubbles and pops. */
export interface LevelTextStyles {
  /** Big banded-orange numerals with an euro sign, like the Metal Slug timer. */
  readonly score: TextStyle;
  /** "+€99" above a customer who was just won over. */
  readonly mrrPop: TextStyle;
  /** The big headline number on a highlight card. */
  readonly metric: TextStyle;
  /** Announcer banners in the title's molten orange: "MISSION 1", "ACQUIRED!". */
  readonly banner: TextStyle;
  /** Announcer banners in the prompt's white-to-lavender: "START!". */
  readonly bannerCool: TextStyle;
  /** Announcer banners in alarm red: "ESCALATED!". */
  readonly bannerAlarm: TextStyle;
  /** Complaint lines inside a speech bubble. */
  readonly bubble: TextStyle;
  /** Highlight descriptions on the achievement card. */
  readonly cardBody: TextStyle;
  /** "POP!", "CHECKPOINT!" and other small world pops. */
  readonly pop: TextStyle;
}

const SHADOW_INK = '#1a0804';

export function createLevelTextStyles(text: TextStyles): LevelTextStyles {
  return {
    score: {
      font: scoreFont,
      fill: ['#fff3a0', '#ffc83d', '#ff9a1f', '#f06414'],
      bands: 4,
      outline: SHADOW_INK,
      shadow: { color: SHADOW_INK, x: 1, y: 1 },
    },
    mrrPop: {
      font: scoreFont,
      fill: ['#ffffff', '#c8ffd8', '#3ddc84'],
      bands: 3,
      outline: '#0a2e18',
    },
    metric: {
      font: metricFont,
      fill: ['#ffffff', '#c8ffd8', '#7dff9a', '#3ddc84'],
      bands: 4,
      outline: '#0a2e18',
      shadow: { color: '#0a2e18', x: 1, y: 2 },
    },
    banner: {
      font: bannerFont,
      fill: ['#fff3a0', '#ffc83d', '#ff9a1f', '#f06414', '#c83a10'],
      bands: 5,
      outline: SHADOW_INK,
      shadow: { color: '#5a1408', x: 2, y: 2 },
    },
    bannerCool: {
      font: bannerFont,
      fill: ['#ffffff', '#ffffff', '#e4defc', '#c4b8f5', '#a596e8'],
      bands: 5,
      outline: '#141048',
      shadow: { color: '#141048', x: 2, y: 2 },
    },
    bannerAlarm: {
      font: bannerFont,
      fill: ['#ffffff', '#ffb0a0', '#ff5a3a', '#e2352d', '#9e1c1c'],
      bands: 5,
      outline: SHADOW_INK,
      shadow: { color: '#3a0808', x: 2, y: 2 },
    },
    bubble: { font: cardFont, fill: '#3a0a18' },
    cardBody: { ...text.body, font: cardFont },
    pop: { ...text.hud, fill: palette.white },
  };
}
