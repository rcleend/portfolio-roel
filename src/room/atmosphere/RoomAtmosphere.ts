import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  DepthTexture,
  Frustum,
  HalfFloatType,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  type PerspectiveCamera,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  UnsignedIntType,
  Vector2,
  Vector3,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import type { RenderLoop } from '../stage/RenderLoop';
import { createScreenLightUniforms, SCREEN_LIGHT, type ScreenLightUniforms } from '../tv/screenLight';
import { AirMotion } from './AirMotion';
import { ROOM_MOODS, type RoomAir, type RoomMood, SCREEN_FINISH_STRENGTH } from './moods';
import { RoomDust } from './RoomDust';
import { RoomGloss } from './RoomGloss';
import { RoomHalation } from './RoomHalation';
import { RoomScreens } from './RoomScreens';
import {
  attachToyRobot,
  createToyRobotUniforms,
  TOY_ROBOT_EYE_HALO,
  TOY_ROBOT_EYE_INTENSITY,
  type ToyRobotLight,
} from './toyRobot';
import { attachTvLamp, createTvLampUniforms, TV_LAMP_INTENSITY } from './tvLamp';
import { lightningAt, WINDOW_RAIN } from './WindowRain';

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * The TV's picture as a light (screenLight.ts): its radiance against its displayed values (three times: the tube
 * outshines the dim baked room more than an 8-bit display can show), and the haze's scattering of it per unit of the
 * finish's haze.
 */
const SCREEN_LIGHT_GAIN = 3;
const SCREEN_AIR = 0.08;
/** The toy robot's eye halos: the lamp's colour × this, against the room lamps' warm halation tint (about 1). */
const EYE_HALO_TINT = 0.8;

const HIGHLIGHTS = /* glsl */ `
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform vec3 uBloomTint;
varying vec2 vUv;
void main() {
  vec4 color = (texture2D(uScene, vUv + uTexel * vec2(-0.5, -0.5))
    + texture2D(uScene, vUv + uTexel * vec2(0.5, -0.5))
    + texture2D(uScene, vUv + uTexel * vec2(-0.5, 0.5))
    + texture2D(uScene, vUv + uTexel * vec2(0.5, 0.5))) * 0.25;
  float brightness = max(max(color.r, color.g), color.b);
  // Soft-knee extraction: the lamp and reflected light bloom, black corners never fog over. A display (alpha 0) is light
  // of its own colour: only its brightest pixels glare, faintly and untinted by the warm bloom, so no veil of the
  // picture's mean colour settles over the set around it; its light reaches the room as light (screenLight.ts).
  vec3 glare = color.rgb / uBloomTint * smoothstep(0.65, 1.3, brightness) * 0.15;
  gl_FragColor = vec4(mix(glare, color.rgb * smoothstep(0.16, 0.7, brightness), color.a), 1.0);
}
`;

