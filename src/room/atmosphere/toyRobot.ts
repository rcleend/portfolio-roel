import { type IUniform, Matrix3, type Mesh, type MeshBasicMaterial, type Object3D, Vector3 } from 'three';
import { CABINET, TV_SET } from './tvLamp';

/**
 * The tin toy robot on the left-hand end of the TV cabinet (tools/room/toy-robot.mjs), as the finish draws its eyes'
 * light. Like the opal lamp (tvLamp.ts) it is light the finish adds to every baked surface: each eye is a small bulb
 * behind domed glass, in the lamp's own colour, whose beam looks forward and a little down at the desk. Together they
 * lay a warm pool on the cabinet top in front of the robot's feet and light the Product Engineer case in it, through
 * the lamp's shadow boxes for the set and the cabinet and the robot's own body and legs. The asset carries the
 * light (`userData.light` on the robot's node).
 */
export interface ToyRobotLight {
  /** Each eye's light, on its glass, the way the head faces and the way the eyes' beams look (a little down). */
  readonly eyes: readonly [readonly [number, number, number], readonly [number, number, number]];
  readonly facing: readonly [number, number, number];
  readonly aim: readonly [number, number, number];
  /** The opal lamp's colour (tools/room/tv-lamp-light.mjs) and the eyes' glow (their colour × this). */
  readonly color: readonly [number, number, number];
  readonly glow: number;
  /** The body's frame: its foot on the cabinet and its turn about +y from facing the opening camera (-x). */
  readonly frame: { readonly origin: readonly [number, number, number]; readonly yaw: number };
  /** The body's and the legs' boxes in that frame, a few millimetres in from their faces. */
  readonly body: readonly [readonly [number, number, number], readonly [number, number, number]];
  readonly legs: readonly [readonly [number, number, number], readonly [number, number, number]];
}

export interface ToyRobotUniforms {
  [name: string]: IUniform;
  uRobotEyeLeft: IUniform<Vector3>;
  uRobotEyeRight: IUniform<Vector3>;
  uRobotFacing: IUniform<Vector3>;
  uRobotAim: IUniform<Vector3>;
  /** Linear colour × intensity; zero without the robot or a finish. */
  uRobotEyeColor: IUniform<Vector3>;
  /** World to the body's frame: `uRobotFrame * (p - uRobotOrigin)`. */
  uRobotOrigin: IUniform<Vector3>;
  uRobotFrame: IUniform<Matrix3>;
  uRobotBodyLow: IUniform<Vector3>;
  uRobotBodyHigh: IUniform<Vector3>;
  uRobotLegsLow: IUniform<Vector3>;
  uRobotLegsHigh: IUniform<Vector3>;
}

/**
 * Each eye's intensity along its beam, in the finish's linear light: a torch bulb behind a lens. Along the beam the two
 * together give about two thirds of the opal lamp's light at the same distance (the lens gathers the bulb's light into
 * it), off it a tenth of that. Standing 27 cm above the cabinet top against the globe's 12, their pool is a soft one.
 */
export const TOY_ROBOT_EYE_INTENSITY = 0.035;

/** The radius of the soft round glow the halation draws over each eye (metres): a little past the glass. */
export const TOY_ROBOT_EYE_HALO = 0.011;

export function createToyRobotUniforms(): ToyRobotUniforms {
  return {
    uRobotEyeLeft: { value: new Vector3() },
    uRobotEyeRight: { value: new Vector3() },
    uRobotFacing: { value: new Vector3() },
    uRobotAim: { value: new Vector3() },
    uRobotEyeColor: { value: new Vector3() },
    uRobotOrigin: { value: new Vector3() },
    uRobotFrame: { value: new Matrix3() },
    uRobotBodyLow: { value: new Vector3() },
    uRobotBodyHigh: { value: new Vector3() },
    uRobotLegsLow: { value: new Vector3() },
    uRobotLegsHigh: { value: new Vector3() },
  };
}

/**
 * Finds the robot in the loaded room, puts its eyes and shadow boxes in `uniforms` and turns its eyes into light: the
 * lamp's colour × `glow` over the lit glass the colour map paints in their discs. Null without a robot.
 */
