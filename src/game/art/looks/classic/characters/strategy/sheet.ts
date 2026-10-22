import { pixels } from '@/engine/gfx/PixelArt';
import { withRows } from '../../../../compose';
import { buildCharacterSheet } from '../../rig';

/** STRATEGY — slate blazer over a white shirt and red tie, browline glasses, and a clipboard full of sticky notes. */
const head = pixels(`
  ....oooooo....
  ..oohhhhhhoo..
  .ohhhhhhhhhho.
  ohhhhhhhhHhhho
  ohhhhsssssssho
  ohhhssssssssso
  ohhSsfffffffso
  ohhSsLLesLLeso
  ohhSsLLLsLLLso
  .ohSssssssmsso
  .ooSSssssssso.
  ...oSSsssssoo.
  ....ooooooo...
`);

export const strategySheet = buildCharacterSheet({
  palette: {
    o: '#10121c',
    s: '#f0c29a',
    S: '#c48a64',
    h: '#4a3222',
    H: '#6e4a32',
    e: '#10121c',
    f: '#1b1e2b',
    L: '#dfe8ff',
    c: '#4b5d96',
    C: '#334170',
    l: '#7d8fc8',
    w: '#f4f4f8',
    r: '#e2352d',
    d: '#c9a227',
    p: '#2b2f40',
    P: '#1b1e2b',
    b: '#6b3f23',
    B: '#3a2010',
    k: '#9a6a3a',
    G: '#a8adbd',
    y: '#ffe14d',
    m: '#a8463a',
    M: '#4a1410',
  },
  heads: {
    normal: head,
    blink: withRows(head, { 7: 'ohhSsLLLsLLLso', 8: 'ohhSsSSSsSSSso' }),
    focus: withRows(head, { 9: '.ohSssssssmmso' }),
    happy: withRows(head, { 9: '.ohSssmssssmso', 10: '.ooSSssmmmmso.' }),
    hurt: withRows(head, { 7: 'ohhSsLeLsLeLso', 8: 'ohhSsSSSsSSSso', 9: '.ohSsssssMMsso', 10: '.ooSSsssMMsso.' }),
  },
  torso: pixels(`
    .oooooooo.
    occlwrwlco
    occlwrwlco
    oCcclrlcco
    oCccclrcco
    oCccccccco
    oCcccccdco
    oCccccccco
    oCCCCCCCCo
    .oooooooo.
  `),
  handProp: {
    x: 3,
    y: 2,
    rows: pixels(`
      .oGGo.
      okGGko
      owwwwo
      owyywo
      owyywo
      owwwwo
      owwwwo
      .oooo.
    `),
  },
});