const COMPOSITE = /* glsl */ `
uniform sampler2D uScene;
uniform sampler2D uHighlights;
uniform sampler2D uDepth;
uniform mat4 uProjectionInverse;
uniform mat4 uCameraWorld;
uniform vec2 uBloomTexel;
uniform vec3 uShadows;
uniform vec3 uLights;
uniform vec3 uBloomTint;
uniform vec3 uAirTint;
uniform vec3 uWindowTint;
uniform float uHaze;
uniform float uExposure;
uniform float uSaturation;
uniform float uBloom;
uniform float uDiffusion;
uniform float uVignette;
uniform vec3 uTvLamp;
uniform vec3 uTvLampColor;
varying vec2 vUv;
${WINDOW_RAIN}
${SCREEN_LIGHT}

vec3 blur(float level) {
  vec2 stepSize = uBloomTexel * exp2(level) * 0.65;
  return textureLod(uHighlights, vUv, level).rgb * 0.2
    + (textureLod(uHighlights, vUv + vec2(stepSize.x, stepSize.y), level).rgb
    + textureLod(uHighlights, vUv + vec2(-stepSize.x, stepSize.y), level).rgb
    + textureLod(uHighlights, vUv + vec2(stepSize.x, -stepSize.y), level).rgb
    + textureLod(uHighlights, vUv - stepSize, level).rgb) * 0.2;
}

// Integrate a soft ellipsoid of illuminated air along the view ray, ending at the first real surface.
// An analytic integral keeps the light smooth in flights without ray-march steps, noise or temporal history.
float density(vec3 origin, vec3 ray, float reach, vec3 center, vec3 scale, float tilt) {
  vec3 q = origin - center;
  q.y += q.z * tilt;
  ray.y += ray.z * tilt;
  q /= scale;
  ray /= scale;
  float a = dot(ray, ray);
  float b = dot(q, ray);
  float closest = -b / a;
  float radius = inversesqrt(a);
  float perpendicular = max(0.0, dot(q, q) - b * b / a);
  vec2 ends = vec2(-closest, reach - closest) / radius;
  vec2 integral = ends / sqrt(1.0 + ends * ends);
  return exp(-perpendicular * 2.0) * radius * max(0.0, integral.y - integral.x) * 0.5;
}

void main() {
  vec4 scene = texture2D(uScene, vUv);
  vec4 view = uProjectionInverse * vec4(vUv * 2.0 - 1.0, texture2D(uDepth, vUv).r * 2.0 - 1.0, 1.0);
  vec3 world = (uCameraWorld * vec4(view.xyz / view.w, 1.0)).xyz;
  vec3 eye = uCameraWorld[3].xyz;
  vec3 ray = normalize(world - eye);
  float reach = length(world - eye);
  vec3 original = scene.a > 0.95 ? wetWindow(scene.rgb, eye, ray, reach) : scene.rgb;
  vec3 color = original;
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  // Split-tone in linear light. No lifted grey blacks and no second tone mapping of the Blender bake.
  color *= mix(uShadows, uLights, smoothstep(0.015, 0.35, luminance));
  color = mix(vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), color, uSaturation) * uExposure;
  // Text and game graphics keep their contrast, without a second layer of bloom over the CRT's own finish.
  vec3 display = mix(original, color, ${SCREEN_FINISH_STRENGTH});
  vec3 closeGlow = blur(1.4);
  vec3 halo = blur(3.3);
  vec3 haze = blur(5.2);
  // A diffusion filter wraps highlights while retaining the sharp underlying picture.
  color += (closeGlow * 0.18 + halo * 0.4 + haze * 0.25) * uBloomTint * uBloom;
  color = mix(color, color * 0.88 + (halo + haze) * uBloomTint * 0.22, uDiffusion);
  vec2 edge = (vUv - 0.5) * vec2(1.18, 1.0);
  color *= 1.0 - smoothstep(0.1, 0.69, dot(edge, edge)) * uVignette;
  float deskAir = density(eye, ray, reach, vec3(-2.05, 1.0, -1.65), vec3(0.72, 0.78, 0.95), 0.0);
  float lampAir = density(eye, ray, reach, vec3(0.49, 1.22, -1.65), vec3(0.7, 1.0, 0.85), 0.0);
  float windowAir = density(eye, ray, reach, vec3(-1.15, 1.25, -0.95), vec3(0.95, 0.55, 1.7), 0.42);
  // The opal lamp beside the TV (tvLamp.ts) warms a small volume of air around its globe.
  float opalAir = uTvLampColor.r > 0.0
    ? density(eye, ray, reach, uTvLamp + vec3(0.0, 0.06, 0.0), vec3(0.4, 0.45, 0.4), 0.0) : 0.0;
  color += uWindowTint * windowAir * uLightning * 0.24;
  color += (uAirTint * (deskAir + lampAir * 0.8 + opalAir * 0.6) + uWindowTint * windowAir * 0.42) * uHaze;
  // The TV lights the air in front of it in its picture's colour: a cone, brightest along its axis, never a halo.
  color += screenAir(eye, ray, reach) * uHaze * ${SCREEN_AIR};
  gl_FragColor = vec4(mix(display, color, scene.a), 1.0);
  #include <colorspace_fragment>
  // Fixed film grain is also dither; it never animates or schedules another frame.
  float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
  gl_FragColor.rgb += grain / 255.0;
}
`;

/** Two post passes over one room render, followed by one draw of fine dust. No additional assets or scene renders. */
export class RoomAtmosphere {
  private readonly frame: WebGLRenderTarget;
  private readonly highlights: WebGLRenderTarget;
  private readonly passScene = new Scene();
  private readonly geometry = new BufferGeometry();
  private readonly extract: ShaderMaterial;
  private readonly composite: ShaderMaterial;
  private readonly quad: Mesh<BufferGeometry, ShaderMaterial>;
  /** The TV's light: the set's own uniforms once attached (Television), scaled by the finish's gain. */
  private readonly screenLight: ScreenLightUniforms & { uScreenGain: { value: number } } = {
    ...createScreenLightUniforms(),
    uScreenGain: { value: 0 },
  };
  /** The opal lamp beside the TV (tvLamp.ts): its light on the room and in the air, while the room has one. */
  private readonly lamp = createTvLampUniforms();
  private lampColor: readonly [number, number, number] | null = null;
  /** The toy robot on the cabinet's other end (toyRobot.ts): its eyes' light on the room, while the room has one. */
  private readonly robot = createToyRobotUniforms();
  private robotLight: ToyRobotLight | null = null;
  private readonly gloss = new RoomGloss(this.screenLight, this.lamp, this.robot);
  private readonly halation = new RoomHalation();
  private readonly screens = new RoomScreens();
  private readonly size = new Vector2();
  private readonly dust: RoomDust;
  private readonly motion: AirMotion;
  private air: RoomAir = { haze: 1, dust: 1 };
  private atTv = true;
  lightning = 0;
  private windowInView = true;
  private readonly frustum = new Frustum();
  private readonly windowBounds = new Box3(new Vector3(-2.1, 1.13, -2.44), new Vector3(-0.5, 2.5, -2.42));
  private mood: RoomMood = 'original';

