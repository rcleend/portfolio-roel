// Types only: three.js arrives through the GenKit (genKit.ts).
import type { BufferAttribute, Camera, Mesh } from 'three';
import type { GenKit } from './genKit';
import type { MeshData } from './kit/builder';
import { createWaxPose, LAVA, poseWax, WAX, waxIndices, waxPositions } from './props/lavaWax';

/** The frames a second a moving lamp needs when nothing else is drawn: its wax moves a pixel in a second. */
export const LAVA_FRAMES = 12;
/** The least time between two poses (s): a blob moves a centimetre a second at its fastest. */
const POSE_SECONDS = 0.03;
/** The wax a visitor who asked for no motion sees: a drop under the cap, a blob halfway, another leaving the pool. */
const STILL_SECONDS = 95;
/** The wax's colour where the bulb is under it and where it has cooled under the cap (linear, as the frame's). */
const HOT = [2.4, 0.38, 0.03] as const;
const COOL = [2, 0.24, 0.016] as const;
/** The bottle as a film of light: its liquid lit from below, and the glass's own faint amber. */
const LIQUID = [0.08, 0.018, 0.004] as const;
const GLASS = [0.012, 0.006, 0.003] as const;

export interface LavaWaxOptions {
  readonly camera: Camera;
  /** Whether the generated room is what is drawn, its canvas on screen and the tab visible. */
  readonly isVisible: () => boolean;
  readonly reducedMotion: MediaQueryList;
  /** Asks the stage to draw a frame. */
  readonly invalidate: () => void;
}

/**
 * The lava lamp's wax and bottle (docs/ROOM.md › The generated room): the wax is a lathe of a few hundred vertices
 * that `poseWax` moves, a function of the clock alone, so nothing is stepped, stored or loaded. It moves only while
 * someone can see it: the lamp inside the camera's frustum, the canvas on screen, the tab visible and reduced motion
 * off (then it stands still, in one pose). Every drawn frame poses it for the next; whoever owns it tells the render
 * loop that it moves (`running`, `LAVA_FRAMES` a second), and the wax asks for a frame only as it starts. Both meshes
 * are unlit vertex colours on one program a tier never changes, and three uploads their buffers again after a lost
 * context.
 */
export class LavaWax {
  readonly meshes: readonly Mesh[];
  private readonly pose = createWaxPose();
  private readonly positions: BufferAttribute;
  private readonly clip: InstanceType<GenKit['Matrix4']>;
  private readonly corner: InstanceType<GenKit['Vector4']>;
  private moving = false;
  private posed = Number.NaN;
  private disposed = false;