export function attachToyRobot(root: Object3D, uniforms: ToyRobotUniforms): ToyRobotLight | null {
  let light: ToyRobotLight | null = null;
  // Depth first: the robot's node comes before its eyes.
  root.traverse((object) => {
    if (object.userData.supplied_asset === 'toy-robot') {
      const found = object.userData.light as ToyRobotLight;
      light = found;
      uniforms.uRobotEyeLeft.value.fromArray(found.eyes[0]);
      uniforms.uRobotEyeRight.value.fromArray(found.eyes[1]);
      uniforms.uRobotFacing.value.fromArray(found.facing);
      uniforms.uRobotAim.value.fromArray(found.aim);
      uniforms.uRobotOrigin.value.fromArray(found.frame.origin);
      // Turning back by the yaw, the inverse of the build's turn (x, z) -> (x cos + z sin, -x sin + z cos).
      const c = Math.cos(found.frame.yaw);
      const s = Math.sin(found.frame.yaw);
      uniforms.uRobotFrame.value.set(c, 0, -s, 0, 1, 0, s, 0, c);
      uniforms.uRobotBodyLow.value.fromArray(found.body[0]);
      uniforms.uRobotBodyHigh.value.fromArray(found.body[1]);
      uniforms.uRobotLegsLow.value.fromArray(found.legs[0]);
      uniforms.uRobotLegsHigh.value.fromArray(found.legs[1]);
    }
    const material = (object as Mesh).material as MeshBasicMaterial | undefined;
    if (light && material?.name === '01_TV_robot_eyes_BAKED_UNLIT')
      material.color.fromArray(light.color).multiplyScalar(light.glow);
  });
  return light;
}

/** The eyes' light, for the finish's surface shaders (RoomGloss); needs TV_LAMP_LIGHT's `tvLampChord` before it. */
export const TOY_ROBOT_LIGHT = /* glsl */ `
uniform vec3 uRobotEyeLeft;
uniform vec3 uRobotEyeRight;
uniform vec3 uRobotFacing;
uniform vec3 uRobotAim;
uniform vec3 uRobotEyeColor;
uniform vec3 uRobotOrigin;
uniform mat3 uRobotFrame;
uniform vec3 uRobotBodyLow;
uniform vec3 uRobotBodyHigh;
uniform vec3 uRobotLegsLow;
uniform vec3 uRobotLegsHigh;

// One eye's light on a surface. A bulb behind a lens: a soft round beam along uRobotAim, falling smoothly to a tenth
// off it, and nothing behind the face it is set in. Lambert at the surface and the inverse square, softened only over
// the bulb's own few millimetres. The robot's body and legs shade what lies beneath and behind them, and the set
// and the cabinet what lies behind those; each shadow's edge softens over the first centimetres the ray runs through
// its occluder, the penumbra of a lens a centimetre across seen from close by.
float robotEye(vec3 position, vec3 normal, vec3 local, vec3 eye) {
  vec3 toEye = eye - position;
  float distance2 = dot(toEye, toEye);
  vec3 direction = toEye * inversesqrt(distance2);
  float facing = max(dot(normal, direction), 0.0);
  float ahead = -dot(direction, uRobotFacing);
  float beam = mix(0.1, 1.0, smoothstep(0.55, 0.97, -dot(direction, uRobotAim))) * smoothstep(-0.05, 0.2, ahead);
  if (facing * beam <= 0.0) return 0.0;
  vec3 toEyeLocal = uRobotFrame * toEye;
  float chord = max(
    max(tvLampChord(position, toEye, ${TV_SET}), tvLampChord(position, toEye, ${CABINET})),
    max(tvLampChord(local, toEyeLocal, uRobotBodyLow, uRobotBodyHigh),
      tvLampChord(local, toEyeLocal, uRobotLegsLow, uRobotLegsHigh)));
  return facing * beam * (1.0 - smoothstep(0.0, 0.1, chord)) / (distance2 + 0.0001);
}

vec3 toyRobotLight(vec3 position, vec3 normal, vec3 albedo) {
  float distance = length(position - 0.5 * (uRobotEyeLeft + uRobotEyeRight));
  if (uRobotEyeColor.r <= 0.0 || distance > 1.5) return vec3(0.0);
  vec3 local = uRobotFrame * (position - uRobotOrigin);
  float light = robotEye(position, normal, local, uRobotEyeLeft) + robotEye(position, normal, local, uRobotEyeRight);
  return albedo * uRobotEyeColor * light * (1.0 - smoothstep(0.9, 1.5, distance));
}
`;
