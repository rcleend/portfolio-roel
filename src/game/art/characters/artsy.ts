import { pixels } from '@/engine/gfx/PixelArt';
import { withRows } from '../compose';
import { buildCharacterSheet } from './rig';

/** ARTSY — red beret, sunny scarf, paint-flecked teal shirt and a white electric guitar slung on the back. */
const head = pixels(`
  ....oooooo....
  ..oorrrrrroo..
  .orrrrrrrrrRo.
  .oRRRRRRRRRRRo
  ohhhhhhhhhhhoo
  ohhhhhssssssso
  ohhhhssessseso
  ohhhhssessseso
  ohhhSssssssSso
  .ohhSssssmmsso
  .oohSssssssso.
  ..oyyyyyyyyo..
  ..oyYyyYyyyo..
`);

export const artsySheet = buildCharacterSheet({
  palette: {
    o: '#1a0f1e',
    s: '#f3c7a1',
    S: '#cf9472',
    h: '#5b3420',
    e: '#1a0f1e',
    r: '#e2352d',
    R: '#a51f2a',
    y: '#ffc83d',
    Y: '#ff7a1a',
    c: '#1fb5a6',
    C: '#137a75',
    l: '#6fe3d3',
    q: '#ff5fa2',
    p: '#2a3f8f',
    P: '#1b2a63',
    b: '#e2352d',
    B: '#7a1520',
    w: '#f4f4f8',
    W: '#b9bccb',
    n: '#c98b4a',
    k: '#3b2a22',
    m: '#a8463a',
    M: '#4a1410',
  },
  heads: {
    normal: head,
    blink: withRows(head, { 6: 'ohhhhsssssssso', 7: 'ohhhhsseSsseso' }),
    focus: withRows(head, { 9: '.ohhSssssmmmso' }),
    happy: withRows(head, { 6: 'ohhhhssessseso', 7: 'ohhhhsssssssso', 9: '.ohhSssmsssmso', 10: '.oohSsssmmmso.' }),
    hurt: withRows(head, { 6: 'ohhhhsseSsseSo', 7: 'ohhhhssSessSeo', 9: '.ohhSsssMMsso.', 10: '.oohSsssMMsso.' }),
  },
  torso: pixels(`
    .oyyyyyyo.
    occcyYccco
    occcyycqco
    oCcccyYcco
    oCcqcyycco
    oCccccYcco
    oCccccccqo
    oCcccqccco
    oCCCCCCCCo
    .oooooooo.
  `),
  backProp: {
    x: -5,
    y: -11,
    rows: pixels(`
      oo......
      owo.....
      onno....
      .onno...
      ..onno..
      ..onno..
      ...onno.
      ...onno.
      ...onno.
      ...onno.
      ...onno.
      ...onno.
      ...owwo.
      ..owwwwo
      .owwWwwo
      .owwWwwo
      ..owwwo.
      .owwwwwo
      owwwwwwo
      owwWWwwo
      owwwwwwo
      .owwwwo.
      ..oooo..
    `),
  },
});
