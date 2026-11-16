import { ART } from '../art';
import { type Rgb, type Ring, roundedRect, type Vec3 } from '../kit/builder';
import type { Prop } from './types';

/**
 * The CRT television set, facing -x on the cabinet top, around the glass (which keeps the shipped set's contract:
 * docs/ROOM.md › Original TV geometry contract). Slate ABS: a front frame with a lip sloping in to the glass, a rounded
 * shoulder, a rear shell stepping in and tapering to the back plate, cooling slots, a plinth, the button strip and the
 * front jacks. The legends and the wordmark are a print (art.ts); the wordmark is the site's own, not a maker's.
 */
const FRONT = 2.1542;
const SEAM = 2.3731;
const BOX = { z0: -0.625, z1: -0.015, y0: 0.533, y1: 1.076 };
const APERTURE = { z0: -0.5776, z1: -0.0624, y0: 0.6371, y1: 1.034 };
const BASE_Y = 0.486;
const AXIS: Vec3 = [2.3, 0.8, -0.32];

const ABS: Rgb = [0.012, 0.012, 0.014];
const LIP: Rgb = [0.011, 0.011, 0.013];
const RECESS: Rgb = [0.007, 0.007, 0.008];
const BUTTON: Rgb = [0.014, 0.014, 0.017];

/** A rounded rectangle in the plane across x. */
const ring = (x: number, z0: number, z1: number, y0: number, y1: number, radius: number): Ring =>
  roundedRect(z0, z1, y0, y1, radius).map(([z, y]): Vec3 => [x, y, z]);

