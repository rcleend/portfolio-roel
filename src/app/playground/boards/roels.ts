import { levels } from '@/content';
import { STEP_HZ } from '@/engine/core/FixedLoop';
import type { LineupParams } from '@/game/scenes/params';
import type { Board } from './board';
import { type Choice, chosen, type Picker, type Subject } from './subject';
import type { Timeline } from './timeline';

type Backdrop = NonNullable<LineupParams['backdrop']>;
type Cast = NonNullable<LineupParams['cast']>;

/** What the lineup stands on: the select screen's blueprint paper, where a hero is picked, and every stage. */
const BACKDROPS: readonly { readonly id: Backdrop; readonly title: string }[] = [
  { id: 'menu', title: 'MENU BLUEPRINT' },
  ...levels.map((level) => ({ id: level.id, title: level.city })),
];

/**
 * The cast the game ships, so it is today's pick, beside the Terraria designs that may replace it: the look's
 * as they are, and the revision drawn to compare with them. The look's are named "before" rather than
 * "current", which the board already says of the game's pick. Each choice's id is the lineup's cast.
 */
const CASTS: readonly (Choice & { readonly id: Cast })[] = [
  { id: 'game', name: 'Classic', description: 'The three heroes as the game draws them today.' },
  {
    id: 'terraria',
    name: 'Terraria · before',
    description: 'The Terraria designs as they are before the revision, with a classic hero beside them for scale.',
  },
  {
    id: 'revised',
    name: 'Terraria · revised',
    description: 'Swept hair, cleaner glasses and a cap with one spot, then the ENGINEER with his hood up.',
  },
];

const CAST: Picker = { id: 'cast', label: 'Cast', choices: CASTS, current: 'game' };

/** The lineup only idles: two seconds take the Terraria designs through one blink. */
const IDLE: Timeline = { frames: 2 * STEP_HZ, loops: true, beats: [] };

/** The lineup on one backdrop, any cast. */
function lineupSubject(backdrop: Backdrop, title: string): Subject {
  return {
    id: `lineup-${backdrop}`,
    label: `Lineup · ${title}`,
    pickers: [CAST],
    timeline: IDLE,
    show: (picks) => ({
      spec: {
        scene: 'lineup',
        params: { cast: CASTS.find((cast) => cast.id === chosen(CAST, picks).id)?.id ?? 'game', backdrop },
      },
      looks: {},
    }),
  };
}

export const roelsBoard: Board = {
  id: 'roels',
  title: 'Terraria Roels',
  summary:
    'The Terraria designs and their revision idling next to the classic heroes, on the select screen and on each stage.',
  rows: BACKDROPS.map(({ id, title }) => ({ subject: lineupSubject(id, title), title })),
  compares: 'cast',
  shares: [],
};
