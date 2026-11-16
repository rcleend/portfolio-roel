// Types only: every runtime dependency the room's chunk also carries arrives through the GenKit (genKit.ts).
import type { CanvasTexture, Group, Material, Mesh, MeshBasicMaterial, Object3D, Texture } from 'three';
import type { IdleTask, IdleWork } from '../stage/IdleWork';
import type { QualityTier } from '../stage/quality';
import type { RoomStage } from '../stage/RoomStage';
import { paintArt, paintExterior } from './artPaint';
import { type BakeResult, Baker, CASTERS_ALL, CASTERS_LOCAL } from './bake/Baker';
import type { GenKit } from './genKit';
import { GROUP } from './props/types';
import type { GenRequest, GenScene } from './scene';
import { GENERATED_TIERS, type GeneratedTier, POOL_WARMTH, TV_LAMP_INTENSITY } from './tiers';

export interface GeneratedContext {
  readonly stage: RoomStage;
  readonly background: IdleWork;
  /** The shipped room and TV set: the generated pieces replace some of their meshes. */
  readonly room: Object3D;
  readonly tv: Object3D;
  readonly anisotropy: number;
  /** The tier the device started on: what to generate at and bake with (tiers.ts). */
  readonly tier: QualityTier;
}

export interface GeneratedStats {
  /** Where the geometry was built, and how long that took there (ms). */
  readonly builtIn: 'worker' | 'main';
  readonly buildMs: number;
  /** Shadow maps rendered and their light passes. */
  readonly views: number;
  /** The bake's main-thread time over all its units, and the longest unit (ms). */
  readonly bakeCpuMs: number;
  readonly longestUnitMs: number;
  /** From the first unit to the generated room on screen (ms): idle waits included. */
  readonly bakeWallMs: number;
  /** The longest one view's GPU work was seen to take (ms; without a GPU timer, the wait for it). */
  readonly longestGpuMs: number;
  /** The bake's units were kept for quiet moments: one took the GPU too long to go between a playing game's frames. */
  readonly deferred: boolean;
  readonly triangles: number;
  readonly pages: readonly (readonly [number, number])[];
  /** Bytes of the pages the room keeps, with their mips, and of the bake's own targets while it ran. */
  readonly pageBytes: number;
  readonly transientBytes: number;
  readonly halfFloat: boolean;
}

export interface GeneratedEvents {
  /** The generated pieces are baked and on screen. */
  readonly onShown: (stats: GeneratedStats) => void;
  /** A context loss took the bake: the shipped pieces are back until it has run again (onShown). */
  readonly onLost: () => void;
  readonly onFailed: (error: unknown) => void;
}

/** The shipped meshes this stage replaces, by the names tools/room/ gave them. */
const REPLACED_IN_ROOM = new Set([
  '01_TV_surfaces',
  'TV_desk_plant',
  'TV_desk_lamp_base',
  'TV_desk_lamp_globe',
  'TV_toy_robot_body',
  'TV_toy_robot_eyes',
  'PS2_printed_cover_Product_Engineer',
  'PS2_printed_cover_Kingdom_Hearts',
  'PS2_printed_cover_LEGO_Star_Wars',
  '03_Room_floor',
  'Right_knee_wall',
  '03_Room_surfaces',
  '03_Room_window',
  'Woven_geometric_rug',
  'Night_tree_exterior_view',
]);
/** The shell's cutaway pieces (ceilings, front wall, door). */
const REPLACED_CUTAWAY = /^Cutaway_/;
/** Every part of the shipped set but its glass, which keeps the screen's contract (docs/ROOM.md). */
const REPLACED_IN_TV = /^TV_Imported_/;
/** The room's shell: it cannot shadow the ambient dome, which stands for the light it bounces. */
const SHELL = /^03_Room_|^Cutaway|knee_wall|geometric_rug/;

/** A view whose GPU work takes longer than this is not run between a playing game's frames again (ms). */
const UNIT_GPU_LIMIT_MS = 5;
/** What a unit's views together may take of the GPU (ms): a quarter of a 60 Hz frame. */
const UNIT_GPU_TARGET_MS = 4;
const MAX_VIEWS_A_UNIT = 12;
/** How often a unit's fence is looked at (ms). */
const GPU_POLL_MS = 3;
/** What a unit costs the main thread before one is timed: a few dozen WebGL calls. */
const UNIT_ESTIMATE_MS = 2;

const nameOf = (object: Object3D): string => String(object.userData.name ?? object.name).replace(/ /g, '_');

