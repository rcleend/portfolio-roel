import {
  CustomBlending,
  Mesh,
  OneFactor,
  PlaneGeometry,
  type Scene,
  ShaderMaterial,
  SrcAlphaFactor,
  Vector3,
  ZeroFactor,
} from 'three';
import type { MoodFinish } from './moods';

const VERTEX = /* glsl */ `
varying vec2 vLocal;
uniform float uRadius;
void main() {
  vLocal = position.xy;
  vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  // Billboards sit at the actual lamp depth, so furniture can occlude the glow.
  gl_Position = projectionMatrix * (center + vec4(position.xy * uRadius, 0.0, 0.0));
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uTint;
uniform float uStrength;
varying vec2 vLocal;
void main() {
  float r = dot(vLocal, vLocal);
  float halo = exp(-r * 7.0) * (1.0 - smoothstep(0.25, 1.0, r));
  gl_FragColor = vec4(uTint * halo * uStrength, 1.0);
  #include <colorspace_fragment>
}
`;

/** A little warm air around each practical. Fixed in the room, depth tested, and never animated. */
export class RoomHalation {
  private readonly geometry = new PlaneGeometry(2, 2);
  private readonly tint = { value: new Vector3(1, 0.24, 0.055) };
  private readonly strength = { value: 0 };
  private readonly lamps = [this.lamp([0.49, 1.28, -1.92], 0.75), this.lamp([-2.05, 1.03, -1.78], 0.62)];
  private finish: MoodFinish | null = null;

  private lamp(
    position: readonly [number, number, number],
    radius: number,
    tint?: readonly [number, number, number],
  ): Mesh<PlaneGeometry, ShaderMaterial> {
    const material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTint: tint ? { value: new Vector3().fromArray(tint) } : this.tint,
        uStrength: this.strength,
        uRadius: { value: radius },
      },
      transparent: true,
      blending: CustomBlending,
      blendSrc: SrcAlphaFactor,
      blendDst: OneFactor,
      blendSrcAlpha: ZeroFactor,
      blendDstAlpha: OneFactor,
      depthWrite: false,
    });
    const lamp = new Mesh(this.geometry, material);
    lamp.name = 'Practical light halation';
    lamp.position.fromArray(position);
    lamp.frustumCulled = false;
    lamp.renderOrder = 12;
    return lamp;
  }

  /**
   * Another practical, before attach: the opal lamp beside the TV (tvLamp.ts), smaller than the room's own lamps, or
   * one of the toy robot's eyes (toyRobot.ts), a small round glow of its own `tint` rather than the finish's warm one.
   */
  addLamp(position: readonly [number, number, number], radius: number, tint?: readonly [number, number, number]): void {
    const lamp = this.lamp(position, radius, tint);
    lamp.visible = this.finish !== null;
    this.lamps.push(lamp);
  }

  attach(scene: Scene): void {
    for (const lamp of this.lamps) if (!lamp.parent) scene.add(lamp);
  }

  setFinish(finish: MoodFinish | null): void {
    this.finish = finish;
    this.strength.value = finish ? 0.115 * finish.warmth : 0;
    if (finish) this.tint.value.set(1, 0.24 * finish.bloomTint[1], 0.12 * finish.bloomTint[2]);
    for (const lamp of this.lamps) lamp.visible = finish !== null;
  }

  dispose(): void {
    for (const lamp of this.lamps) {
      lamp.removeFromParent();
      lamp.material.dispose();
    }
    this.geometry.dispose();
  }
}
