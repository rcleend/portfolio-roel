import { pixels } from '@/engine/gfx/PixelArt';
import { withRows } from '../../../compose';
import type { CustomerAnimation } from '../../contracts';
import { buildSheet, type PoseAnimation } from '../rig';

/**
 * The Unhappy Customer — the only enemy. Flushed red face, angry brows and a
 * shaking fist; when won over, the same sprite swaps to calm colours and a
 * smile. Built on the shared body rig so it moves like the heroes.
 */
const head = pixels(`
  ....oooooo....
  ..oossssssoo..
  .osssssssssso.
  ohhsssssssssso
  ohhsssosssssoo
  ohhssssosssoSo
  ohhSsssessseso
  ohhSssssssssSo
  .ohSssssssssso
  .ohSssssoooSso
  .ooSsssssssso.
  ...oSSssssoo..
  ....oooooo....
`);

const stars = (phase: number) =>
  pixels(
    [
      ['..y.......y..', '.yYy.....yYy.', '..y.......y..', '......y......', '.....yYy.....', '......y......'],
      ['......y......', '.....yYy.....', '......y......', '..y.......y..', '.yYy.....yYy.', '..y.......y..'],
    ][phase]?.join('\n') ?? '',
  );

/** Calm palette swap: flushed skin and the loud shirt become relaxed tones. */
const CALM = { s: 'n', S: 'N', c: 'k', C: 'K', l: 'L', t: 'u' } as const;

const POSES: Readonly<Record<CustomerAnimation, PoseAnimation>> = {
  walk: {
    fps: 6,
    loop: true,
    frames: [
      { legs: 'runA', front: 'punch', back: 'back', backAt: [-2, 0] },
      { legs: 'stand', front: 'punch', back: 'down', bodyY: 1, frontAt: [0, 1] },
      { legs: 'runC', front: 'punch', back: 'back', backAt: [-2, 0] },
      { legs: 'stand', front: 'punch', back: 'down', bodyY: 1, frontAt: [0, 1] },
    ],
  },
  shout: {
    fps: 8,
    loop: true,
    frames: [
      { legs: 'stand', front: 'raise', back: 'back', bodyX: 1, face: 'shout', frontAt: [5, -8], backAt: [-2, 0] },
      { legs: 'stand', front: 'raise', back: 'back', bodyX: 1, face: 'shout', frontAt: [5, -9], backAt: [-2, 0] },
      {
        legs: 'stand',
        front: 'raise',
        back: 'back',
        bodyX: 2,
        bodyY: 1,
        face: 'shout',
        frontAt: [5, -8],
        backAt: [-2, 0],
      },
    ],
  },
  hurt: {
    fps: 8,
    loop: false,
    frames: [
      {
        legs: 'stand',
        front: 'out',
        back: 'out',
        bodyX: -2,
        bodyY: 1,
        face: 'hurt',
        frontAt: [0, -2],
        backAt: [-6, -2],
      },
      { legs: 'stand', front: 'down', back: 'down', bodyX: -1, face: 'hurt' },
    ],
  },
  stunned: {
    fps: 6,
    loop: true,
    frames: [
      { legs: 'stand', front: 'down', back: 'down', bodyX: -1, face: 'blink', overlay: { rows: stars(0), x: 9, y: 2 } },
      { legs: 'stand', front: 'down', back: 'down', bodyX: 1, face: 'blink', overlay: { rows: stars(1), x: 9, y: 2 } },
    ],
  },
  happy: {
    fps: 5,
    loop: true,
    recolor: CALM,
    frames: [
      { legs: 'stand', front: 'raise', back: 'down', face: 'happy', frontAt: [5, -8] },
      { legs: 'stand', front: 'raise', back: 'down', y: -1, face: 'happy', frontAt: [5, -9] },
      { legs: 'stand', front: 'raise', back: 'down', face: 'happy', frontAt: [5, -8] },
      { legs: 'stand', front: 'down', back: 'down', bodyY: 1, face: 'happy' },
    ],
  },
};

export const unhappyCustomerSheet = buildSheet(
  {
    palette: {
      o: '#1a1014',
      s: '#ee7a5e',
      S: '#c24a3a',
      n: '#f0c29a',
      N: '#c48a64',
      h: '#a6a6b4',
      e: '#1a1014',
      c: '#f0a43a',
      C: '#c06a1c',
      l: '#ffd37a',
      k: '#8fd6b0',
      K: '#5aa684',
      L: '#c8f0da',
      t: '#c8352e',
      u: '#3f8fc8',
      p: '#4a4a5c',
      P: '#30303e',
      b: '#2e2018',
      B: '#160e0a',
      w: '#ffffff',
      M: '#4a1010',
      y: '#ffe14d',
      Y: '#ff9a1f',
    },
    heads: {
      normal: head,
      shout: withRows(head, { 8: '.ohSssssMMMMso', 9: '.ohSsssMwwwMso', 10: '.ooSssssMMMso.' }),
      hurt: withRows(head, { 6: 'ohhSssoSsssoso', 9: '.ohSsssssMMSso' }),
      blink: withRows(head, { 4: 'ohhsssssssssso', 5: 'ohhsssssssssSo', 6: 'ohhSssoossooso', 9: '.ohSssssssooSo' }),
      happy: withRows(head, {
        4: 'ohhsssssssssso',
        5: 'ohhsssossssoso',
        6: 'ohhSssosssosso',
        8: '.ohSssssssssso',
        9: '.ohSssosssosso',
        10: '.ooSsssooooso.',
      }),
    },
    torso: pixels(`
      .oooooooo.
      occcwwccco
      occcctccco
      oCccctccco
      oCcccttcco
      oCcccccclo
      oCccccccco
      obbbbbbbbo
      oCccccccco
      .oooooooo.
    `),
  },
  POSES,
);