/**
 * The generated room's lazy half (docs/ROOM.md › The generated room): builds the geometry in a worker, paints the
 * prints, bakes the light on the GPU in idle moments, and then swaps the generated pieces in for the shipped ones. A
 * lost context swaps them back until the bake has run again.
 */
export class GeneratedRoom {
  private gen: GenScene | null = null;
  private builtIn: 'worker' | 'main' = 'worker';
  private readonly group: Group;
  private readonly replaced: Mesh[] = [];
  private readonly retired = new Set<Texture>();
  private readonly artCanvas = document.createElement('canvas');
  private art: CanvasTexture | null = null;
  private readonly exteriorCanvas = document.createElement('canvas');
  private exterior: CanvasTexture | null = null;
  private baker: Baker | null = null;
  private dropTask: (() => void) | null = null;
  private shown = false;
  private disposed = false;
  private stopFrames: (() => void) | null = null;
  private stopCanvas: (() => void) | null = null;
  private displays: { tv: Mesh; props: Mesh; charts: Map<number, Mesh> } | null = null;
  private timings = {
    cpu: 0,
    longest: 0,
    started: 0,
    gpu: 0,
    deferred: false,
    units: 0,
    compiled: 0,
    baked: 0,
    created: 0,
  };
  /** What one view was last seen to take of the GPU (ms); a cautious guess before any has been timed. */
  private viewGpuMs = UNIT_GPU_TARGET_MS;
  private lastStats: GeneratedStats | null = null;
  private readonly tier: GeneratedTier;
  /** The opal lamp's colour, from the shipped room's own record of it. */
  private lamp: readonly [number, number, number] | null = null;

  constructor(
    private readonly context: GeneratedContext,
    private readonly kit: GenKit,
    private readonly events: GeneratedEvents,
  ) {
    // Development only: tests and the bake's tuning read the instance (its scene, its timings).
    if (import.meta.env.DEV) (globalThis as { __generatedRoom?: GeneratedRoom }).__generatedRoom = this;
    this.tier = GENERATED_TIERS[context.tier];
    this.group = new kit.Group();
    this.group.name = 'GeneratedRoom';
    this.group.visible = false;
    context.room.traverse((object) => {
      if ((object as Mesh).isMesh && (REPLACED_IN_ROOM.has(nameOf(object)) || REPLACED_CUTAWAY.test(nameOf(object))))
        this.replaced.push(object as Mesh);
    });
    context.tv.traverse((object) => {
      if ((object as Mesh).isMesh && REPLACED_IN_TV.test(nameOf(object))) this.replaced.push(object as Mesh);
    });
    const canvas = context.stage.canvas;
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
    this.build().then(
      (gen) => {
        if (this.disposed) return;
        this.gen = gen;
        this.assemble(gen);
        this.startBake();
      },
      (error: unknown) => this.fail(error),
    );
  }

  get stats(): GeneratedStats | null {
    return this.lastStats;
  }

