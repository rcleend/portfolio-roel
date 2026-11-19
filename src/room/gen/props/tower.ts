import { DESK_PRINTS } from '../deskArt';
import type { Vec3 } from '../kit/builder';
import { face, lerp, segments, slab, type Tone, tint, turned } from './form';
import { aged, IVORY, REAR, RECESS } from './monitor';
import { FLOOR, type PropSink } from './types';

/** The tower's face: the plane its bezel's front lies in, and its middle. */
const FACE = -1.741;
const X = -1.95;
/**
 * The modelled room's tower hung 19 mm over the boards (its feet's soles at y = 0.0246): this one stands on them, so
 * every height measured off that one comes down by that much.
 */
const DROP = 0.0246 - FLOOR;
/** A point of the tower's front: across from its middle, up from the floor, and out from the bezel's face. */
const at = (across: number, up: number, out: number): Vec3 => [X + across, up - DROP, FACE + out];

/**
 * The tower under the desk (the modelled room's measurements): a steel case behind a
 * thicker moulded bezel, a disc drive and a blank bay, the floppy drive with its slot and eject key, the power key in
 * its ring, two lamps, a louvred grille and four feet. It faces +z.
 */
export function tower(sink: PropSink): void {
  const b = sink.mesh('desk');
  const { detail } = sink;
  const steel: Tone = (point) => aged(tint(REAR, 1.04), point, 31);
  const moulded: Tone = (point) => aged(IVORY, point, 32);
  const corner = segments(3, detail, 2);
  const fine = detail >= 0.8;
  // The case, its sides cut for the light under the desk, and the bezel standing a little proud all round.
  slab(b, [-2.06, 0.0356 - DROP, -2.19], [-1.84, 0.5857 - DROP, -1.772], 2, 0.006, steel, {
    corner,
    cuts: [fine ? 3 : 2, fine ? 6 : 3, fine ? 5 : 3],
    open: 1,
  });
  slab(b, [-2.063, 0.0306 - DROP, -1.779], [-1.837, 0.5906 - DROP, FACE], 2, 0.011, moulded, {
    corner: segments(4, detail, 2),
    cuts: [fine ? 4 : 2, fine ? 8 : 4, 1],
    ease: 0.007,
  });
  for (const x of [-2.03, -1.87])
    for (const z of [-2.13, -1.83])
      b.roundedBox(
        [x - 0.0175, FLOOR, z - 0.0225],
        [x + 0.0175, 0.0426 - DROP, z + 0.0225],
        0.004,
        tint(RECESS, 0.5),
        0.5,
        1,
        1,
      );

  // The two bays: a door standing proud, and the tray's front (or a blank) set into it.
  for (const [low, drive] of [
    [0.4656, true],
    [0.4006, false],
  ] as const) {
    slab(b, at(-0.09, low, -0.003), at(0.09, low + 0.05, 0.009), 2, 0.004, moulded, {
      corner: 2,
      cuts: [3, 1, 1],
      ease: 0.0022,
      open: -1,
      turns: 1,
    });
    slab(
      b,
      at(-0.086, low + 0.0135, 0.008),
      at(0.07, low + 0.0425, 0.0105),
      2,
      0.003,
      (p) => tint(moulded(p, 0, 0), 1.04),
      {
        corner: 2,
        cuts: [3, 1, 1],
        ease: 0.0012,
        open: -1,
        turns: 1,
      },
    );
    if (!drive) continue;
    // A disc drive: the tray's seam, its eject key, and its lamp (a print: it shines in the dark under the desk).
    b.box(at(-0.082, low + 0.0262, 0.0105), at(0.066, low + 0.027, 0.0108), tint(RECESS, 0.45), 0.5, ['-z']);
    b.roundedBox(at(0.046, low + 0.016, 0.0102), at(0.062, low + 0.0218, 0.0122), 0.001, tint(IVORY, 0.9), 1, 2, 1);
    sink.decal({
      origin: at(0.026, low + 0.0145, 0.0109),
      u: [0.009, 0, 0],
      v: [0, 0.009, 0],
      art: DESK_PRINTS.lamp,
      tint: [0.2, 0.7, 0.16],
    });
  }
  // The floppy drive: its face, the slot with the flap behind it, and the eject key.
  slab(b, at(-0.075, 0.3446, -0.003), at(0.075, 0.3766, 0.011), 2, 0.004, moulded, {
    corner: 2,
    cuts: [3, 1, 1],
    ease: 0.002,
    open: -1,
    turns: 1,
  });
  b.box(at(-0.0625, 0.3597, 0.011), at(0.0425, 0.3637, 0.0113), tint(RECESS, 0.3), 0.4, ['-z']);
  b.box(at(-0.0625, 0.3637, 0.011), at(0.0425, 0.3644, 0.0116), tint(IVORY, 1.08), 1, ['-z']);
  b.roundedBox(at(0.05, 0.3496, 0.0108), at(0.066, 0.3576, 0.0145), 0.0012, tint(REAR, 0.95), 1, 2, 2);
  // The power key in its ring, and the two lamps beside it.
  const key: Tone = (point, ring) => (ring < 3 ? tint(RECESS, 0.55) : aged(tint(IVORY, 1.04), point, 33));
  turned(
    b,
    at(0, 0.2656, 0),
    [0, 0, 1],
    [1, 0, 0],
    [
      [0.0198, 0],
      [0.0198, 0.0012],
      [0.018, 0.0014],
      [0.018, 0.009],
      [0.0165, 0.0108],
      [0.008, 0.0114],
      [0, 0.0115],
    ],
    segments(20, detail, 10),
    key,
    0.0012,
    1,
  );
  for (const [y, color] of [
    [0.2307, [0.25, 0.8, 0.2]],
    [0.2206, [0.9, 0.45, 0.1]],
  ] as const) {
    b.roundedBox(
      at(0.0311, y - 0.002, 0),
      at(0.0349, y + 0.002, 0.0016),
      0.0008,
      [color[0] * 0.25, color[1] * 0.25, color[2] * 0.25],
      1,
      2,
      1,
    );
    sink.decal({
      origin: at(0.027, y - 0.006, 0.0018),
      u: [0.012, 0, 0],
      v: [0, 0.012, 0],
      art: DESK_PRINTS.lamp,
      tint: [color[0] * 0.8, color[1] * 0.8, color[2] * 0.8],
    });
  }
  // The grille: a dark well, and slats across it leaning down like a louvre's.
  face(
    b,
    [at(-0.067, 0.094, 0.0004), at(0.067, 0.094, 0.0004), at(0.067, 0.184, 0.0004), at(-0.067, 0.184, 0.0004)],
    [0, 0, 1],
    tint(RECESS, 0.28),
    1,
    1,
    0.3,
  );
  const slats = fine ? 8 : 4;
  for (let i = 0; i < slats; i++) {
    const y = lerp(0.0987, 0.1756, i / (slats - 1));
    const tall = fine ? 0.0044 : 0.009;
    // A slat: its front edge proud, its top face running back and up into the well.
    face(
      b,
      [at(-0.065, y, 0.0034), at(0.065, y, 0.0034), at(0.065, y + tall, 0.0034), at(-0.065, y + tall, 0.0034)],
      [0, 0, 1],
      moulded,
      4,
      1,
    );
    face(
      b,
      [
        at(-0.065, y + tall, 0.0034),
        at(0.065, y + tall, 0.0034),
        at(0.065, y + tall + 0.003, 0.0004),
        at(-0.065, y + tall + 0.003, 0.0004),
      ],
      [0, 1, 0.5],
      moulded,
      4,
      1,
    );
    face(
      b,
      [at(-0.065, y, 0.0034), at(0.065, y, 0.0034), at(0.065, y, 0.0004), at(-0.065, y, 0.0004)],
      [0, -1, 0],
      (p) => tint(moulded(p, 0, 0), 0.7),
      1,
      1,
      0.5,
    );
    for (const side of [-1, 1])
      face(
        b,
        [
          at(side * 0.065, y, 0.0004),
          at(side * 0.065, y, 0.0034),
          at(side * 0.065, y + tall, 0.0034),
          at(side * 0.065, y + tall + 0.003, 0.0004),
        ],
        [side, 0, 0],
        moulded,
      );
  }
  // The badge under the drives, and the drive's own legend: prints.
  b.roundedBox(at(-0.06, 0.305, 0), at(-0.03, 0.317, 0.0011), 0.0008, tint(REAR, 0.9), 1, 2, 1);
  sink.decal({
    origin: at(-0.0595, 0.3052, 0.0013),
    u: [0.029, 0, 0],
    v: [0, 0.0116, 0],
    art: DESK_PRINTS.badge,
    tint: [0.1, 0.1, 0.09],
  });
  sink.decal({
    origin: at(-0.082, 0.4935, 0.0107),
    u: [0.04, 0, 0],
    v: [0, 0.005, 0],
    art: DESK_PRINTS.drive,
    tint: [0.16, 0.16, 0.15],
  });
}
