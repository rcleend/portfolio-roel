import { describe, expect, it } from 'vitest';
import { conceal, type Event, LAYOUTS, pick, sweep } from './storyboardSweep';

/**
 * The storyboard sweep, densely, for the shipped shelf of five discs: where the leave, the swap and a change of mind
 * meet, the moment matters to within a frame or two, so each is swept over its whole window rather than at a few
 * offsets (choreography.contact.test.ts covers every count at those).
 */

const COUNT = 5;
/** A leave this far into a pick: up to the swapped disc seated and the old one home, every LEAVE_STEP_MS. */
const LEAVE_WINDOW_MS = 1400;
const LEAVE_STEP_MS = 20;

type Scenario = { name: string; events: Event[]; from: number; to: number };

function leaves(): Scenario[] {
  const list: Scenario[] = [];
  for (let after = 0; after <= LEAVE_WINDOW_MS; after += LEAVE_STEP_MS) {
    for (const [first, second] of [
      [0, 4],
      [1, 3],
      [3, 1],
    ] as const) {
      const leave = 7000 + after;
      list.push({
        name: `the leave ${after} ms into a swap ${first} → ${second}`,
        events: [pick(4500, () => first), pick(7000, () => second), conceal(leave)],
        from: leave,
        to: leave + 2200,
      });
    }
    for (const disc of [0, 4]) {
      const leave = 4500 + after;
      list.push({
        name: `the leave ${after} ms into an insert of ${disc}`,
        events: [pick(4500, () => disc), conceal(leave)],
        from: leave,
        to: leave + 2200,
      });
    }
  }
  return list;
}

/** A, then B, then A again while A is still on its way home: a keyboard can pick a disc that is leaving the player. */
function changesOfMind(): Scenario[] {
  const list: Scenario[] = [];
  for (const [a, b] of [
    [0, 3],
    [3, 0],
    [1, 4],
    [4, 2],
  ] as const) {
    for (const playing of [700, 1500]) {
      for (let gap = 100; gap <= 1500; gap += 100) {
        const second = 4500 + playing;
        const third = second + gap;
        list.push({
          name: `${a} → ${b} after ${playing} ms → ${a} again ${gap} ms later`,
          events: [pick(4500, () => a), pick(second, () => b), pick(third, () => a)],
          from: second,
          to: third + 3500,
        });
      }
    }
  }
  return list;
}

/**
 * A, then B, then A again within a few frames, while B's drop is hurried to its contact so that A can go in (round
 * 4's fuzz seed 760285016: A 256 ms after landing, B 744 ms later, A 48 ms after that, at 844 × 390). B, called out
 * at once, must hold on the spindle from where its hurried drop ends; and A, B, A, B, A at a steady beat calls one
 * hurried drop out after another.
 */
function hurriedDrops(): Scenario[] {
  const list: Scenario[] = [];
  const landed = 1100;
  for (const [a, b] of [
    [2, 1],
    [0, 3],
    [4, 2],
  ] as const) {
    for (const playing of [600, 744, 900]) {
      for (let back = 16; back <= 112; back += 16) {
        const first = landed + 256;
        const second = first + playing;
        list.push({
          name: `${a} → ${b} after ${playing} ms → ${a} again ${back} ms later`,
          events: [pick(first, () => a), pick(second, () => b), pick(second + back, () => a)],
          from: first,
          to: second + back + 3500,
        });
      }
    }
    for (let beat = 150; beat <= 750; beat += 100) {
      list.push({
        name: `${a}, ${b}, ${a}, ${b}, ${a} every ${beat} ms`,
        events: [a, b, a, b, a].map((disc, k) => pick(4500 + k * beat, () => disc)),
        from: 4500,
        to: 4500 + 4 * beat + 3500,
      });
    }
  }
  return list;
}

/** Back at the radio with a disc in the player, and another picked as the shelf rises (keyboard focus lands then). */
function warmRisePicks(): Scenario[] {
  const list: Scenario[] = [];
  for (const [seated, next] of [
    [0, 1],
    [2, 1],
    [1, 4],
    [4, 0],
  ] as const) {
    for (let after = 0; after <= 600; after += 40) {
      const at = 9100 + after;
      list.push({
        name: `a warm arrival with ${seated} in the player, ${next} picked ${after} ms after landing`,
        events: [
          pick(3000, () => seated),
          conceal(5000),
          [8000, (c) => c.approach(8000, 8000)],
          [9100, (c) => c.reveal(9100)],
          pick(at, () => next),
        ],
        from: 9100,
        to: at + 3500,
      });
    }
  }
  return list;
}

const GROUPS: readonly (readonly [string, () => Scenario[]])[] = [
  ['leaves mid-pick', leaves],
  ['changes of mind', changesOfMind],
  ['hurried drops called out', hurriedDrops],
  ['picks during a warm rise', warmRisePicks],
];

describe(`the dense storyboard sweep, ${COUNT} discs`, () => {
  for (const layout of LAYOUTS) {
    for (const [group, scenarios] of GROUPS) {
      it(`keeps the discs apart through the ${group} at ${layout.width} × ${layout.height}`, () => {
        const contacts = scenarios().flatMap(({ name, events, from, to }) =>
          sweep(layout, COUNT, events, from, to).map((contact) => `${name}: ${contact}`),
        );
        expect(contacts.slice(0, 8)).toEqual([]);
      });
    }
  }
});
