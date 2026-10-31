import { type Material, Mesh, type Object3D } from 'three';

/**
 * The frame's alpha distinguishes a display (0) from the room (1), with normal MSAA coverage at its edge.
 * Keeping this in the existing draw preserves occlusion and follows the real screen through flights and hover.
 */
export class RoomScreens {
  private readonly screens = new Map<
    Material,
    { compile: Material['onBeforeCompile']; key: Material['customProgramCacheKey'] }
  >();
  private readonly bezelGlows = new Map<Material, boolean>();
  private active = false;

  attach(root: Object3D): void {
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials: Material[] = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        // The post-process already diffuses the real picture. The old fixed bezel quads would add a second,
        // detached rectangle, particularly while a prop bounces or the camera crosses its plane.
        if (material.userData.bezelGlow && !this.bezelGlows.has(material)) {
          this.bezelGlows.set(material, material.visible);
          material.visible &&= !this.active;
        }
        if (!object.userData.replaceable_screen || this.screens.has(material)) continue;
        const original = { compile: material.onBeforeCompile, key: material.customProgramCacheKey };
        const key = original.key.call(material);
        material.onBeforeCompile = (shader, renderer) => {
          original.compile.call(material, shader, renderer);
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <colorspace_fragment>',
            'gl_FragColor.a = 0.0;\n#include <colorspace_fragment>',
          );
        };
        material.customProgramCacheKey = () => `${key}|room-screen-mask`;
        material.needsUpdate = true;
        this.screens.set(material, original);
      }
    });
  }

  setActive(active: boolean): void {
    this.active = active;
    for (const [material, visible] of this.bezelGlows) material.visible = visible && !active;
  }

  dispose(): void {
    this.setActive(false);
    for (const [material, original] of this.screens) {
      material.onBeforeCompile = original.compile;
      material.customProgramCacheKey = original.key;
      material.needsUpdate = true;
    }
    this.screens.clear();
    this.bezelGlows.clear();
  }
}
