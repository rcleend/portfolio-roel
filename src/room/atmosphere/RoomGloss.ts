import { type Material, Mesh, type MeshBasicMaterial, type Object3D } from 'three';
import { SCREEN_LIGHT, type ScreenLightUniforms } from '../tv/screenLight';
import type { MoodFinish } from './moods';
import { NEON_SIGN_LIGHT, type NeonSignUniforms } from './neonSign';
import { TV_LAMP_LIGHT, type TvLampUniforms } from './tvLamp';

/**
 * Satin surfaces that mirror the TV's picture, on top of the diffuse light every surface takes from it: the set's own
 * plastic, whose inner lip shows a blurred band of the picture's edge as on a real set. (Everything else that faces the
 * picture is matte or, like the cabinet's faces, never turns its mirror ray towards it.)
 */
const SHEEN: Readonly<Record<string, number>> = { device_tv_front_BAKED_UNLIT: 1 };

/** Only varnished hard surfaces catch reflections. Cloth, paper, the screens and walls stay matte. */
const VARNISH: Readonly<Record<string, number>> = {
  '03_Room_floor_BAKED_UNLIT': 1,
  '02_Desk_surfaces_BAKED_UNLIT': 0.32,
  '04_Drawer_surfaces_BAKED_UNLIT': 0.45,
  '01_TV_surfaces_BAKED_UNLIT': 0.4,
  '04_Drawer_guitar_BAKED_UNLIT': 0.6,
};

const VERTEX_DECLARATIONS = /* glsl */ `
varying vec3 vFinishPosition;
varying vec3 vFinishNormal;
`;

const FRAGMENT_DECLARATIONS = /* glsl */ `
varying vec3 vFinishPosition;
varying vec3 vFinishNormal;
uniform float uVarnish;
uniform float uSheen;
uniform float uWarmth;
uniform float uStorm;
${SCREEN_LIGHT}
${TV_LAMP_LIGHT}
${NEON_SIGN_LIGHT}

// Broad, view-dependent reflections of the existing practicals, with no second scene render.
float reflection(vec3 source, vec3 normal, vec3 view, float tightness) {
  vec3 toLight = source - vFinishPosition;
  vec3 light = normalize(toLight);
  vec3 halfway = normalize(light + view);
  return pow(max(dot(normal, halfway), 0.0), tightness)
    * max(dot(normal, light), 0.0) / (1.0 + dot(toLight, toLight) * 0.18);
}
`;

const FINISH = /* glsl */ `
vec3 finishNormal = normalize(vFinishNormal);
vec3 finishView = normalize(cameraPosition - vFinishPosition);
float lavaDistance = length(vFinishPosition - vec3(0.49, 1.28, -1.97));
float deskDistance = length(vFinishPosition - vec3(-2.05, 1.03, -1.88));
float pool = exp(-lavaDistance * lavaDistance * 0.85) + exp(-deskDistance * deskDistance * 1.8) * 0.65;
// Multiply the baked light, retaining its contact shadows and occlusion.
outgoingLight *= vec3(1.0) + vec3(0.9, 0.26, 0.025) * pool * uWarmth;
// A broad storm outside the opening. Project the incoming light onto the real pane, so the blind/sash
// bands fall across the floor and desk. A soft indirect bounce reaches the rest of the room.
if (uStorm > 0.001) {
  vec3 towardWindow = normalize(vec3(-0.16, 0.42, -1.0));
  float travel = (-2.43 - vFinishPosition.z) / towardWindow.z;
  vec3 pane = vFinishPosition + towardWindow * travel;
  float opening = smoothstep(-2.16, -2.06, pane.x) * (1.0 - smoothstep(-0.54, -0.44, pane.x))
    * smoothstep(1.07, 1.16, pane.y) * (1.0 - smoothstep(2.47, 2.55, pane.y));
  float sash = smoothstep(0.012, 0.038, abs(pane.x + 1.29))
    * smoothstep(0.012, 0.035, abs(pane.y - 1.65));
  float slats = mix(1.0, 0.16 + 0.30 * smoothstep(0.27, 0.47, abs(fract(pane.y / 0.04) - 0.5)),
    smoothstep(1.77, 1.82, pane.y));
  float facing = max(dot(finishNormal, towardWindow), 0.0);
  float falloff = exp(-max(travel, 0.0) * 0.16);
  float direct = opening * sash * slats * facing * falloff * step(0.0, travel);
  float bounce = exp(-distance(vFinishPosition, vec3(-1.3, 1.65, -2.43)) * 0.27) * 0.21;
  // The baked map retains all its contact shadows and printed/textile detail in the flash.
  outgoingLight += diffuseColor.rgb * vec3(1.8, 2.35, 3.5) * uStorm * (direct * 3.2 + bounce);
}
float amber = reflection(vec3(0.49, 1.28, -1.97), finishNormal, finishView, 24.0);
float desk = reflection(vec3(-2.05, 1.03, -1.88), finishNormal, finishView, 32.0);
float window = reflection(vec3(-1.3, 2.1, -2.55), finishNormal, finishView, 42.0);
float opal = uTvLampColor.r > 0.0 ? reflection(uTvLamp, finishNormal, finishView, 32.0) : 0.0;
// Grain and baked shadow modulate the polish: no shiny rug, no mirror-white floor.
float bakedLight = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
float grain = smoothstep(0.005, 0.19, bakedLight);
float fresnel = 0.35 + 0.65 * pow(1.0 - max(dot(finishNormal, finishView), 0.0), 3.0);
outgoingLight += uVarnish * grain * fresnel * (vec3(0.8, 0.29, 0.055) * (amber + desk * 0.65 + opal * 0.5)
  + vec3(0.24, 0.32, 0.52) * window * 0.38);
// The TV's picture lights what faces it. The bake stands in for each surface's albedo: it is that colour under the
// room's dim night light, about 4 % of full light where the TV stands.
vec3 albedo = min(diffuseColor.rgb * 25.0, vec3(0.85));
outgoingLight += screenLight(vFinishPosition, finishNormal, finishView, albedo, uSheen);
// So does the opal lamp beside it (tvLamp.ts), past the set and the cabinet that shadow it.
outgoingLight += tvLampLight(vFinishPosition, finishNormal, albedo);
// And the neon sign on the cabinet's other end (neonSign.ts), on everything but light itself (its tubes, the globe).
if (max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) <= 1.0)
  outgoingLight += neonSignLight(vFinishPosition, finishNormal, albedo);
`;

