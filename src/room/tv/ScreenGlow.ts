import {
  AdditiveBlending,
  type Material,
  Matrix4,
  Mesh,
  type Object3D,
  PlaneGeometry,
  ShaderMaterial,
  type Texture,
  type Vector2,
  Vector3,
} from 'three';

/**
 * Light a screen spills into the room. The room is baked and unlit, so the spill is painted
 * on with additive quads lying on the surfaces around the screen. Their colour is the screen's
 * average colour, read on the GPU from the picture texture's smallest mip level: no pixel
 * readback, and the glow follows every game frame for free. Every screen shares this shader,
 * so a second screen's spill costs draw calls, never another program.
 */
export interface GlowPatch {
  /** Centre of the quad, slightly off the surface it lies on. */
  readonly centre: Vector3;
  /** World directions of the quad's local +X and +Y; the lit side faces right × up. */
  readonly right: Vector3;
  readonly up: Vector3;
  /** Quad width/height in metres (local X/Y). */
  readonly size: Vector2;
  /** The light source's footprint in quad-local metres: centre offset and half extents. */
  readonly emitterCentre: Vector2;
  readonly emitterHalfSize: Vector2;
  /** Distance over which the light falls off, in metres. */
  readonly falloff: number;
  readonly strength: number;
  /** Paint inside the emitter footprint too (false when the emitter itself covers it). */
  readonly fillEmitter: boolean;
}

const VERTEX = /* glsl */ `
varying vec2 vLocal;
uniform vec2 uSize;
void main() {
  vLocal = (uv - 0.5) * uSize;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uPicture;
uniform vec2 uSize;
uniform vec2 uEmitterCentre;
uniform vec2 uEmitterHalfSize;
uniform float uFalloff;
uniform float uStrength;
uniform float uLit;
uniform float uFillEmitter;
varying vec2 vLocal;

void main() {
  vec2 q = abs(vLocal - uEmitterCentre) - uEmitterHalfSize;
  float distance = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  float inside = step(distance, 0.0);
  float d = max(distance, 0.0) / uFalloff;
  float falloff = 1.0 / ((1.0 + d * d) * (1.0 + d * d));
  falloff *= mix(1.0, uFillEmitter, inside);
  // Fade to nothing at the quad border so no edge is ever visible.
  vec2 edge = smoothstep(uSize * 0.5, uSize * 0.44, abs(vLocal));
  falloff *= edge.x * edge.y;

  // Mean screen colour (1×1 mip), lifted towards white: phosphor light is less saturated
  // once diffused by a matte surface.
  vec3 mean = textureLod(uPicture, vec2(0.5), 12.0).rgb;
  vec3 tint = mix(mean, vec3(dot(mean, vec3(0.333))), 0.25);
  vec3 light = pow(max(tint, 0.0), vec3(1.0 / 2.2)) * falloff * uStrength * uLit;
  // The spill is only a few 8-bit steps bright; dither so it fades instead of banding.
  float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  light = max(light + (noise - 0.5) / 255.0 * step(0.0005, falloff), 0.0);
  gl_FragColor = vec4(light, 1.0);
}
`;

export class ScreenGlow {
  private readonly meshes: Mesh<PlaneGeometry, ShaderMaterial>[] = [];
  /** One uniform shared by every patch, so they all follow the same picture. */
  private readonly picture: { value: Texture };
  private lit = 0;

  constructor(parent: Object3D, picture: Texture, patches: readonly GlowPatch[]) {
    this.picture = { value: picture };
    for (const patch of patches) {
      const material = new ShaderMaterial({
        uniforms: {
          uPicture: this.picture,
          uSize: { value: patch.size.clone() },
          uEmitterCentre: { value: patch.emitterCentre.clone() },
          uEmitterHalfSize: { value: patch.emitterHalfSize.clone() },
          uFalloff: { value: patch.falloff },
          uStrength: { value: patch.strength },
          uLit: { value: 0 },
          uFillEmitter: { value: patch.fillEmitter ? 1 : 0 },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        // Pull the quad towards the camera in depth so it never z-fights the baked surface.
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -8,
      });
      const mesh = new Mesh(new PlaneGeometry(patch.size.x, patch.size.y), material);
      mesh.name = 'ScreenGlow';
      const normal = new Vector3().crossVectors(patch.right, patch.up);
      mesh.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(patch.right, patch.up, normal));
      mesh.position.copy(patch.centre);
      mesh.renderOrder = 10;
      mesh.visible = false;
      parent.add(mesh);
      this.meshes.push(mesh);
    }
  }

  /** The texture whose mean colour (its 1 × 1 mip) tints the light, e.g. a 1 × 1 override colour. */
  setPicture(picture: Texture): void {
    this.picture.value = picture;
  }

  /** Moves patch `index`'s light source, in the quad's local metres, e.g. after the viewpoint changed. */
  setEmitter(index: number, centre: Vector2, halfSize: Vector2): void {
    const uniforms = this.meshes[index]?.material.uniforms;
    uniforms?.uEmitterCentre?.value.copy(centre);
    uniforms?.uEmitterHalfSize?.value.copy(halfSize);
  }

  /** 0–1 light output of the tube (power state × brightness). */
  setLit(lit: number): void {
    if (lit === this.lit) return;
    this.lit = lit;
    for (const mesh of this.meshes) {
      const uniform = mesh.material.uniforms.uLit;
      if (uniform) uniform.value = lit;
      mesh.visible = lit > 0.001;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      (mesh.material as Material).dispose();
    }
    this.meshes.length = 0;
  }
}
