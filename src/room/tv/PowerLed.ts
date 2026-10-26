import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  ShaderMaterial,
  type Vector3,
} from 'three';
import type { RenderLoop } from '../stage/RenderLoop';

export interface PowerLedPlacement {
  /** World position on the TV's front panel. */
  readonly position: Vector3;
  /** Direction the panel faces. */
  readonly facing: Vector3;
}

/** The TV's lens and halo; another device may mount a smaller LED. */
const LED_RADIUS = 0.0024;
const HALO_RADIUS = 0.016;
/** How far the halo floats in front of the TV's lens. */
const HALO_LIFT = 0.0008;

export interface PowerLedSize {
  /** Radius of the emissive lens (m). */
  readonly lensRadius: number;
  /** Radius of the additive halo around it (m). */
  readonly haloRadius: number;
}
const OFF_COLOR = new Color('#2b0b08');
const ON_COLOR = new Color('#ff4a2e');
const RAMP_UP_MS = 70;
const RAMP_DOWN_MS = 260;

const HALO_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const HALO_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uLevel;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float glow = exp(-r * r * 9.0) * 0.9 + exp(-r * r * 60.0) * 0.6;
  gl_FragColor = vec4(uColor * glow * uLevel, 1.0);
}
`;

/**
 * A device's power indicator: a tiny emissive lens with a soft additive halo. The TV asset has no LED of its own,
 * so one is mounted on its front panel next to the power button; the radio lights its painted OPR lamp with one.
 */
export class PowerLed {
  private readonly group = new Group();
  private readonly lens: Mesh<CircleGeometry, MeshBasicMaterial>;
  private readonly halo: Mesh<CircleGeometry, ShaderMaterial>;
  private level = 0;
  private stopRamp: (() => void) | null = null;

  constructor(
    parent: Object3D,
    placement: PowerLedPlacement,
    private readonly loop: Pick<RenderLoop, 'animate'>,
    size: PowerLedSize = { lensRadius: LED_RADIUS, haloRadius: HALO_RADIUS },
  ) {
    this.lens = new Mesh(new CircleGeometry(size.lensRadius, 16), new MeshBasicMaterial({ color: OFF_COLOR.clone() }));
    this.halo = new Mesh(
      new CircleGeometry(size.haloRadius, 24),
      new ShaderMaterial({
        uniforms: { uColor: { value: ON_COLOR.clone() }, uLevel: { value: 0 } },
        vertexShader: HALO_VERTEX,
        fragmentShader: HALO_FRAGMENT,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    // Just proud of the lens, scaled with it.
    this.halo.position.z = HALO_LIFT * (size.lensRadius / LED_RADIUS);
    this.halo.visible = false;
    this.group.add(this.lens, this.halo);
    this.group.name = 'PowerLed';
    this.group.position.copy(placement.position);
    this.group.lookAt(placement.position.clone().add(placement.facing));
    parent.add(this.group);
  }

  /** Fades the LED towards on (1) or off (0). */
  set(on: boolean): void {
    const from = this.level;
    const to = on ? 1 : 0;
    if (from === to) return;
    this.stopRamp?.();
    const duration = on ? RAMP_UP_MS : RAMP_DOWN_MS;
    let start: number | null = null;
    this.stopRamp = this.loop.animate((now) => {
      start ??= now;
      const t = Math.min(1, (now - start) / duration);
      this.apply(from + (to - from) * t);
      if (t < 1) return true;
      this.stopRamp = null;
      return false;
    });
  }

  dispose(): void {
    this.stopRamp?.();
    this.group.removeFromParent();
    this.lens.geometry.dispose();
    this.lens.material.dispose();
    this.halo.geometry.dispose();
    this.halo.material.dispose();
  }

  private apply(level: number): void {
    this.level = level;
    this.lens.material.color.copy(OFF_COLOR).lerp(ON_COLOR, level);
    const uniform = this.halo.material.uniforms.uLevel;
    if (uniform) uniform.value = level;
    this.halo.visible = level > 0.001;
  }
}
