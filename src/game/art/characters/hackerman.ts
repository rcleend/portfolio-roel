import { pixels } from '@/engine/gfx/PixelArt';
import { withRows } from '../compose';
import { buildCharacterSheet } from './rig';

/** HACKERMAN — black hoodie with the hood up, dark sunglasses, terminal-green accents. */
const head = pixels(`
  ....oooooo....
  ..ooccccccoo..
  .occccccclcco.
  occccccccclcco
  occcccohhhhhco
  occccohhssssso
  occccogggsgggo
  occccoggasggao
  occccosssssSso
  .occcosssmmsso
  .occcoossssso.
  ..occcoooooo..
  ...oooo.......
`);

export const hackermanSheet = buildCharacterSheet({
  palette: {
    o: '#0d0b14',
    s: '#f0c29a',
    S: '#c48a64',
    h: '#3b2a22',
    c: '#363445',
    C: '#211f2b',
    l: '#5a586e',
    p: '#2c3a5c',
    P: '#1c2540',
    b: '#e8e8f0',
    B: '#7d8299',
    g: '#07070b',
    a: '#3ddc84',
    m: '#7a3b2e',
    M: '#3a1410',
  },
  heads: {
    normal: head,
    focus: withRows(head, { 9: '.occcosssmmmso' }),
    happy: withRows(head, { 7: 'occccoggasggao', 9: '.occcossmssmso', 10: '.occcoosmmmso.' }),
    hurt: withRows(head, { 6: 'occccosggsggso', 7: 'occccoggasgggo', 9: '.occcosssMMsso', 10: '.occcoossMMso.' }),
  },
  torso: pixels(`
    .oooooooo.
    occcccccco
    occcccacco
    oCccccacco
    oCcccccacl
    oCccccccco
    oCcCCCCCco
    oCccccccco
    oCCCCCCCCo
    .oooooooo.
  `),
});
