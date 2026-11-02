import { type IUniform, type Mesh, type MeshBasicMaterial, type Object3D, Vector3 } from 'three';

/**
 * The opal desk lamp on the right-hand end of the TV cabinet (tools/room/tv-lamp.mjs), as the finish draws its light.
 * The room is baked, so the lamp is light the finish adds to every baked surface, like the TV's (screenLight.ts): a
 * sphere light at the globe's centre whose diffuse light the bake's colour turns into each surface's own, shadowed by
 * the set and the cabinet it stands on. The asset carries the light (`userData.light` on the lamp's node).
 */
export interface TvLampLight {
  readonly center: readonly [number, number, number];
  readonly radius: number;
  readonly color: readonly [number, number, number];
  /** The globe's unlit colour × this: light, not a painted ball, so the finish's highlights bloom around it. */
  readonly glow: number;
}

export interface TvLampUniforms {
  [name: string]: IUniform;
  /** The globe's centre. */
  uTvLamp: IUniform<Vector3>;
  /** Linear colour × intensity; zero without the lamp or a finish. */
  uTvLampColor: IUniform<Vector3>;
}

/**
 * Its intensity in the finish's linear light: about a 25 W opal globe against the room's dim night, which the bake
 * shows at about 4 % of full light where the TV stands. Lifts the wall beside the set, the plant and the set's right
 * side out of the dark without reaching the far side of the room (it fades out from 1.4 m).
 */
export const TV_LAMP_INTENSITY = 0.14;

export function createTvLampUniforms(): TvLampUniforms {
  return { uTvLamp: { value: new Vector3() }, uTvLampColor: { value: new Vector3() } };
}

/**
 * Finds the lamp in the loaded room, puts its centre in `uniforms` and turns its globe into light (its unlit colour
 * pushed past white, so the finish's highlights bloom around it). Null without a lamp.
 */
export function attachTvLamp(root: Object3D, uniforms: TvLampUniforms): TvLampLight | null {
  let light: TvLampLight | null = null;
  // Depth first: the lamp's node comes before the globe under it.
  root.traverse((object) => {
    if (object.userData.supplied_asset === 'tv-lamp') {
      light = object.userData.light as TvLampLight;
      uniforms.uTvLamp.value.fromArray(light.center);
    }
    const material = (object as Mesh).material as MeshBasicMaterial | undefined;
    if (light && material?.name === '01_TV_lamp_opaline_BAKED_UNLIT')
      material.color.fromArray(light.color).multiplyScalar(light.glow);
  });
  return light;
}

/** The set (docs/ROOM.md › Original TV geometry contract) and the cabinet under it, 5 mm in from their faces. */
const TV_SET = 'vec3(2.158, 0.491, -0.62), vec3(2.652, 1.071, -0.02)';
const CABINET = 'vec3(2.125, 0.0, -1.12), vec3(2.795, 0.481, 0.67)';

/** The lamp's diffuse light, for the finish's surface shaders (RoomGloss). */
export const TV_LAMP_LIGHT = /* glsl */ `
uniform vec3 uTvLamp;
uniform vec3 uTvLampColor;

// How far the segment from p along d (0 to 1) runs inside a box: 0 where it misses or only grazes it, so the
// shadow's edge softens over the first few centimetres of the occluder like the penumbra of a 16 cm globe.
float tvLampChord(vec3 p, vec3 d, vec3 low, vec3 high) {
  vec3 inverse = 1.0 / (d + vec3(1e-6));
  vec3 a = (low - p) * inverse;
  vec3 b = (high - p) * inverse;
  vec3 near = min(a, b);
  vec3 far = max(a, b);
  float enter = max(max(near.x, near.y), max(near.z, 0.0));
  float leave = min(min(far.x, far.y), min(far.z, 1.0));
  return max(leave - enter, 0.0) * length(d);
}

vec3 tvLampLight(vec3 position, vec3 normal, vec3 albedo) {
  vec3 toLamp = uTvLamp - position;
  float distance2 = dot(toLamp, toLamp);
  float facing = dot(normal, toLamp) * inversesqrt(distance2);
  // A sphere light's horizon: a surface tilted just past it still sees the globe's upper part.
  facing = max((facing + 0.1) / 1.1, 0.0);
  if (facing <= 0.0 || distance2 > 4.0 || uTvLampColor.r <= 0.0) return vec3(0.0);
  float chord = max(tvLampChord(position, toLamp, ${TV_SET}), tvLampChord(position, toLamp, ${CABINET}));
  float shadow = 1.0 - smoothstep(0.0, 0.07, chord);
  float reach = 1.0 - smoothstep(1.4, 2.0, sqrt(distance2));
  // Softened past the globe's own radius: light spread by the opal and bounced by the cabinet, never a hot spot.
  return albedo * uTvLampColor * facing * shadow * reach / (distance2 + 0.04);
}
`;
