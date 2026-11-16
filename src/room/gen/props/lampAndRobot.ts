import { ART } from '../art';
import { add, place, type Rgb, scale, type Vec3 } from '../kit/builder';
import { ROBOT, TV_LAMP } from '../rig';
import type { Prop } from './types';

/**
 * The opal desk lamp on the cabinet's right-hand end: a round metal foot and the globe, which is light (its mesh is
 * drawn as an emitter, and the bake renders its light from the globe's centre).
 */
export const opalLamp: Prop = {
  name: 'opal-lamp',
  budget: 1900,
  build(sink) {
    const [x, , z] = TV_LAMP.center;
    const metal: Rgb = [0.05, 0.05, 0.055];
    sink.mesh('props').lathe(
      [x, 0.486, z],
      [0, 1, 0],
      [
        [0.064, 0],
        [0.064, 0.01],
        [0.052, 0.026],
        [0.034, 0.034],
        [0.03, 0.045],
        [0, 0.045],
      ],
      32,
      metal,
    );
    sink.mesh('globe').sphere(TV_LAMP.center, TV_LAMP.radius, 40, [1, 1, 1]);
  },
};

const TIN: Rgb = [0.04, 0.006, 0.005];
const TIN_DARK: Rgb = [0.025, 0.005, 0.004];
const STEEL: Rgb = [0.08, 0.085, 0.085];
const YELLOW: Rgb = [0.5, 0.33, 0.03];

/**
 * The tin toy robot on the cabinet's left-hand end, 30 cm tall, turned 30° towards the set: grey feet, red legs, a
 * boxy body with a raised chest panel (its gauges are a print), arms at its sides, a square head with a mouth plate,
 * ears with aerials and a yellow knob. Its eyes are light: lit glass discs, drawn as emitters, where the bake puts
 * their two bulbs.
 */
export const toyRobot: Prop = {
  name: 'toy-robot',
  budget: 2800,
  build(sink) {
    const b = sink.mesh('props');
    b.placed(place(ROBOT.origin, ROBOT.yaw), () => {
      for (const side of [-1, 1]) {
        const z = (a: number, c: number): [number, number] => (side < 0 ? [-c, -a] : [a, c]);
        const [f0, f1] = z(0.005, 0.038);
        b.roundedBox([-0.034, 0, f0], [0.03, 0.03, f1], 0.004, [0.13, 0.15, 0.15], 1, 1, 2);
        const [l0, l1] = z(0.008, 0.034);
        b.roundedBox([-0.024, 0.03, l0], [0.021, 0.108, l1], 0.004, TIN, 1, 1, 2);
        // A pressed knee and shin, as on a tin toy.
        b.box([-0.0262, 0.06, l0 + 0.004], [-0.024, 0.082, l1 - 0.004], TIN_DARK, 0.8, ['+x']);
        const [a0, a1] = z(0.0468, 0.066);
        b.roundedBox([-0.013, 0.118, a0], [0.013, 0.208, a1], 0.006, TIN, 1, 1, 2);
        b.cylinder([0, 0.196, side * 0.0455], [0, 0.196, side * 0.0475], 0.012, 0.012, 14, STEEL, 0.9);
        // The ear and its aerial.
        b.cylinder([-0.003, 0.256, side * 0.031], [-0.003, 0.256, side * 0.039], 0.014, 0.011, 14, STEEL, 0.9);
        b.cylinder([-0.003, 0.258, side * 0.043], [-0.003, 0.29, side * 0.043], 0.0016, 0.0016, 6, STEEL, 1);
        b.box([-0.006, 0.288, side * 0.043 - 0.003], [0, 0.297, side * 0.043 + 0.003], TIN, 1);
      }
      // Hips, the body and its raised chest frame, the control strip under it.
      b.roundedBox([-0.03, 0.105, -0.04], [0.022, 0.124, 0.04], 0.003, STEEL, 0.9, 1, 2);
      b.roundedBox([-0.0382, 0.123, -0.0458], [0.0233, 0.217, 0.0458], 0.006, TIN, 1, 1, 3);
      b.box([-0.0412, 0.146, -0.033], [-0.038, 0.206, 0.033], TIN_DARK, 0.9, ['+x']);
      b.box([-0.0426, 0.153, -0.024], [-0.041, 0.2, 0.024], [0.02, 0.02, 0.02], 0.8, ['+x']);
      b.box([-0.0402, 0.129, -0.033], [-0.038, 0.141, 0.033], TIN_DARK, 0.9, ['+x']);
      for (const z of [-0.025, -0.014, 0.014, 0.025])
        b.cylinder([-0.0402, 0.135, z], [-0.0418, 0.135, z], 0.0042, 0.0038, 10, STEEL, 1);
      b.cylinder([-0.004, 0.217, 0], [-0.004, 0.229, 0], 0.017, 0.017, 16, STEEL, 0.7);
    });
    // The head follows the eyes (it is turned a little from the body): its face is 3 cm in front of its middle.
    const middle = scale(add(ROBOT.eyes[0], ROBOT.eyes[1]), 0.5);
    const headYaw = Math.atan2(ROBOT.facing[2], -ROBOT.facing[0]);
    const head: Vec3 = [middle[0] - ROBOT.facing[0] * 0.03, ROBOT.origin[1], middle[2] - ROBOT.facing[2] * 0.03];
    b.placed(place(head, headYaw), () => {
      b.roundedBox([-0.03, 0.228, -0.031], [0.026, 0.284, 0.031], 0.005, TIN, 1, 1, 3);
      b.box([-0.0312, 0.237, -0.015], [-0.03, 0.247, 0.015], STEEL, 1, ['+x']);
      b.box([-0.0318, 0.25, -0.003], [-0.03, 0.258, 0.003], TIN_DARK, 1, ['+x']);
      b.cylinder([-0.002, 0.284, 0], [-0.002, 0.296, 0], 0.011, 0.009, 14, YELLOW, 1);
      // The eyes' rims; the lit glass is the emitter mesh, in the same frame.
      const eyeY = ROBOT.eyes[0][1] - ROBOT.origin[1];
      const half = Math.hypot(ROBOT.eyes[1][0] - ROBOT.eyes[0][0], ROBOT.eyes[1][2] - ROBOT.eyes[0][2]) / 2;
      for (const z of [-half, half]) {
        b.cylinder([-0.03, eyeY, z], [-0.0312, eyeY, z], 0.0118, 0.0112, 20, TIN_DARK, 0.8);
        sink.mesh('eyes').placed(place(head, headYaw), () => {
          const eyes = sink.mesh('eyes');
          eyes.cylinder([-0.0312, eyeY, z], [-0.0318, eyeY, z], 0.0098, 0.0092, 20, [1, 1, 1], 1);
        });
      }
    });
    // The chest panel's print, on the body's own frame.
    const turn = place(ROBOT.origin, ROBOT.yaw);
    const corner = (x: number, y: number, z: number): Vec3 => {
      const r = turn.rotation as number[];
      return [
        (r[0] as number) * x + (r[2] as number) * z + turn.offset[0],
        y + turn.offset[1],
        (r[6] as number) * x + (r[8] as number) * z + turn.offset[2],
      ];
    };
    const o = corner(-0.0428, 0.155, -0.022);
    const right = corner(-0.0428, 0.155, 0.022);
    sink.decal({
      origin: o,
      u: [right[0] - o[0], 0, right[2] - o[2]],
      v: [0, 0.043, 0],
      art: ART.chest,
      tint: [0.16, 0.16, 0.16],
    });
  },
};