  constructor(
    private readonly renderer: WebGLRenderer,
    loop: RenderLoop,
    visible: () => boolean,
  ) {
    const type = renderer.extensions.has('EXT_color_buffer_float') ? HalfFloatType : UnsignedByteType;
    this.frame = new WebGLRenderTarget(1, 1, { type, samples: 2 });
    this.frame.depthTexture = new DepthTexture(1, 1, UnsignedIntType);
    this.dust = new RoomDust(this.frame.depthTexture, this.frame.texture);
    this.motion = new AirMotion(loop, () => visible() && !this.atTv && (this.air.dust > 0 || this.windowInView));
    this.highlights = new WebGLRenderTarget(1, 1, {
      type,
      depthBuffer: false,
      minFilter: LinearMipmapLinearFilter,
      generateMipmaps: true,
    });
    const bloomTint = { value: new Vector3() };
    this.extract = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: HIGHLIGHTS,
      uniforms: { uScene: { value: this.frame.texture }, uTexel: { value: new Vector2() }, uBloomTint: bloomTint },
      depthTest: false,
      depthWrite: false,
    });
    this.composite = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: COMPOSITE,
      uniforms: {
        uScene: { value: this.frame.texture },
        uHighlights: { value: this.highlights.texture },
        uDepth: { value: this.frame.depthTexture },
        uProjectionInverse: { value: new Matrix4() },
        uCameraWorld: { value: new Matrix4() },
        uViewProjection: { value: new Matrix4() },
        uExterior: { value: null },
        uLightning: { value: 0 },
        uRainTime: { value: 0 },
        uBloomTexel: { value: new Vector2() },
        uShadows: { value: new Vector3() },
        uLights: { value: new Vector3() },
        uBloomTint: bloomTint,
        uAirTint: { value: new Vector3() },
        uWindowTint: { value: new Vector3() },
        uHaze: { value: 0 },
        uExposure: { value: 1 },
        uSaturation: { value: 1 },
        uBloom: { value: 0 },
        uDiffusion: { value: 0 },
        uVignette: { value: 0 },
        ...this.screenLight,
        ...this.lamp,
      },
      depthTest: false,
      depthWrite: false,
    });
    this.geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new Mesh(this.geometry, this.extract);
    this.quad.frustumCulled = false;
    this.passScene.add(this.quad);
  }

  attach(scene: Scene): void {
    scene.traverse((object) => {
      if (object.userData.screenLight) {
        Object.assign(this.screenLight, object.userData.screenLight);
        Object.assign(this.composite.uniforms, object.userData.screenLight);
      }
      if (
        object.userData.exterior &&
        object instanceof Mesh &&
        object.material instanceof MeshBasicMaterial &&
        this.composite.uniforms.uExterior
      )
        this.composite.uniforms.uExterior.value = object.material.map;
    });
    const lamp = this.lampColor ? null : attachTvLamp(scene, this.lamp);
    if (lamp) {
      this.lampColor = lamp.color;
      this.halation.addLamp(lamp.center, 0.32);
    }
    const robot = this.robotLight ? null : attachToyRobot(scene, this.robot);
    if (robot) {
      this.robotLight = robot;
      const tint = robot.color.map((value) => value * EYE_HALO_TINT) as [number, number, number];
      for (const eye of robot.eyes) this.halation.addLamp(eye, TOY_ROBOT_EYE_HALO, tint);
    }
    this.applyLamp();
    this.gloss.attach(scene);
    this.halation.attach(scene);
    this.screens.attach(scene);
  }

  /** Compiles `object`'s materials for the target this finish draws the room into (the screen for the bake). */
  prepare(scene: Scene, object: Object3D, camera: PerspectiveCamera): void {
    const previous = this.renderer.getRenderTarget();
    if (this.mood !== 'original') this.renderer.setRenderTarget(this.frame);
    this.renderer.compile(object, camera, scene);
    this.renderer.setRenderTarget(previous);
  }

  setMood(mood: RoomMood): void {
    this.mood = mood;
    const finish = mood === 'original' ? null : ROOM_MOODS[mood].finish;
    this.gloss.setFinish(finish);
    this.halation.setFinish(finish);
    this.screens.setActive(finish !== null);
    this.screenLight.uScreenGain.value = finish ? SCREEN_LIGHT_GAIN : 0;
    this.applyLamp();
    this.motion.setSpeed(finish ? 1 : 0);
    if (!finish) return;
    this.dust.setFinish(finish, this.air.dust);
    const u = this.composite.uniforms;
    u.uShadows?.value.fromArray(finish.shadows);
    u.uLights?.value.fromArray(finish.highlights);
    u.uBloomTint?.value.fromArray(finish.bloomTint);
    u.uAirTint?.value.fromArray(finish.airTint);
    u.uWindowTint?.value.fromArray(finish.windowTint);
    for (const [key, value] of Object.entries({
      uExposure: finish.exposure,
      uSaturation: finish.saturation,
      uBloom: finish.bloom,
      uDiffusion: finish.diffusion,
      uVignette: finish.vignette,
      uHaze: finish.haze * this.air.haze,
    })) {
      const uniform = u[key];
      if (uniform) uniform.value = value;
    }
  }

  /** The lamp and the robot's eyes light the room only in a finish: the unprocessed bake (original) shows it as baked. */
  private applyLamp(): void {
    const color = this.lamp.uTvLampColor.value;
    if (this.lampColor && this.mood !== 'original') color.fromArray(this.lampColor).multiplyScalar(TV_LAMP_INTENSITY);
    else color.set(0, 0, 0);
    const eyes = this.robot.uRobotEyeColor.value;
    if (this.robotLight && this.mood !== 'original')
      eyes.fromArray(this.robotLight.color).multiplyScalar(TOY_ROBOT_EYE_INTENSITY);
    else eyes.set(0, 0, 0);
  }

  setAir(air: RoomAir): void {
    this.air = air;
    this.setMood(this.mood);
  }

  setAtTv(atTv: boolean): void {
    this.atTv = atTv;
    this.motion.sync();
  }

  syncMotion(): void {
    this.motion.sync();
  }

  render(scene: Scene, camera: PerspectiveCamera): void {
    const renderer = this.renderer;
    if (this.mood === 'original') {
      renderer.render(scene, camera);
      return;
    }
    renderer.getDrawingBufferSize(this.size);
    if (this.frame.width !== this.size.x || this.frame.height !== this.size.y) {
      this.frame.setSize(this.size.x, this.size.y);
      // Quarter-resolution highlights cap memory and fill cost; mip levels provide the broad halation.
      this.highlights.setSize(Math.max(1, Math.ceil(this.size.x / 4)), Math.max(1, Math.ceil(this.size.y / 4)));
      this.extract.uniforms.uTexel?.value.set(1 / this.size.x, 1 / this.size.y);
      this.composite.uniforms.uBloomTexel?.value.set(1 / this.highlights.width, 1 / this.highlights.height);
    }
    const previous = renderer.getRenderTarget();
    const autoReset = renderer.info.autoReset;
    renderer.info.autoReset = false;
    renderer.info.reset();
    try {
      const time = this.motion.time;
      const flash = this.motion.reduced || this.atTv ? 0 : lightningAt(time);
      this.lightning = flash;
      this.gloss.setLightning(flash);
      if (this.composite.uniforms.uRainTime) this.composite.uniforms.uRainTime.value = time;
      if (this.composite.uniforms.uLightning) this.composite.uniforms.uLightning.value = flash;
      renderer.setRenderTarget(this.frame);
      renderer.render(scene, camera);
      this.composite.uniforms.uProjectionInverse?.value.copy(camera.projectionMatrixInverse);
      this.composite.uniforms.uCameraWorld?.value.copy(camera.matrixWorld);
      this.composite.uniforms.uViewProjection?.value.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      this.frustum.setFromProjectionMatrix(this.composite.uniforms.uViewProjection?.value);
      this.windowInView = this.frustum.intersectsBox(this.windowBounds);
      this.motion.sync();
      this.quad.material = this.extract;
      renderer.setRenderTarget(this.highlights);
      renderer.render(this.passScene, camera);
      this.quad.material = this.composite;
      renderer.setRenderTarget(previous);
      renderer.render(this.passScene, camera);
      if (this.air.dust > 0) this.dust.render(renderer, camera, time * ROOM_MOODS[this.mood].finish.drift);
    } finally {
      renderer.setRenderTarget(previous);
      renderer.info.autoReset = autoReset;
    }
  }

  dispose(): void {
    this.motion.dispose();
    this.dust.dispose();
    this.gloss.dispose();
    this.halation.dispose();
    this.screens.dispose();
    this.frame.dispose();
    this.highlights.dispose();
    this.extract.dispose();
    this.composite.dispose();
    this.geometry.dispose();
  }
}