/** Extends the existing unlit program, retaining the bake and each material's identity for the prop spotlight. */
export class RoomGloss {
  private readonly materials = new Map<
    MeshBasicMaterial,
    { compile: Material['onBeforeCompile']; key: Material['customProgramCacheKey']; varnish: { value: number } }
  >();
  private readonly warmth = { value: 0 };
  private readonly storm = { value: 0 };
  private finish: MoodFinish | null = null;

  /** `screen`, `lamp` and `neon`: the TV's, the opal lamp's and the neon sign's light (RoomAtmosphere owns them). */
  constructor(
    private readonly screen: ScreenLightUniforms,
    private readonly lamp: TvLampUniforms,
    private readonly neon: NeonSignUniforms,
  ) {}

  attach(root: Object3D): void {
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        const basic = material as MeshBasicMaterial;
        if (!basic.isMeshBasicMaterial || !basic.name.endsWith('_BAKED_UNLIT') || this.materials.has(basic)) continue;
        const original = { compile: basic.onBeforeCompile, key: basic.customProgramCacheKey };
        const varnish = { value: (this.finish?.gloss ?? 0) * (VARNISH[basic.name] ?? 0) };
        basic.onBeforeCompile = (shader, renderer) => {
          original.compile.call(basic, shader, renderer);
          shader.uniforms.uVarnish = varnish;
          shader.uniforms.uSheen = { value: SHEEN[basic.name] ?? 0 };
          shader.uniforms.uWarmth = this.warmth;
          shader.uniforms.uStorm = this.storm;
          Object.assign(shader.uniforms, this.screen, this.lamp, this.neon);
          shader.vertexShader =
            VERTEX_DECLARATIONS +
            shader.vertexShader.replace(
              '#include <project_vertex>',
              `#include <project_vertex>
            vFinishPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
            vFinishNormal = normalize(mat3(modelMatrix) * normal);`,
            );
          shader.fragmentShader =
            FRAGMENT_DECLARATIONS +
            shader.fragmentShader.replace('#include <opaque_fragment>', `${FINISH}\n#include <opaque_fragment>`);
        };
        basic.customProgramCacheKey = () => 'room-varnish-v1';
        basic.needsUpdate = true;
        this.materials.set(basic, { ...original, varnish });
      }
    });
  }

  setLightning(value: number): void {
    this.storm.value = value;
  }

  setFinish(finish: MoodFinish | null): void {
    this.finish = finish;
    if (!finish) this.storm.value = 0;
    this.warmth.value = finish?.warmth ?? 0;
    for (const [material, { varnish }] of this.materials)
      varnish.value = (finish?.gloss ?? 0) * (VARNISH[material.name] ?? 0);
  }

  dispose(): void {
    for (const [material, original] of this.materials) {
      material.onBeforeCompile = original.compile;
      material.customProgramCacheKey = original.key;
      material.needsUpdate = true;
    }
    this.materials.clear();
  }
}
