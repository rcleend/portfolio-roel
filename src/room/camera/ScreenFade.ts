import { Mesh, PlaneGeometry, ShaderMaterial } from 'three';

/**
 * A full-viewport black veil drawn after everything else. Used for the reduced-motion
 * "cut" between viewpoints, where a camera flight would be uncomfortable.
 */
export class ScreenFade {
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;

  constructor() {
    const material = new ShaderMaterial({
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform float uOpacity; void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, uOpacity); }',
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new Mesh(new PlaneGeometry(2, 2), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = Number.MAX_SAFE_INTEGER;
    this.mesh.visible = false;
  }

  get opacity(): number {
    return this.mesh.visible ? (this.mesh.material.uniforms.uOpacity?.value as number) : 0;
  }

  set opacity(value: number) {
    const uniform = this.mesh.material.uniforms.uOpacity;
    if (uniform) uniform.value = value;
    this.mesh.visible = value > 0;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
