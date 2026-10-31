import {
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  OneFactor,
  type PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  SrcAlphaFactor,
  type Texture,
  Vector2,
  Vector3,
  type WebGLRenderer,
  ZeroFactor,
} from 'three';
import type { MoodFinish } from './moods';

const VERTEX = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;
attribute vec2 aSeed;
varying float vLight;
varying float vWindow;
void main() {
  vec3 p = position;
  float t = uTime * (0.7 + aSeed.x * 0.5);
  p.x += sin(t * 0.19 + aSeed.x * 31.0) * 0.11;
  p.z += cos(t * 0.16 + aSeed.x * 19.0) * 0.09;
  p.y += sin(t * 0.12 + aSeed.x * 47.0) * 0.14;
  float desk = length((p - vec3(-2.05, 1.03, -1.65)) / vec3(0.8, 0.8, 1.2));
  float lava = length((p - vec3(0.49, 1.28, -1.65)) / vec3(0.7, 0.9, 1.1));
  float window = length((p - vec3(-1.2, 1.6, -1.1)) / vec3(0.9, 0.9, 1.6));
  vLight = 0.07 + exp(-desk * desk * 1.8) * 0.8 + exp(-lava * lava * 1.8) * 0.7;
  vWindow = exp(-window * window * 1.5) * 0.42;
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * view;
  // Mostly fine motes, with a few gently out-of-focus flecks. Never a screen-sized foreground disc.
  gl_PointSize = clamp((4.5 + aSeed.y * aSeed.y * 10.0) / max(-view.z, 0.6), 1.1, 5.0) * uPixelRatio;
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uDepth;
uniform sampler2D uScene;
uniform vec2 uResolution;
uniform vec3 uTint;
uniform vec3 uWindowTint;
uniform float uAmount;
varying float vLight;
varying float vWindow;
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  // Use the real room depth, and exclude the actual TV/PC picture. Nothing drifts over a reader's text.
  if (gl_FragCoord.z > texture2D(uDepth, uv).r + 0.000001 || texture2D(uScene, uv).a < 0.5) discard;
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float fleck = exp(-r * r * 4.0) * (1.0 - smoothstep(0.65, 1.0, r));
  vec3 light = (uTint * vLight + uWindowTint * vWindow) * fleck * uAmount;
  gl_FragColor = vec4(light * 0.16, 1.0);
  #include <colorspace_fragment>
}
`;

/** One draw of world-space dust, depth-tested against the room and masked off its readable screens. */
export class RoomDust {
  private readonly scene = new Scene();
  private readonly geometry = new BufferGeometry();
  private readonly material: ShaderMaterial;

  constructor(depth: Texture, frame: Texture) {
    const positions: number[] = [];
    const seeds: number[] = [];
    let seed = 61;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 580; i++) {
      positions.push(-2.7 + random() * 4.3, 0.35 + random() * 2.2, -2.3 + random() * 3.2);
      seeds.push(random(), random());
    }
    this.geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    this.geometry.setAttribute('aSeed', new BufferAttribute(new Float32Array(seeds), 2));
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uDepth: { value: depth },
        uScene: { value: frame },
        uResolution: { value: new Vector2() },
        uTime: { value: 0 },
        uPixelRatio: { value: 1 },
        uTint: { value: new Vector3() },
        uWindowTint: { value: new Vector3() },
        uAmount: { value: 1 },
      },
      transparent: true,
      blending: CustomBlending,
      blendSrc: SrcAlphaFactor,
      blendDst: OneFactor,
      blendSrcAlpha: ZeroFactor,
      blendDstAlpha: OneFactor,
      depthTest: false,
      depthWrite: false,
    });
    const dust = new Points(this.geometry, this.material);
    dust.frustumCulled = false;
    this.scene.add(dust);
  }

  setFinish(finish: MoodFinish, amount: number): void {
    this.material.uniforms.uTint?.value.fromArray(finish.airTint);
    this.material.uniforms.uWindowTint?.value.fromArray(finish.windowTint);
    if (this.material.uniforms.uAmount) this.material.uniforms.uAmount.value = finish.dust * amount;
  }

  render(renderer: WebGLRenderer, camera: PerspectiveCamera, time: number): void {
    renderer.getDrawingBufferSize(this.material.uniforms.uResolution?.value);
    if (this.material.uniforms.uTime) this.material.uniforms.uTime.value = time;
    if (this.material.uniforms.uPixelRatio) this.material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      renderer.render(this.scene, camera);
    } finally {
      renderer.autoClear = autoClear;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
