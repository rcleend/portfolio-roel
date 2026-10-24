import {
  type Camera,
  CanvasTexture,
  DataTexture,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  type Object3D,
  type Raycaster,
  RGBAFormat,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  Vector3,
} from 'three';
import { DISC_RADIUS } from '../discLayout';
import type { DiscArt } from '../RadioDeck';
import type { DiscSample } from './choreography';
import { discGeometry } from './discGeometry';
import { AVERAGE_BINS, AVERAGE_ROWS, DISC_FRAGMENT, DISC_VERTEX } from './discShader';
import { AVERAGE_SAMPLE_SIZE, radialAverage } from './radialAverage';

interface Disc {
  readonly id: string;
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  row: number;
  /** The print as handed over, and the texture made from it once uploaded. */
  art: DiscArt['label'];
  texture: Texture | null;
  pixels: number;
  /** A print uploaded and waiting to be shown with the others (and its radial average). */
  incoming: { readonly texture: Texture; readonly average: Uint8Array; readonly pixels: number } | null;
}

export interface DiscPick {
  readonly disc: string;
  readonly point: Vector3;
  readonly distance: number;
  readonly object: Object3D;
}

/**
 * The CDs as drawn: one mesh per disc sharing one hand-built geometry, one ShaderMaterial each of the same source
 * (so one program), one label texture each, and a 64 × 16 texture of radial averages (a row per disc) for the
 * spin blur. Labels are prepared one per unit of the room's background work and never during a flight.
 */
export class Discs {
  readonly group = new Group();
  readonly #geometry = discGeometry();
  readonly #averages: DataTexture;
  readonly #averagePixels = new Uint8Array(AVERAGE_BINS * AVERAGE_ROWS * 4);
  readonly #blank: DataTexture;
  readonly #discs = new Map<string, Disc>();
  readonly #scratch = document.createElement('canvas');
  /** The program is compiled (on the way to the radio): discs never draw before. */
  #compiled = false;

  readonly #anisotropy: number;

  constructor(parent: Object3D, anisotropy: number) {
    this.#anisotropy = anisotropy;
    this.group.name = 'RadioDiscs';
    this.#averages = new DataTexture(this.#averagePixels, AVERAGE_BINS, AVERAGE_ROWS, RGBAFormat);
    this.#averages.colorSpace = SRGBColorSpace;
    this.#averages.magFilter = LinearFilter;
    this.#averages.minFilter = LinearFilter;
    this.#averages.needsUpdate = true;
    this.#blank = new DataTexture(new Uint8Array([200, 200, 200, 0]), 1, 1, RGBAFormat);
    this.#blank.needsUpdate = true;
    this.#scratch.width = this.#scratch.height = AVERAGE_SAMPLE_SIZE;
    parent.add(this.group);
  }

