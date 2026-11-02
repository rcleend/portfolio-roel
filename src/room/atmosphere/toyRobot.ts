import { type IUniform, Matrix3, type Mesh, type MeshBasicMaterial, type Object3D, Vector3 } from 'three';
import { CABINET, TV_SET } from './tvLamp';

/**
 * The tin toy robot on the left-hand end of the TV cabinet (tools/room/toy-robot.mjs), as the finish draws its eyes'
 * light. Like the opal lamp (tvLamp.ts) it is light the finish adds to every baked surface: each eye is a small bulb
 * behind glass that throws its light forward and a little to the sides, in the lamp's own colour. It lights the robot's
 * face and chest, the cabinet top and the Product Engineer case in front of it, and the set's left side, through the
 * lamp's shadow boxes for the set and the cabinet and the robot's own head and body. The asset carries the light
 * (`userData.light` on the robot's node).
 */
export interface ToyRobotLight {
  /** Each eye's light, just in front of its glass, and the way the head faces. */
  readonly eyes: readonly [readonly [number, number, number], readonly [number, number, number]];
  readonly facing: readonly [number, number, number];
  /** The opal lamp's colour (tools/room/tv-lamp-light.mjs) and the eyes' glow (their colour × this). */
  readonly color: readonly [number, number, number];
  readonly glow: number;
  /** The body's frame: its foot on the cabinet and its turn about +y from facing the opening camera (-x). */
  readonly frame: { readonly origin: readonly [number, number, number]; readonly yaw: number };
  /** The head's and the body's boxes in that frame, a few millimetres in from their faces. */
  readonly head: readonly [readonly [number, number, number], readonly [number, number, number]];
  readonly body: readonly [readonly [number, number, number], readonly [number, number, number]];
}

export interface ToyRobotUniforms {
  [name: string]: IUniform;
  uRobotEyeLeft: IUniform<Vector3>;
  uRobotEyeRight: IUniform<Vector3>;
  uRobotFacing: IUniform<Vector3>;
  /** Linear colour × intensity; zero without the robot or a finish. */
  uRobotEyeColor: IUniform<Vector3>;
  /** World to the body's frame: `uRobotFrame * (p - uRobotOrigin)`. */
  uRobotOrigin: IUniform<Vector3>;
  uRobotFrame: IUniform<Matrix3>;
  uRobotHeadLow: IUniform<Vector3>;
  uRobotHeadHigh: IUniform<Vector3>;
  uRobotBodyLow: IUniform<Vector3>;
  uRobotBodyHigh: IUniform<Vector3>;
}

/**
 * Each eye's intensity in the finish's linear light: a torch bulb's worth, a warm pool on the cabinet top and the case
 * in front of the robot and a glow round its eyes, fading out from 0.9 m.
 */
export const TOY_ROBOT_EYE_INTENSITY = 0.05;

export function createToyRobotUniforms(): ToyRobotUniforms {
  return {
    uRobotEyeLeft: { value: new Vector3() },
    uRobotEyeRight: { value: new Vector3() },
    uRobotFacing: { value: new Vector3() },
    uRobotEyeColor: { value: new Vector3() },
    uRobotOrigin: { value: new Vector3() },
    uRobotFrame: { value: new Matrix3() },
    uRobotHeadLow: { value: new Vector3() },
    uRobotHeadHigh: { value: new Vector3() },
    uRobotBodyLow: { value: new Vector3() },
    uRobotBodyHigh: { value: new Vector3() },
  };
}

/**
 * Finds the robot in the loaded room, puts its eyes and shadow boxes in `uniforms` and turns its eyes into light (their
 * unlit colour pushed past white). Null without a robot.
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
      uniforms.uRobotOrigin.value.fromArray(found.frame.origin);
      // Turning back by the yaw, the inverse of the build's turn (x, z) -> (x cos + z sin, -x sin + z cos).
      const c = Math.cos(found.frame.yaw);
      const s = Math.sin(found.frame.yaw);
      uniforms.uRobotFrame.value.set(c, 0, -s, 0, 1, 0, s, 0, c);
      uniforms.uRobotHeadLow.value.fromArray(found.head[0]);
      uniforms.uRobotHeadHigh.value.fromArray(found.head[1]);
      uniforms.uRobotBodyLow.value.fromArray(found.body[0]);
      uniforms.uRobotBodyHigh.value.fromArray(found.body[1]);
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
uniform vec3 uRobotEyeColor;
uniform vec3 uRobotOrigin;
uniform mat3 uRobotFrame;
uniform vec3 uRobotHeadLow;
uniform vec3 uRobotHeadHigh;
uniform vec3 uRobotBodyLow;
uniform vec3 uRobotBodyHigh;

// One eye's light on a surface: a small bulb behind a domed glass, brightest straight ahead, two fifths as bright at
// right angles to the face and a fifth behind it (the glass's rim), softened over the bulb's own size.
float robotEye(vec3 position, vec3 normal, vec3 local, vec3 eye) {
  vec3 toEye = eye - position;
  float distance2 = dot(toEye, toEye);
  vec3 direction = toEye * inversesqrt(distance2);
  float facing = max((dot(normal, direction) + 0.25) / 1.25, 0.0);
  float lens = 0.2 + 0.8 * smoothstep(-0.35, 0.75, -dot(direction, uRobotFacing));
  vec3 toEyeLocal = uRobotFrame * toEye;
  float chord = max(
    max(tvLampChord(position, toEye, ${TV_SET}), tvLampChord(position, toEye, ${CABINET})),
    max(tvLampChord(local, toEyeLocal, uRobotHeadLow, uRobotHeadHigh),
      tvLampChord(local, toEyeLocal, uRobotBodyLow, uRobotBodyHigh)));
  return facing * lens * (1.0 - smoothstep(0.0, 0.02, chord)) / (distance2 + 0.0025);
}

vec3 toyRobotLight(vec3 position, vec3 normal, vec3 albedo) {
  float distance = length(position - 0.5 * (uRobotEyeLeft + uRobotEyeRight));
  if (uRobotEyeColor.r <= 0.0 || distance > 1.5) return vec3(0.0);
  vec3 local = uRobotFrame * (position - uRobotOrigin);
  float light = robotEye(position, normal, local, uRobotEyeLeft) + robotEye(position, normal, local, uRobotEyeRight);
  return albedo * uRobotEyeColor * light * (1.0 - smoothstep(0.9, 1.5, distance));
}
`;
