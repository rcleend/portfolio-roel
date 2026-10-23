import { levels } from '@/content';
import { STEP_HZ } from '@/engine/core/FixedLoop';
import type { LineupParams } from '@/game/scenes/params';
import type { Board } from './board';
import { chosen, type Picker, type Subject } from './subject';
import type { Timeline } from './timeline';

type Backdrop = NonNullable<LineupParams['backdrop']>;

/** What the lineup stands on: the select screen's blueprint paper, where a hero is picked, and every stage. */
const BACKDROPS: readonly { readonly id: Backdrop; readonly title: string }[] = [
  { id: 'menu', title: 'MENU BLUEPRINT' },
  ...levels.map((level) => ({ id: level.id, title: level.city })),
];

/** The cast the game ships, so it is today's pick, beside the designs that may replace it. */
const CAST: Picker = {
  id: 'cast',
  label: 'Cast',
  choices: [
    { id: 'game', name: 'Classic', description: 'The three heroes as the game draws them today.' },
    {
      id: 'terraria',
      name: 'Terraria',
      description: 'The default designs, both cap colourways, a classic hero beside them for scale.',
    },
  ],
  current: 'game',
};

/** The lineup never moves; a second's loop gives the transport something to scrub. */
const STILL: Timeline = { frames: STEP_HZ, loops: true, beats: [] };

/** The lineup on one backdrop, either cast. */
function lineupSubject(backdrop: Backdrop, title: string): Subject {
  return {
    id: `lineup-${backdrop}`,
    label: `Lineup · ${title}`,
    pickers: [CAST],
    timeline: STILL,
    show: (picks) => ({
      spec: {
        scene: 'lineup',
        params: { cast: chosen(CAST, picks).id === 'terraria' ? 'terraria' : 'game', backdrop },
      },
      looks: {},
    }),
  };
}

export const roelsBoard: Board = {
  id: 'roels',
  title: 'Terraria Roels',
  summary: 'The default designs standing still next to the classic heroes, on the select screen and on each stage.',
  rows: BACKDROPS.map(({ id, title }) => ({ subject: lineupSubject(id, title), title })),
  compares: 'cast',
  shares: [],
};