  /** GPU pixels of the label textures. */
  get texturePixels(): number {
    let pixels = 0;
    for (const disc of this.#discs.values()) pixels += disc.pixels;
    return pixels;
  }

  /** Every disc has a print on the GPU. */
  get labelsReady(): boolean {
    return [...this.#discs.values()].every((disc) => disc.texture !== null);
  }

  /** Prints uploaded and waiting to be shown. */
  get labelsWaiting(): boolean {
    return [...this.#discs.values()].some((disc) => disc.incoming !== null);
  }

  get ready(): boolean {
    return this.#compiled;
  }

  /** The collection: new discs get a mesh, gone ones are disposed; returns the discs whose print must be prepared. */
  setDiscs(art: readonly DiscArt[]): string[] {
    const keep = new Set(art.map((disc) => disc.id));
    for (const [id, disc] of this.#discs) {
      if (keep.has(id)) continue;
      disc.mesh.removeFromParent();
      disc.material.dispose();
      disc.texture?.dispose();
      disc.incoming?.texture.dispose();
      this.#discs.delete(id);
    }
    const pending: string[] = [];
    art.forEach((entry, row) => {
      let disc = this.#discs.get(entry.id);
      if (!disc) {
        const material = new ShaderMaterial({
          vertexShader: DISC_VERTEX,
          fragmentShader: DISC_FRAGMENT,
          uniforms: {
            uLabel: { value: this.#blank },
            uAverages: { value: this.#averages },
            uRow: { value: 0 },
            uOmega: { value: 0 },
            uAttention: { value: 0 },
            uFlipLabel: { value: 0 },
            uPrint: { value: 1 },
          },
        });
        const mesh = new Mesh(this.#geometry, material);
        mesh.name = `RadioDisc:${entry.id}`;
        mesh.visible = false;
        mesh.matrixAutoUpdate = true;
        this.group.add(mesh);
        disc = { id: entry.id, mesh, material, row, art: null, texture: null, pixels: 0, incoming: null };
        this.#discs.set(entry.id, disc);
      }
      disc.row = row;
      setUniform(disc.material, 'uRow', (row + 0.5) / AVERAGE_ROWS);
      if (entry.label !== disc.art) {
        disc.art = entry.label;
        if (entry.label) pending.push(entry.id);
        else this.#clearLabel(disc);
      }
    });
    return pending;
  }

  /**
   * Makes, averages and uploads one disc's print (one unit of background work); it shows with the others, at
   * `showLabels`. Returns true if there was one to make.
   */
  prepareLabel(id: string, renderer: { initTexture(texture: Texture): void }): boolean {
    const disc = this.#discs.get(id);
    const art = disc?.art;
    if (!disc || !art) return false;
    const texture = art instanceof HTMLCanvasElement ? new CanvasTexture(art) : new Texture(art);
    texture.colorSpace = SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.anisotropy = this.#anisotropy;
    // A canvas uploads upside down unless flipped; an ImageBitmap cannot be flipped on upload, so the shader does it.
    texture.flipY = art instanceof HTMLCanvasElement;
    texture.needsUpdate = true;
    renderer.initTexture(texture);
    disc.incoming?.texture.dispose();
    disc.incoming = { texture, average: this.#average(art), pixels: Math.round(art.width * art.height * (4 / 3)) };
    return true;
  }

  /** Every print uploaded so far shows, together, at `print` coverage (0 bare foil … 1). Returns their discs. */
  showLabels(print: number): string[] {
    const shown: string[] = [];
    for (const disc of this.#discs.values()) {
      const incoming = disc.incoming;
      if (!incoming) continue;
      disc.incoming = null;
      disc.texture?.dispose();
      disc.texture = incoming.texture;
      disc.pixels = incoming.pixels;
      setUniform(disc.material, 'uLabel', incoming.texture);
      setUniform(disc.material, 'uFlipLabel', incoming.texture.flipY ? 0 : 1);
      setUniform(disc.material, 'uPrint', print);
      this.#averagePixels.set(incoming.average, disc.row * AVERAGE_BINS * 4);
      this.#averages.needsUpdate = true;
      shown.push(disc.id);
    }
    return shown;
  }

  /** How much of their prints the discs `ids` show (a fade in). */
  setPrint(ids: readonly string[], print: number): void {
    for (const id of ids) {
      const disc = this.#discs.get(id);
      if (disc) setUniform(disc.material, 'uPrint', print);
    }
  }

  /** Compiles the discs' program off the frame (KHR_parallel_shader_compile where available). */
  async compile(
    renderer: { compileAsync(scene: Object3D, camera: Camera, target?: Object3D | null): Promise<unknown> },
    camera: Camera,
    scene: Object3D,
  ): Promise<void> {
    if (this.#compiled) return;
    await renderer.compileAsync(this.group, camera, scene);
    this.#compiled = true;
  }

  /** Puts every disc where the choreography says, and tells its shader how fast it spins. */
  apply(samples: readonly DiscSample[], attention: string | null, hidden: (sample: DiscSample) => boolean): void {
    for (const sample of samples) {
      const disc = this.#discs.get(sample.id);
      if (!disc) continue;
      const mesh = disc.mesh;
      mesh.visible = this.#compiled && sample.visible && !hidden(sample);
      if (!mesh.visible) continue;
      mesh.position.copy(sample.position);
      mesh.quaternion.copy(sample.orientation);
      mesh.scale.setScalar(sample.scale);
      setUniform(disc.material, 'uOmega', sample.omega);
      setUniform(disc.material, 'uAttention', sample.id === attention ? 1 : 0);
    }
  }

  /** The nearest visible disc the ray crosses (the hole counts as the disc), analytically. */
  pick(raycaster: Raycaster, pickable: (id: string) => boolean): DiscPick | null {
    let best: DiscPick | null = null;
    const normal = new Vector3();
    const point = new Vector3();
    for (const disc of this.#discs.values()) {
      const { mesh } = disc;
      if (!mesh.visible || !pickable(disc.id)) continue;
      normal.set(0, 0, 1).applyQuaternion(mesh.quaternion);
      const denominator = raycaster.ray.direction.dot(normal);
      if (Math.abs(denominator) < 1e-6) continue;
      const distance = mesh.position.clone().sub(raycaster.ray.origin).dot(normal) / denominator;
      if (distance < raycaster.near || distance > raycaster.far) continue;
      raycaster.ray.at(distance, point);
      if (point.distanceTo(mesh.position) > DISC_RADIUS * mesh.scale.x) continue;
      if (!best || distance < best.distance) best = { disc: disc.id, point: point.clone(), distance, object: mesh };
    }
    return best;
  }

  /** The world position of a disc's centre (for a cue's stereo position). */
  positionOf(id: string): Vector3 | null {
    return this.#discs.get(id)?.mesh.position ?? null;
  }

  dispose(): void {
    for (const disc of this.#discs.values()) {
      disc.material.dispose();
      disc.texture?.dispose();
      disc.incoming?.texture.dispose();
    }
    this.#discs.clear();
    this.group.removeFromParent();
    this.#geometry.dispose();
    this.#averages.dispose();
    this.#blank.dispose();
    this.#scratch.width = this.#scratch.height = 0;
  }

  #clearLabel(disc: Disc): void {
    disc.texture?.dispose();
    disc.texture = null;
    disc.pixels = 0;
    setUniform(disc.material, 'uLabel', this.#blank);
    setUniform(disc.material, 'uFlipLabel', 0);
    this.#averagePixels.fill(0, disc.row * AVERAGE_BINS * 4, (disc.row + 1) * AVERAGE_BINS * 4);
    this.#averages.needsUpdate = true;
  }

  /** The print's radial average from a 128² copy on the CPU (the print is a CPU canvas: no wait for the GPU). */
  #average(art: HTMLCanvasElement | ImageBitmap): Uint8Array {
    const context = this.#scratch.getContext('2d', { willReadFrequently: true });
    if (!context) return new Uint8Array(AVERAGE_BINS * 4);
    context.clearRect(0, 0, AVERAGE_SAMPLE_SIZE, AVERAGE_SAMPLE_SIZE);
    context.drawImage(art, 0, 0, AVERAGE_SAMPLE_SIZE, AVERAGE_SAMPLE_SIZE);
    return radialAverage(context.getImageData(0, 0, AVERAGE_SAMPLE_SIZE, AVERAGE_SAMPLE_SIZE));
  }
}

function setUniform(material: ShaderMaterial, name: string, value: unknown): void {
  const uniform = material.uniforms[name];
  if (uniform) uniform.value = value;
}