  dispose(): void {
    this.disposed = true;
    const canvas = this.context.stage.canvas;
    canvas.removeEventListener('webglcontextlost', this.onLost);
    canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.dropTask?.();
    this.stopCanvas?.();
    this.show(false);
    this.baker?.dispose(true);
    this.art?.dispose();
    this.exterior?.dispose();
    this.group.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      (mesh.material as Material).dispose();
    });
    this.group.removeFromParent();
    this.displays?.tv.removeFromParent();
  }

  /** The geometry, from the worker; on the main thread where a worker cannot be had. */
  private build(): Promise<GenScene> {
    const tier = this.tier;
    const request: GenRequest = { densityScale: tier.density, maxPageSize: tier.pageSize };
    const onMain = async (): Promise<GenScene> => {
      this.builtIn = 'main';
      return (await import('./scene')).buildScene(request);
    };
    if (typeof Worker === 'undefined') return onMain();
    return new Promise<GenScene>((resolve, reject) => {
      let worker: Worker;
      try {
        worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      } catch {
        onMain().then(resolve, reject);
        return;
      }
      worker.onmessage = (event: MessageEvent<GenScene>) => {
        worker.terminate();
        resolve(event.data);
      };
      worker.onerror = () => {
        worker.terminate();
        onMain().then(resolve, reject);
      };
      worker.postMessage(request);
    });
  }

  /** The meshes a frame draws, without their light yet: hidden until the bake has filled them in. */
  private assemble(gen: GenScene): void {
    const { kit: k, context } = this;
    const lights = { lamp: glowOf(context.room, 'tv-lamp'), robot: glowOf(context.room, 'toy-robot') };
    this.lamp = lights.lamp?.color ?? null;
    const vertexLit = (data: GenScene['meshes']['tv'], name: string): Mesh => {
      const geometry = new k.BufferGeometry();
      geometry.setAttribute('position', new k.BufferAttribute(data.positions, 3));
      geometry.setAttribute('normal', new k.BufferAttribute(data.normals, 3));
      geometry.setAttribute('color', new k.BufferAttribute(new Float32Array(data.positions.length), 3));
      const material = new k.MeshBasicMaterial({ vertexColors: true });
      // The finish knows a baked surface by its material's name (its sheen, its varnish); GENERATED tells its shader
      // the static lights are already in the surface (RoomGloss).
      material.name = name;
      material.defines = { GENERATED: '' };
      const mesh = new k.Mesh(geometry, material);
      mesh.name = `Generated ${name}`;
      mesh.layers.enable(CASTERS_ALL);
      mesh.layers.enable(CASTERS_LOCAL);
      return mesh;
    };
    const tv = vertexLit(gen.meshes.tv, 'device_tv_front_BAKED_UNLIT');
    const props = vertexLit(gen.meshes.props, '01_TV_props_BAKED_UNLIT');
    // Light itself: the globe and the eyes are drawn as the shipped ones were, in the colour the room's lamp carries.
    const emitter = (data: GenScene['meshes']['tv'], name: string, color: readonly number[] | null): Mesh => {
      const geometry = new k.BufferGeometry();
      geometry.setAttribute('position', new k.BufferAttribute(data.positions, 3));
      geometry.setAttribute('normal', new k.BufferAttribute(data.normals, 3));
      const material = new k.MeshBasicMaterial();
      material.name = name;
      if (color) material.color.setRGB(color[0] ?? 1, color[1] ?? 1, color[2] ?? 1);
      return new k.Mesh(geometry, material);
    };
    const globe = emitter(gen.meshes.globe, '01_TV_lamp_opaline_BAKED_UNLIT', lights.lamp?.glowing ?? null);
    const eyes = emitter(gen.meshes.eyes, '01_TV_robot_eyes_BAKED_UNLIT', lights.robot?.glowing ?? null);

    const names: Record<number, string> = {
      [GROUP.cabinet]: '01_TV_surfaces_BAKED_UNLIT',
      [GROUP.wall]: '03_Room_surfaces_BAKED_UNLIT',
      [GROUP.floor]: '03_Room_floor_BAKED_UNLIT',
    };
    const charts = new Map<number, Mesh>();
    for (const data of gen.charts.display) {
      const geometry = new k.BufferGeometry();
      geometry.setAttribute('position', new k.BufferAttribute(data.positions, 3));
      geometry.setAttribute('normal', new k.BufferAttribute(data.normals, 3));
      geometry.setAttribute('uv', new k.BufferAttribute(data.uvs, 2));
      const material = new k.MeshBasicMaterial();
      material.name = names[data.group] ?? '01_TV_surfaces_BAKED_UNLIT';
      material.defines = { GENERATED: '' };
      material.userData.page = data.page;
      const mesh = new k.Mesh(geometry, material);
      mesh.name = `Generated charts ${data.group}`;
      if (data.group === GROUP.cabinet) {
        mesh.layers.enable(CASTERS_ALL);
        mesh.layers.enable(CASTERS_LOCAL);
      }
      charts.set(data.group, mesh);
    }

    this.art = new k.CanvasTexture(this.artCanvas);
    this.art.colorSpace = k.SRGBColorSpace;
    this.art.flipY = false;
    this.art.anisotropy = context.anisotropy;
    this.paint();
    this.stopCanvas = k.onCanvasRestored(this.artCanvas, () => this.paint());
    const decalGeometry = new k.BufferGeometry();
    decalGeometry.setAttribute('position', new k.BufferAttribute(gen.decals.positions, 3));
    decalGeometry.setAttribute('uv', new k.BufferAttribute(gen.decals.uvs, 2));
    decalGeometry.setAttribute('color', new k.BufferAttribute(gen.decals.tints, 3));
    const decals = new k.Mesh(
      decalGeometry,
      new k.MeshBasicMaterial({
        map: this.art,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    decals.name = 'Generated prints';

    // The view outside: a plate behind the window, which the rain's refraction samples (userData.exterior).
    this.exterior = new k.CanvasTexture(this.exteriorCanvas);
    this.exterior.colorSpace = k.SRGBColorSpace;
    const plate = new k.BufferGeometry();
    plate.setAttribute(
      'position',
      new k.BufferAttribute(
        new Float32Array([
          -3.7, 0.1, -4.5, 1.1, 0.1, -4.5, 1.1, 3.7, -4.5, -3.7, 0.1, -4.5, 1.1, 3.7, -4.5, -3.7, 3.7, -4.5,
        ]),
        3,
      ),
    );
    plate.setAttribute('uv', new k.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), 2));
    const outside = new k.Mesh(plate, new k.MeshBasicMaterial({ map: this.exterior }));
    outside.name = 'Generated view outside';
    outside.userData.exterior = true;
    this.group.add(outside);

    // The set joins the shipped set's own node: the spotlight glows and bounces what is under it.
    tv.visible = false;
    context.tv.add(tv);
    this.group.add(props, globe, eyes, decals, ...charts.values());
    context.stage.scene.add(this.group);
    this.displays = { tv, props, charts };
    this.tagCasters();
    // The finish takes the new materials in (RoomGloss.attach); nothing is drawn with them yet.
    context.stage.attachAtmosphere();
  }

  private paint(): void {
    paintArt(this.artCanvas, this.tier.artSize);
    if (this.art) this.art.needsUpdate = true;
    paintExterior(this.exteriorCanvas, this.tier.artSize);
    if (this.exterior) this.exterior.needsUpdate = true;
  }

  /** Marks the shipped meshes that cast shadows in the bake: opaque ones, the shell only for lights it can shadow. */
  private tagCasters(): void {
    const replaced = new Set<Object3D>(this.replaced);
    this.context.stage.scene.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh || replaced.has(mesh) || mesh.layers.isEnabled(CASTERS_ALL)) return;
      let inside = false;
      for (let parent: Object3D | null = mesh; parent; parent = parent.parent) if (parent === this.group) inside = true;
      if (inside || mesh.name.startsWith('Generated')) return;
      const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as
        | MeshBasicMaterial
        | undefined;
      if (!material || material.transparent || !material.depthWrite || !material.colorWrite || material.blending !== 1)
        return;
      const name = nameOf(mesh);
      if (mesh.userData.exterior || /Night_tree|Glow|Halo|Fade|Dust/i.test(name)) return;
      mesh.layers.enable(CASTERS_ALL);
      let shell = false;
      for (let parent: Object3D | null = mesh; parent; parent = parent.parent)
        if (SHELL.test(nameOf(parent))) shell = true;
      if (!shell) mesh.layers.enable(CASTERS_LOCAL);
    });
  }

  private startBake(): void {
    const { gen, art, context, kit } = this;
    if (!gen || !art || this.disposed) return;
    const { stage } = context;
    const tier = this.tier;
    // The finish's static lights as the room sets them for this mood (none without a finish).
    const lit = stage.mood !== 'original';
    const lamp = lit ? this.lamp : null;
    const halfFloat =
      stage.renderer.extensions.has('EXT_color_buffer_half_float') ||
      stage.renderer.extensions.has('EXT_color_buffer_float');
    this.baker?.dispose(true);
    const baker = new Baker(kit, stage.renderer, stage.scene, gen, art, {
      shadowSize: tier.shadowSize,
      lightScale: tier.lightScale,
      sampleSet: tier.sampleSet,
      halfFloat,
      exposure: 1,
      staticColor: lamp
        ? [lamp[0] * TV_LAMP_INTENSITY, lamp[1] * TV_LAMP_INTENSITY, lamp[2] * TV_LAMP_INTENSITY]
        : [0, 0, 0],
      warmth: POOL_WARMTH[stage.mood],
      anisotropy: context.anisotropy,
    });
    this.baker = baker;
    this.timings = {
      cpu: 0,
      longest: 0,
      started: 0,
      gpu: 0,
      deferred: false,
      units: 0,
      compiled: 0,
      baked: 0,
      created: performance.now(),
    };
    // The bake's programs link off the main thread; its first unit waits for them.
    this.show(true);
    const compiled = baker.compile();
    this.show(false);
    compiled.then(
      () => {
        if (this.disposed || this.baker !== baker) return;
        this.timings.compiled = performance.now();
        this.queue(baker);
      },
      (error: unknown) => this.fail(error),
    );
  }

  /**
   * Queues the bake's next unit: a few views, as many as the GPU has been seen to do in UNIT_GPU_TARGET_MS. IdleWork
   * says when the main thread may run it (between a playing game's frames while a view is quick on this GPU, else only
   * in a quiet moment); the unit after it is not queued until the GPU has this one's work behind it, so frames go in
   * between and no two units ever pile up on one.
   */
  private queue(baker: Baker): void {
    this.dropTask?.();
    this.dropTask = this.context.background.add(this.unit(baker), { estimateMs: UNIT_ESTIMATE_MS });
  }

  private *unit(baker: Baker): IdleTask {
    // Kept for a quiet moment once a single view has taken the GPU too long to hide between two frames.
    if (this.timings.deferred) yield this.kit.quiet;
    if (this.disposed || this.baker !== baker) return;
    this.dropTask = null;
    const gl = this.context.stage.renderer.getContext() as WebGL2RenderingContext;
    const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number } | null;
    const query = timer ? gl.createQuery() : null;
    const started = performance.now();
    if (!this.timings.started) this.timings.started = started;
    if (timer && query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
    const views = Math.max(1, Math.min(MAX_VIEWS_A_UNIT, Math.floor(UNIT_GPU_TARGET_MS / this.viewGpuMs)));
    this.show(true);
    let more = true;
    for (let i = 0; i < views && more; i++) more = baker.step();
    if (!this.shown) this.show(false);
    if (timer && query) gl.endQuery(timer.TIME_ELAPSED_EXT);
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const took = performance.now() - started;
    this.timings.cpu += took;
    this.timings.longest = Math.max(this.timings.longest, took);
    this.timings.units++;
    if (!more) {
      this.timings.baked = performance.now();
      if (query) gl.deleteQuery(query);
      if (sync) gl.deleteSync(sync);
      baker.result().then(
        (result) => this.finish(baker, result),
        (error: unknown) => this.fail(error),
      );
      return;
    }
    // Wait for the GPU, off the frame's path, then judge the unit and queue the next.
    let polls = 0;
    const poll = (): void => {
      if (this.disposed || this.baker !== baker) return;
      const signalled = !sync || gl.clientWaitSync(sync, 0, 0) !== gl.TIMEOUT_EXPIRED;
      const measured = query ? (gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) as boolean) : false;
      // The timer's result follows the fence by a task or two; without a timer the wait itself is the measure.
      if (!signalled || (query && !measured && ++polls < 6)) {
        setTimeout(poll, GPU_POLL_MS);
        return;
      }
      const gpuMs =
        query && measured
          ? (gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6
          : performance.now() - started;
      if (query) gl.deleteQuery(query);
      if (sync) gl.deleteSync(sync);
      this.viewGpuMs = Math.max(0.05, gpuMs / views);
      this.timings.gpu = Math.max(this.timings.gpu, this.viewGpuMs);
      if (this.viewGpuMs > UNIT_GPU_LIMIT_MS) this.timings.deferred = true;
      this.queue(baker);
    };
    setTimeout(poll, GPU_POLL_MS);
  }

  /** The bake is back from the GPU: light the meshes, link their programs, and swap them in. */
  private finish(baker: Baker, result: BakeResult): void {
    const { displays, gen, context } = this;
    if (this.disposed || this.baker !== baker || !displays || !gen) return;
    let offset = 0;
    for (const [name, mesh] of [
      ['tv', displays.tv],
      ['props', displays.props],
    ] as const) {
      const count = gen.meshes[name].positions.length;
      const colors = mesh.geometry.getAttribute('color');
      (colors.array as Float32Array).set(result.colors.subarray(offset, offset + count));
      colors.needsUpdate = true;
      offset += count;
    }
    for (const mesh of displays.charts.values()) {
      const material = mesh.material as MeshBasicMaterial;
      material.map = result.pages[material.userData.page as number] ?? null;
      material.needsUpdate = true;
    }
    baker.dispose();
    this.show(true);
    context.stage.prepare(context.stage.scene);
    this.show(false);
    linked(context.stage.renderer).then(
      () => {
        if (this.disposed || this.baker !== baker) return;
        this.show(true);
        this.shown = true;
        this.retire();
        // Sixty frames a second in every view of the generated room, whether or not something moves.
        this.stopFrames ??= sixtyFrames(context.stage.loop);
        const pages = gen.pages.map(({ width, height }) => [width, height] as const);
        this.lastStats = {
          builtIn: this.builtIn,
          buildMs: gen.buildMs,
          views: result.views,
          bakeCpuMs: this.timings.cpu,
          longestUnitMs: this.timings.longest,
          bakeWallMs: performance.now() - this.timings.started,
          longestGpuMs: this.timings.gpu,
          deferred: this.timings.deferred,
          triangles: gen.props.reduce((sum, prop) => sum + prop.triangles, 0),
          pages,
          pageBytes: Math.round(pages.reduce((sum, [w, h]) => sum + w * h * 4, 0) * (4 / 3)),
          transientBytes: baker.transientBytes,
          halfFloat:
            context.stage.renderer.extensions.has('EXT_color_buffer_half_float') ||
            context.stage.renderer.extensions.has('EXT_color_buffer_float'),
        };
        this.events.onShown(this.lastStats);
      },
      (error: unknown) => this.fail(error),
    );
  }

  /** The generated pieces in for the shipped ones, or back. */
  private show(generated: boolean): void {
    for (const mesh of this.replaced) {
      mesh.visible = !generated;
      mesh.userData.retired = generated;
    }
    this.group.visible = generated;
    if (this.displays) this.displays.tv.visible = generated;
  }

  /** Frees the GPU's copy of every atlas only the replaced meshes drew with; a swap back uploads it again. */
  private retire(): void {
    const kept = new Set<Texture>();
    const replaced = new Set<Object3D>(this.replaced);
    const textures = (mesh: Mesh): Texture[] =>
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).flatMap((material) =>
        Object.values(material).filter((value): value is Texture => (value as Texture | null)?.isTexture === true),
      );
    this.context.stage.scene.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.isMesh && !replaced.has(mesh)) for (const texture of textures(mesh)) kept.add(texture);
    });
    for (const mesh of this.replaced)
      for (const texture of textures(mesh))
        if (!kept.has(texture)) {
          this.retired.add(texture);
          texture.dispose();
        }
  }

  private readonly onLost = (): void => {
    // The pages are gone with the context: the shipped pieces, whose images three uploads again, stand in.
    this.dropTask?.();
    this.dropTask = null;
    this.stopFrames?.();
    this.stopFrames = null;
    if (this.shown) this.events.onLost();
    this.shown = false;
    this.show(false);
  };

  private readonly onRestored = (): void => {
    if (this.disposed || !this.gen) return;
    this.paint();
    this.startBake();
  };

  private fail(error: unknown): void {
    if (this.disposed) return;
    this.dropTask?.();
    this.show(false);
    this.events.onFailed(error);
  }
}