  constructor(
    kit: GenKit,
    glassData: MeshData,
    private readonly options: LavaWaxOptions,
  ) {
    this.clip = new kit.Matrix4();
    this.corner = new kit.Vector4();
    const height = LAVA.top - LAVA.bottom;

    const waxGeometry = new kit.BufferGeometry();
    this.positions = new kit.BufferAttribute(new Float32Array(WAX.rings * WAX.segments * 3), 3);
    this.positions.setUsage(kit.DynamicDrawUsage);
    const waxColors = new Float32Array(WAX.rings * WAX.segments * 3);
    for (let k = 0; k < WAX.rings; k++) {
      const cooled = (k / (WAX.rings - 1)) ** 0.8;
      for (let j = 0; j < WAX.segments; j++)
        for (let c = 0; c < 3; c++)
          waxColors[(k * WAX.segments + j) * 3 + c] =
            (HOT[c] as number) + ((COOL[c] as number) - (HOT[c] as number)) * cooled;
    }
    waxGeometry.setAttribute('position', this.positions);
    waxGeometry.setAttribute('color', new kit.BufferAttribute(waxColors, 3));
    waxGeometry.setIndex(new kit.BufferAttribute(waxIndices(), 1));
    const wax = new kit.Mesh(waxGeometry, new kit.MeshBasicMaterial({ vertexColors: true }));
    wax.name = 'Generated lava wax';

    const glassGeometry = new kit.BufferGeometry();
    const glassColors = new Float32Array(glassData.positions.length);
    for (let i = 0; i < glassColors.length; i += 3) {
      const depth = 1 - ((glassData.positions[i + 1] as number) - LAVA.bottom) / height;
      for (let c = 0; c < 3; c++) glassColors[i + c] = (GLASS[c] as number) + (LIQUID[c] as number) * depth ** 2.2;
    }
    glassGeometry.setAttribute('position', new kit.BufferAttribute(glassData.positions, 3));
    glassGeometry.setAttribute('color', new kit.BufferAttribute(glassColors, 3));
    // Both walls of the bottle show, the far one through the near one. Each triangle is in the index twice, once
    // wound each way, so one front-faced draw adds both: a double-sided blended material draws in two passes with a
    // program each, and this one shares the bare bulb's glass's (GeneratedRoom). Added light does not care for order.
    const corners = glassData.positions.length / 3;
    const both = new Uint16Array(corners * 2);
    for (let i = 0; i < corners; i += 3) {
      both.set([i, i + 1, i + 2], i);
      both.set([i, i + 2, i + 1], corners + i);
    }
    glassGeometry.setIndex(new kit.BufferAttribute(both, 1));
    const glass = new kit.Mesh(
      glassGeometry,
      new kit.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        // Added to the frame, whose alpha (what the finish reads as a surface, not a display) it leaves alone.
        blending: kit.CustomBlending,
        blendSrc: kit.OneFactor,
        blendDst: kit.OneFactor,
        blendSrcAlpha: kit.ZeroFactor,
        blendDstAlpha: kit.OneFactor,
        depthWrite: false,
      }),
    );
    glass.name = 'Generated lava glass';
    // The wax never leaves the bottle: its bounds are the bottle's, measured once.
    glassGeometry.computeBoundingSphere();
    waxGeometry.boundingSphere = glassGeometry.boundingSphere?.clone() ?? null;
    this.meshes = [wax, glass];
    this.set(STILL_SECONDS);
    options.reducedMotion.addEventListener('change', this.sync);
  }

  /** Whether the wax is moving. */
  get running(): boolean {
    return this.moving;
  }

  /** Poses the wax for the next frame and says whether it moves; call after every drawn frame. */
  readonly sync = (): void => {
    if (this.disposed) return;
    if (!this.options.isVisible() || !this.inView()) {
      this.stop();
      return;
    }
    if (this.options.reducedMotion.matches) {
      this.stop();
      if (this.posed !== STILL_SECONDS) {
        this.set(STILL_SECONDS);
        this.options.invalidate();
      }
      return;
    }
    // Frames come faster than the wax needs when something else draws them: it is posed for every other one at most.
    const seconds = performance.now() / 1000;
    if (!(Math.abs(seconds - this.posed) < POSE_SECONDS)) this.set(seconds);
    if (this.moving) return;
    this.moving = true;
    this.options.invalidate();
  };

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.options.reducedMotion.removeEventListener('change', this.sync);
  }

  private stop(): void {
    this.moving = false;
  }

  private set(seconds: number): void {
    this.posed = seconds;
    poseWax(seconds, this.pose);
    waxPositions(this.pose, this.positions.array as Float32Array);
    this.positions.needsUpdate = true;
  }

  /** Whether any of the lamp's box is inside the camera's frustum. */
  private inView(): boolean {
    const { camera } = this.options;
    camera.updateMatrixWorld();
    this.clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const { min, max } = LAVA.bounds;
    // Outside one of the six planes with all eight corners: out of view.
    let outside = 63;
    for (let i = 0; i < 8; i++) {
      const p = this.corner
        .set(i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2], 1)
        .applyMatrix4(this.clip);
      outside &=
        (p.x < -p.w ? 1 : 0) |
        (p.x > p.w ? 2 : 0) |
        (p.y < -p.w ? 4 : 0) |
        (p.y > p.w ? 8 : 0) |
        (p.z < -p.w ? 16 : 0) |
        (p.z > p.w ? 32 : 0);
    }
    return outside === 0;
  }
}