export const tvSet: Prop = {
  name: 'tv-set',
  budget: 7000,
  build(sink) {
    const b = sink.mesh('tv');
    const { z0, z1, y0, y1 } = BOX;
    const outward = { from: AXIS };
    // The lip looks in at the picture and out at the room: towards a point in front of the glass's middle.
    const inward = { towards: [1.6, (APERTURE.y0 + APERTURE.y1) / 2, (APERTURE.z0 + APERTURE.z1) / 2] as Vec3 };
    const viewer = { along: [-1, 0, 0] as Vec3 };
    // Concentric with the aperture's own corners, so the lip's corner quads never twist.
    const grow = (x: number, by: number) =>
      ring(x, APERTURE.z0 - by, APERTURE.z1 + by, APERTURE.y0 - by, APERTURE.y1 + by, 0.013 + by);
    // The lip: from the aperture at the glass's rim out and forward to the front face.
    const lipInner = grow(2.181, 0);
    const lipMid = grow(2.165, 0.011);
    const lipOuter = grow(FRONT + 0.001, 0.02);
    const lipEdge = grow(FRONT, 0.023);
    b.loft(lipInner, lipMid, inward, LIP, 0.5);
    b.loft(lipMid, lipOuter, inward, LIP, 0.8);
    b.loft(lipOuter, lipEdge, viewer, ABS);
    // The front face, then the rounded shoulder into the sides.
    const faceEdge = ring(FRONT, z0 + 0.016, z1 - 0.016, y0 + 0.006, y1 - 0.012, 0.018);
    const shoulderA = ring(FRONT + 0.005, z0 + 0.005, z1 - 0.005, y0 + 0.001, y1 - 0.004, 0.022);
    const shoulderB = ring(FRONT + 0.014, z0, z1, y0, y1, 0.024);
    const seam = ring(SEAM, z0, z1, y0, y1, 0.024);
    b.loft(lipEdge, faceEdge, viewer, ABS);
    b.loft(faceEdge, shoulderA, outward, ABS);
    b.loft(shoulderA, shoulderB, outward, ABS);
    b.loft(shoulderB, seam, outward, ABS);
    // The seam's groove, the rear shell stepping in and tapering to the back plate.
    const groove = ring(SEAM + 0.004, z0 + 0.004, z1 - 0.004, y0 + 0.004, y1 - 0.004, 0.022);
    const rear = [
      ring(2.392, z0 + 0.006, z1 - 0.006, y0 + 0.004, y1 - 0.012, 0.024),
      ring(2.41, -0.576, -0.062, 0.534, 1.034, 0.05),
      ring(2.51, -0.553, -0.084, 0.565, 0.934, 0.06),
      ring(2.58, -0.501, -0.137, 0.703, 0.874, 0.05),
      ring(2.648, -0.42, -0.22, 0.732, 0.884, 0.04),
      ring(2.657, -0.4, -0.24, 0.745, 0.87, 0.03),
    ];
    b.loft(seam, groove, outward, RECESS, 0.45);
    b.loft(groove, rear[0] as Ring, outward, ABS);
    for (let i = 0; i + 1 < rear.length; i++) b.loft(rear[i] as Ring, rear[i + 1] as Ring, outward, ABS);
    b.cap(rear[rear.length - 1] as Ring, [1, 0, 0], ABS);
    // Cooling slots across the rear shell's top: twelve dark recesses following its slope.
    const slope = (0.934 - 1.034) / (2.51 - 2.41);
    for (let i = 0; i < 12; i++) {
      const z = -0.5 + i * 0.033;
      const at = (x: number, dz: number): Vec3 => [x, 1.0345 + (x - 2.41) * slope + 0.0006, z + dz];
      b.quad(at(2.42, 0), at(2.42, 0.016), at(2.495, 0.016), at(2.495, 0), [0.012, 0.012, 0.014], 0.3);
    }
    // The plinth the set stands on, set back from the face and narrower.
    b.box([2.176, BASE_Y, -0.585], [2.4, y0 + 0.012, -0.055], RECESS, 0.5, ['+y']);

    // POWER, then VOLUME - +, CHANNEL - +, ACTION, TV/VIDEO, as on the shipped strip (z -0.477 to -0.348).
    const button = (z: number, radius: number) => {
      b.cylinder([FRONT + 0.001, 0.5535, z], [FRONT - 0.0035, 0.5535, z], radius, radius * 0.9, 18, BUTTON, 1);
      b.cylinder(
        [FRONT + 0.0004, 0.5535, z],
        [FRONT - 0.0006, 0.5535, z],
        radius * 1.22,
        radius * 1.16,
        18,
        RECESS,
        0.45,
      );
    };
    button(-0.468, 0.0082);
    for (const z of [-0.444, -0.43, -0.412, -0.398, -0.374, -0.358]) button(z, 0.0052);
    // The door of the hidden controls.
    b.box([FRONT - 0.0008, 0.5435, -0.334], [FRONT + 0.002, 0.5635, -0.276], RECESS, 0.7, ['+x']);
    // The front jacks: video, left, right.
    const jack = (z: number, color: Rgb) => {
      b.cylinder([FRONT + 0.001, 0.555, z], [FRONT - 0.002, 0.555, z], 0.0072, 0.0068, 20, color, 1.6);
      b.cylinder([FRONT - 0.0019, 0.555, z], [FRONT - 0.0022, 0.555, z], 0.0048, 0.0048, 14, [0.5, 0.42, 0.25], 1);
      b.cylinder(
        [FRONT - 0.0021, 0.555, z],
        [FRONT - 0.0024, 0.555, z],
        0.0022,
        0.0022,
        10,
        [0.004, 0.004, 0.004],
        0.3,
      );
    };
    jack(-0.247, [0.62, 0.42, 0.03]);
    jack(-0.228, [0.55, 0.55, 0.55]);
    jack(-0.209, [0.55, 0.035, 0.035]);
    // Rear: the aerial socket.
    b.cylinder([2.4, 0.588, -0.136], [2.422, 0.588, -0.136], 0.0065, 0.0065, 14, [0.35, 0.35, 0.37], 1);

    sink.decal({
      origin: [FRONT - 0.0006, 0.5722, -0.48],
      u: [0, 0, 0.3],
      v: [0, 0.0375, 0],
      art: ART.legends,
      tint: [0.36, 0.36, 0.4],
    });
  },
};