/** A light the shipped room records on one of its nodes (`userData.light`): its colour, and that colour × its glow. */
function glowOf(
  room: Object3D,
  asset: string,
): { color: readonly [number, number, number]; glowing: readonly number[] } | null {
  let found: { color: readonly [number, number, number]; glowing: readonly number[] } | null = null;
  room.traverse((object) => {
    if (object.userData.supplied_asset !== asset) return;
    const light = object.userData.light as { color: [number, number, number]; glow: number };
    found = { color: light.color, glowing: light.color.map((value) => value * light.glow) };
  });
  return found;
}

/** Longest the swap waits for its programs to link before drawing with them anyway (ms). */
const LINK_WAIT_MS = 4000;

/**
 * Resolves once every program the renderer holds has linked, so the frame that first draws the generated pieces does
 * not wait on the driver. Where the GPU cannot say (no KHR_parallel_shader_compile) it resolves at once.
 */
function linked(renderer: RoomStage['renderer']): Promise<void> {
  const gl = renderer.getContext();
  const parallel = gl.getExtension('KHR_parallel_shader_compile') as { COMPLETION_STATUS_KHR: number } | null;
  if (!parallel) return Promise.resolve();
  const started = performance.now();
  return new Promise((resolve) => {
    const poll = (): void => {
      const programs = (renderer.info.programs ?? []) as unknown as { program: WebGLProgram }[];
      const done = programs.every(
        ({ program }) => gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR) as boolean,
      );
      if (done || performance.now() - started > LINK_WAIT_MS) resolve();
      else setTimeout(poll, 8);
    };
    poll();
  });
}

/** Slightly under 1/60 s, as the game's own frames are paced (stage/FramePacer.ts). */
const FRAME_INTERVAL_MS = 1000 / 60 - 2;

/**
 * Asks for a frame sixty times a second, as a run of frames (so the quality governor judges them), until the returned
 * function is called: a 60 Hz display draws every frame, a 120 Hz one every other.
 */
function sixtyFrames(loop: RoomStage['loop']): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tick = (): void => {
    loop.invalidate(true);
    timer = setTimeout(tick, FRAME_INTERVAL_MS);
  };
  tick();
  return () => {
    if (timer !== null) clearTimeout(timer);
  };
}
