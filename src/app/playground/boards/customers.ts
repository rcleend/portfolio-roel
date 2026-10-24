import { STEP_HZ } from '@/engine/core/FixedLoop';
import { CUSTOMER_CONCEPTS, type CustomerConceptId } from '@/game/art/looks/terraria/customer-concepts/concepts';
import type { LineupParams } from '@/game/scenes/params';
import type { Board } from './board';
import { LINEUP_BACKDROPS } from './roels';
import type { Picker, Picks, Subject } from './subject';
import type { Timeline } from './timeline';

type Backdrop = NonNullable<LineupParams['backdrop']>;

/** The customer the game ships, so it is today's pick, beside the Terraria concepts that may replace it. */
const CUSTOMER: Picker = {
  id: 'customer',
  label: 'Customer',
  choices: [
    { id: 'game', name: 'Classic', description: 'The Unhappy Customer as the game draws it today.' },
    ...CUSTOMER_CONCEPTS.map(({ id, name, description }) => ({ id, name, description })),
  ],
  current: 'game',
};

/** The concept `picks` choose, or `undefined` for the game's customer. */
function pickedConcept(picks: Picks): CustomerConceptId | undefined {
  return CUSTOMER_CONCEPTS.find((concept) => concept.id === picks[CUSTOMER.id])?.id;
}

/** The concepts are still frames; two seconds take the hero beside them through one blink. */
const STILL: Timeline = { frames: 2 * STEP_HZ, loops: true, beats: [] };

/** A customer shouting and won over on one backdrop, beside a Terraria hero and, for a concept, the game's customer. */
function customersSubject(backdrop: Backdrop, title: string): Subject {
  return {
    id: `customers-${backdrop}`,
    label: `Customers · ${title}`,
    pickers: [CUSTOMER],
    timeline: STILL,
    show: (picks) => ({
      spec: { scene: 'lineup', params: { cast: 'customers', customer: pickedConcept(picks) ?? 'game', backdrop } },
      looks: {},
    }),
  };
}

export const customersBoard: Board = {
  id: 'customers-terraria',
  title: 'Terraria customers',
  summary:
    'Three Terraria concepts for the Unhappy Customer, shouting and won over, each facing right and then left as the game mirrors it, beside a Terraria hero and the classic customer, on the select screen and on each stage.',
  rows: LINEUP_BACKDROPS.map(({ id, title }) => ({ subject: customersSubject(id, title), title })),
  compares: 'customer',
  shares: [],
};
