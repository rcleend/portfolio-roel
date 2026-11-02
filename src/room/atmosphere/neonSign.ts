import { type IUniform, type Mesh, type MeshBasicMaterial, type Object3D, Vector3, Vector4 } from 'three';
import { CABINET, TV_SET } from './tvLamp';

/**
 * The neon "R" on the left-hand end of the TV cabinet (tools/room/neon-sign.mjs), as the finish draws its light. Like
 * the opal lamp (tvLamp.ts) it is light the finish adds to every baked surface: each tube lights a surface from its
 * nearest point (the red R from its box, the blue border from its outline), falling off like a line light, through
 * the lamp's shadow boxes for the set and the cabinet. The asset carries the light (`userData.light` on the sign).
 */
export interface NeonTube {
  /** Half the tube's centreline extent across and up the sign. */
  readonly half: readonly [number, number];
  readonly color: readonly [number, number, number];
  /** The tube's unlit colour × this: light past white, so the finish's highlights bloom around it. */
  readonly glow: number;
}

export interface NeonSignLight {
  /** The sign's middle and its right and up directions (it leans back against the wall). */
  readonly center: readonly [number, number, number];
  readonly right: readonly [number, number, number];
  readonly up: readonly [number, number, number];
  readonly letter: NeonTube;
  readonly border: NeonTube;
}

export interface NeonSignUniforms {
  [name: string]: IUniform;
  uNeon: IUniform<Vector3>;
  uNeonRight: IUniform<Vector3>;
  uNeonUp: IUniform<Vector3>;
  /** The letter's half extents (xy) and the border's (zw). */
  uNeonHalf: IUniform<Vector4>;
  /** Linear colour × intensity of the letter and of the border; zero without the sign or a finish. */
  uNeonRed: IUniform<Vector3>;
  uNeonBlue: IUniform<Vector3>;
}

/**
 * The tubes' intensity in the finish's linear light: a small sign's few watts of neon, a vivid fringe on the wall a
 * hand's width round it and a tint on the cabinet top, fading from 1 m.
 */
export const NEON_SIGN_INTENSITY = 0.018;

export function createNeonSignUniforms(): NeonSignUniforms {
  return {
    uNeon: { value: new Vector3() },
    uNeonRight: { value: new Vector3() },
    uNeonUp: { value: new Vector3() },
    uNeonHalf: { value: new Vector4() },
    uNeonRed: { value: new Vector3() },
    uNeonBlue: { value: new Vector3() },
  };
}

const MATERIALS: Readonly<Record<string, 'letter' | 'border'>> = {
  '01_TV_neon_red_BAKED_UNLIT': 'letter',
  '01_TV_neon_blue_BAKED_UNLIT': 'border',
};

/**
 * Finds the sign in the loaded room, puts its plane in `uniforms` and turns its tubes into light (their unlit colours
 * pushed past white). Null without a sign.
 */
export function attachNeonSign(root: Object3D, uniforms: NeonSignUniforms): NeonSignLight | null {
  let light: NeonSignLight | null = null;
  // Depth first: the sign's node comes before its tubes.
  root.traverse((object) => {
    if (object.userData.supplied_asset === 'neon-sign') {
      const found = object.userData.light as NeonSignLight;
      light = found;
      uniforms.uNeon.value.fromArray(found.center);
      uniforms.uNeonRight.value.fromArray(found.right);
      uniforms.uNeonUp.value.fromArray(found.up);
      uniforms.uNeonHalf.value.set(...found.letter.half, ...found.border.half);
    }
    const material = (object as Mesh).material as MeshBasicMaterial | undefined;
    const tube = light && material ? MATERIALS[material.name] : undefined;
    if (light && material && tube) material.color.fromArray(light[tube].color).multiplyScalar(light[tube].glow);
  });
  return light;
}

/** The sign's light, for the finish's surface shaders (RoomGloss); needs TV_LAMP_LIGHT's `tvLampChord` before it. */
export const NEON_SIGN_LIGHT = /* glsl */ `
uniform vec3 uNeon;
uniform vec3 uNeonRight;
uniform vec3 uNeonUp;
uniform vec4 uNeonHalf;
uniform vec3 uNeonRed;
uniform vec3 uNeonBlue;

// One tube's light on a surface, from the tube's nearest point: a line light's fall-off, 1 / d close by and 1 / d²
// past a few tube lengths, softened over the tube's own thickness; a slight wrap, since a glass tube shines all round.
vec3 neonTube(vec3 position, vec3 normal, vec3 point, vec3 color) {
  vec3 toTube = point - position;
  float distance = length(toTube) + 1e-4;
  float facing = max((dot(normal, toTube) / distance + 0.2) / 1.2, 0.0);
  float chord = max(tvLampChord(position, toTube, ${TV_SET}), tvLampChord(position, toTube, ${CABINET}));
  return color * facing * (1.0 - smoothstep(0.0, 0.05, chord)) / ((distance + 0.02) * (distance + 0.15));
}

vec3 neonSignLight(vec3 position, vec3 normal, vec3 albedo) {
  vec3 offset = position - uNeon;
  float distance2 = dot(offset, offset);
  if (uNeonRed.r <= 0.0 || distance2 > 2.9) return vec3(0.0);
  vec2 p = vec2(dot(offset, uNeonRight), dot(offset, uNeonUp));
  // The R lights from the middle half of its box: the wall right behind it takes a soft blob, not its box's outline.
  vec2 letter = clamp(p, -0.5 * uNeonHalf.xy, 0.5 * uNeonHalf.xy);
  // The border is a loop: a point inside it goes to its nearer side.
  vec2 border = clamp(p, -uNeonHalf.zw, uNeonHalf.zw);
  vec2 inset = uNeonHalf.zw - abs(border);
  if (inset.x < inset.y) border.x = p.x < 0.0 ? -uNeonHalf.z : uNeonHalf.z;
  else border.y = p.y < 0.0 ? -uNeonHalf.w : uNeonHalf.w;
  vec3 light = neonTube(position, normal, uNeon + uNeonRight * letter.x + uNeonUp * letter.y, uNeonRed)
    + neonTube(position, normal, uNeon + uNeonRight * border.x + uNeonUp * border.y, uNeonBlue);
  return albedo * light * (1.0 - smoothstep(1.0, 1.7, sqrt(distance2)));
}
`;
