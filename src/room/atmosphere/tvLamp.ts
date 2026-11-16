import { type IUniform, Vector3 } from 'three';

/**
 * The opal desk lamp on the right-hand end of the TV cabinet (gen/props/lampAndRobot.ts), as the finish knows it. Its
 * light on the room is baked with the room (gen/rig.ts › tv-lamp, in the finish's own terms: `TV_LAMP_INTENSITY` on
 * the lamp's colour). What is left for a frame is what depends on the eye: its reflection in varnished surfaces
 * (RoomGloss), the air it warms (RoomAtmosphere) and its halo (RoomHalation), all from these two uniforms.
 */
export interface TvLampUniforms {
  [name: string]: IUniform;
  /** The globe's centre. */
  uTvLamp: IUniform<Vector3>;
  /** Linear colour × intensity; zero without a finish. */
  uTvLampColor: IUniform<Vector3>;
}

/**
 * Its intensity in the finish's linear light: about a 25 W opal globe against the room's dim night. The bake lights
 * the room with it (gen/tiers.ts keeps a copy, gen.test.ts holds the two together).
 */
export const TV_LAMP_INTENSITY = 0.14;

export function createTvLampUniforms(): TvLampUniforms {
  return { uTvLamp: { value: new Vector3() }, uTvLampColor: { value: new Vector3() } };
}

/** The lamp's uniforms, for the finish's shaders. */
export const TV_LAMP_LIGHT = /* glsl */ `
uniform vec3 uTvLamp;
uniform vec3 uTvLampColor;
`;
