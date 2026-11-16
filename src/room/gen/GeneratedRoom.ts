// Types only: every runtime dependency arrives through the GenKit (genKit.ts), so the worker and the main-thread
// fallback's chunk (scene.ts and the generators) never pull three.js in.
import type { BufferAttribute, CanvasTexture, Group, Material, Matrix4, Mesh, MeshBasicMaterial } from 'three';
import type { IdleTask, IdleWork } from '../stage/IdleWork';
import type { QualityTier } from '../stage/quality';
import type { RoomStage } from '../stage/RoomStage';
import { paintArt, paintExterior } from './artPaint';
import { type BakePart, type BakeResult, Baker, CASTERS_ALL, CASTERS_LOCAL } from './bake/Baker';
import { GeneratedRadio } from './GeneratedRadio';
import type { GenKit } from './genKit';
import { LavaWax } from './LavaWax';
import { GROUP, type MeshName } from './props/types';
import { BULB_SPEC, EXTERIOR_PLATE, PICK_PROPS, TV_LAMP_SPEC } from './roomSpec';
import type { GenRequest, GenScene } from './scene';
import { GENERATED_TIERS, type GeneratedTier, POOL_WARMTH, TV_LAMP_INTENSITY } from './tiers';

export interface GeneratedContext {
  readonly stage: RoomStage;
  readonly anisotropy: number;
  /** The tier the device started on: what to generate at and bake with (tiers.ts). */
  readonly tier: QualityTier;
  readonly reducedMotion: MediaQueryList;
}

/** The generated room's nodes, as the room wires its devices, its clicks and its spotlight to them. */
export interface GeneratedParts {
  /** The TV set: its casing and its prints. The room adds the glass. */
  readonly tv: Group;
  /** The computer as a click target: the monitor, and the keyboard's and the mouse's triangles. The room adds the glass. */
  readonly pc: Group;
  /** The monitor's shell, under `pc`: what the spotlight lights. */
  readonly monitor: Mesh;
  /** The desk, its chair, tower, lamp and basket as a click target. */
  readonly desk: Group;
  /** The dresser's flat faces: the cabinet the radio stands on. */
  readonly dresser: Mesh | null;
  readonly radio: GeneratedRadio;
}

export interface GeneratedStats {
  /** Where the geometry was built, and how long that took there (ms). */
  readonly builtIn: 'worker' | 'main';
  readonly buildMs: number;
  /** From the room's creation to its geometry on the main thread (ms): the worker's start and the transfer included. */
  readonly builtAtMs: number;
  /** Shadow maps rendered and their light passes, over both passes. */
  readonly views: number;
  /** The bake's main-thread time over all its units, and the longest unit (ms). */
  readonly bakeCpuMs: number;
  readonly longestUnitMs: number;
  /** From the bake's first unit to the opening view on screen, and to the whole room baked (ms; 0 until then). */
  readonly shownWallMs: number;
  readonly bakeWallMs: number;
  /** The share of the charts' cells the opening view's pass lit (1: the bake was one pass). */
  readonly openingShare: number;
  /** The longest one view's GPU work was seen to take (ms; without a GPU timer, the wait for it). */
  readonly longestGpuMs: number;
  /** The rest's units were kept for quiet moments: one took the GPU too long to go between a playing game's frames. */
  readonly deferred: boolean;
  /** The whole room is baked. */
  readonly complete: boolean;
  readonly triangles: number;
  readonly pages: readonly (readonly [number, number])[];
  /** Bytes of the pages the room keeps, with their mips, and of the bake's own targets while it ran. */
  readonly pageBytes: number;
  readonly transientBytes: number;
  readonly halfFloat: boolean;
  /**
   * The way to the first shown frame, in ms since the room was created: `built` (the geometry on the main thread),
   * `compiled` (the bake's programs linked), `lit` (the opening view's pass back from the GPU), `shown`.
   */
  readonly marks: Readonly<Record<string, number>>;
}

export interface GeneratedEvents {
  /** The geometry is in and its meshes are in the scene, without their light yet. */
  readonly onBuilt: (parts: GeneratedParts) => void;
  /** What the opening view shows is baked: the room may be shown. Again after a lost context. */
  readonly onShown: (stats: GeneratedStats) => void;
  /** The whole room is baked. */
  readonly onComplete: (stats: GeneratedStats) => void;
  /** A context loss took the bake: nothing of the room may be shown until it has run again (onShown). */
  readonly onLost: () => void;
  readonly onFailed: (error: unknown) => void;
}

export interface BakeRequest {
  /** Paces the rest of the bake behind the running game. */
  readonly background: IdleWork;
  /**
   * World to clip space of the opening view, when the camera is there: what it shows is baked first. Null bakes the
   * whole room in one pass.
   */
  readonly opening: () => Matrix4 | null;
}

/** A view whose GPU work takes longer than this is not run between a playing game's frames again (ms). */
const UNIT_GPU_LIMIT_MS = 5;
/**
 * What a unit's views together may take of the GPU (ms): a quarter of a 60 Hz frame behind the room's own frames,
 * half of one while only the startup still's game draws, and most of one while a visitor waits for the room.
 */
const UNIT_GPU_TARGET_MS = { opening: 8, rest: 4, hurried: 12 };
/** What a unit's views together may take of the main thread behind the room's frames (ms). */
const UNIT_CPU_TARGET_MS = 3;
const MAX_VIEWS_A_UNIT = { opening: 24, rest: 12 };
/** How often a unit's fence is looked at (ms). */
const GPU_POLL_MS = 3;
/** What a unit costs the main thread before one is timed: a few dozen WebGL calls. */
const UNIT_ESTIMATE_MS = 2;
/** How far past the opening view's edges its pass reaches, as a share of the view: a resize's worth. */
const OPENING_MARGIN = 0.12;

/**
 * The room (docs/ROOM.md › The generated room): builds its geometry in a worker, paints its prints, puts its meshes in
 * the scene and bakes their light on the GPU, what the opening view shows first and the rest behind the running game.
 * A lost context takes the light with it; the bake then runs again.
 */
export class GeneratedRoom {
  private gen: GenScene | null = null;
  private builtIn: 'worker' | 'main' = 'worker';
  private readonly created = performance.now();
  private builtAt = 0;
  private readonly groups: Group[] = [];
  private readonly artCanvas = document.createElement('canvas');
  private art: CanvasTexture | null = null;
  private readonly exteriorCanvas = document.createElement('canvas');
  private exterior: CanvasTexture | null = null;
  /** What a chart draws with until its page is baked: the same program as with it. */
  private blank: CanvasTexture | null = null;
  private baker: Baker | null = null;
  /** A bake of nothing, made for its programs (warmUp). */
  private warm: Baker | null = null;
  private request: BakeRequest | null = null;
  private dropTask: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private waited: (() => void) | null = null;
  private shown = false;
  private complete = false;
  private hurried = false;
  private waiting: (() => void)[] = [];
  private disposed = false;
  private failed = false;
  private stopFrames: (() => void) | null = null;
  private stopCanvas: (() => void) | null = null;
  private vertexLit: Partial<Record<MeshName, Mesh>> = {};
  private charts = new Map<number, Mesh>();
  /** The opening view's cells as last classified, and the clip matrix they were classified with. */
  private opening: { readonly clip: Matrix4; readonly share: number } | null = null;
  private late: BakePart | null = null;
  private lava: LavaWax | null = null;
  /** The meshes pointer rays hit and no frame draws (pickMesh). */
  private readonly picks: Mesh[] = [];
  private radioParts: GeneratedRadio | null = null;
  private stopLava: (() => void) | null = null;
  private timings = { cpu: 0, longest: 0, started: 0, gpu: 0, deferred: false, shown: 0, baked: 0, views: 0 };
  /** What one view was last seen to take of the GPU (ms); a cautious guess before any has been timed. */
  private viewGpuMs = UNIT_GPU_TARGET_MS.rest;
  /** What one view was last seen to take of the main thread (ms). */
  private viewCpuMs = 1;
  private slowUnits = 0;
  /** When the first bake's moments came, in ms since the room was created (GeneratedStats.marks). */
  private readonly marks: Record<string, number> = {};
  private transientBytes = 0;
  private readonly tier: GeneratedTier;

  constructor(
    private readonly context: GeneratedContext,
    private readonly kit: GenKit,
    private readonly events: GeneratedEvents,
  ) {
    // Development only: tests and the bake's tuning read the instance (its scene, its timings).
    if (import.meta.env.DEV) (globalThis as { __generatedRoom?: GeneratedRoom }).__generatedRoom = this;
    this.tier = GENERATED_TIERS[context.tier];
    const canvas = context.stage.canvas;
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
    this.warmUp();
    this.build().then(
      (gen) => this.raise(gen),
      (error: unknown) => this.fail(error),
    );
  }

  /**
   * The built room into the scene, a task at a time: painting its prints, making its meshes and wiring the room to
   * them each take a slow phone tens of milliseconds, and the game is starting on the startup still meanwhile.
   */
  private async raise(gen: GenScene): Promise<void> {
    if (this.disposed) return;
    this.gen = gen;
    this.builtAt = performance.now() - this.created;
    this.mark('built');
    try {
      paintArt(this.artCanvas, this.tier.artSize);
      await pause();
      paintExterior(this.exteriorCanvas, this.tier.artSize);
      await pause();
      if (this.disposed) return;
      const parts = this.assemble(gen);
      this.mark('assembled');
      await pause();
      if (this.disposed) return;
      this.events.onBuilt(parts);
      this.mark('wired');
    } catch (error) {
      this.fail(error);
    }
  }

  get stats(): GeneratedStats | null {
    const { gen, timings } = this;
    if (!gen || !this.shown) return null;
    const pages = gen.pages.map(({ width, height }) => [width, height] as const);
    return {
      builtIn: this.builtIn,
      buildMs: gen.buildMs,
      builtAtMs: this.builtAt,
      views: timings.views,
      bakeCpuMs: timings.cpu,
      longestUnitMs: timings.longest,
      shownWallMs: timings.shown ? timings.shown - timings.started : 0,
      bakeWallMs: timings.baked ? timings.baked - timings.started : 0,
      openingShare: this.opening?.share ?? 1,
      longestGpuMs: timings.gpu,
      deferred: timings.deferred,
      complete: this.complete,
      triangles: gen.props.reduce((sum, prop) => sum + prop.triangles, 0),
      pages,
      pageBytes: Math.round(pages.reduce((sum, [w, h]) => sum + w * h * 4, 0) * (4 / 3)),
      transientBytes: this.transientBytes,
      halfFloat: this.halfFloat,
      marks: this.marks,
    };
  }

  /** The generated CD player, once its light is baked; the deck then moves its parts. */
  get radio(): GeneratedRadio | null {
    return this.shown ? this.radioParts : null;
  }

  /** Whether the lava lamp's wax is moving. */
  get lavaRunning(): boolean {
    return this.lava?.running ?? false;
  }

  /** Whether everything a view away from the TV shows is baked. */
  get whole(): boolean {
    return this.complete;
  }

  /** Starts the bake; call once the room's nodes are wired (onBuilt) and the camera stands where the page opens. */
  bake(request: BakeRequest): void {
    this.request = request;
    // In a task of its own: the caller has just wired the room.
    void pause().then(() => this.startBake());
  }

  /**
   * The visitor wants to see the rest of the room: its bake stops waiting for quiet moments and takes most of each
   * frame. Resolves once the whole room is baked (at once when it is).
   */
  whenWhole(): Promise<void> {
    if (this.complete || this.failed) return Promise.resolve();
    if (!this.hurried) {
      this.hurried = true;
      // A unit queued behind the room's frames runs now instead; one whose fence is being waited for goes on by itself.
      if (this.dropTask && this.baker) {
        const baker = this.baker;
        this.dropTask();
        this.dropTask = null;
        soon(() => this.unit(baker));
      } else if (this.timer !== null && this.waited) {
        clearTimeout(this.timer);
        soon(this.waited);
      }
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  /**
   * The opening view changed (a resize, new framing insets) while the rest of the room is still on its way: if it now
   * shows cells its own pass left out, the rest is hurried so they are not seen without their light for long.
   */
  reframed(): void {
    const clip = this.request?.opening();
    if (this.complete || !this.shown || !this.opening || !clip || this.hurried) return;
    if (!inside(clip, this.opening.clip, this.kit)) void this.whenWhole();
  }

  dispose(): void {
    this.disposed = true;
    const canvas = this.context.stage.canvas;
    canvas.removeEventListener('webglcontextlost', this.onLost);
    canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.stopWork();
    this.stopFrames?.();
    this.stopCanvas?.();
    this.stopLava?.();
    this.lava?.dispose();
    this.baker?.dispose(true);
    this.warm?.dispose(true);
    this.art?.dispose();
    this.exterior?.dispose();
    this.blank?.dispose();
    for (const group of this.groups) {
      group.traverse((object) => {
        const mesh = object as Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        (mesh.material as Material).dispose();
      });
      group.removeFromParent();
    }
    this.radioParts?.dispose();
    for (const resolve of this.waiting.splice(0)) resolve();
  }

  private get halfFloat(): boolean {
    const { extensions } = this.context.stage.renderer;
    return extensions.has('EXT_color_buffer_half_float') || extensions.has('EXT_color_buffer_float');
  }

  /** Compiles the bake's programs while the worker builds the room. */
  private warmUp(): void {
    const { kit: k, context } = this;
    try {
      this.art = new k.CanvasTexture(this.artCanvas);
      const warm = new Baker(k, context.stage.renderer, context.stage.scene, tinyScene(), this.art, this.bakeOptions());
      this.warm = warm;
      warm.compile().catch(() => {});
    } catch {
      // The real bake says what is wrong.
    }
  }

  /** The geometry, from the worker; on the main thread where a worker cannot be had. */
  private build(): Promise<GenScene> {
    const tier = this.tier;
    const request: GenRequest = { densityScale: tier.density, maxPageSize: tier.pageSize, detail: tier.detail };
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

  /** The meshes a frame draws, in the scene without their light: nothing shows them until the bake has filled it in. */
  private assemble(gen: GenScene): GeneratedParts {
    const { kit: k, context } = this;
    const group = (name: string): Group => {
      const made = new k.Group();
      made.name = name;
      this.groups.push(made);
      context.stage.scene.add(made);
      return made;
    };
    const room = group('GeneratedRoom');
    const tvSet = group('GeneratedTv');
    const pc = group('GeneratedPc');
    const desk = group('GeneratedDesk');

    const vertexLit = (mesh: MeshName, name: string): Mesh => {
      const data = gen.meshes[mesh];
      const geometry = new k.BufferGeometry();
      geometry.setAttribute('position', new k.BufferAttribute(data.positions, 3));
      geometry.setAttribute('normal', new k.BufferAttribute(data.normals, 3));
      geometry.setAttribute('color', new k.BufferAttribute(new Float32Array(data.positions.length), 3));
      const material = new k.MeshBasicMaterial({ vertexColors: true });
      // The finish knows a baked surface by its material's name (its sheen, its varnish: RoomGloss).
      material.name = name;
      const made = new k.Mesh(geometry, material);
      made.name = `Generated ${mesh}`;
      made.layers.enable(CASTERS_ALL);
      made.layers.enable(CASTERS_LOCAL);
      this.vertexLit[mesh] = made;
      return made;
    };
    const tv = vertexLit('tv', 'device_tv_front_BAKED_UNLIT');
    const monitor = vertexLit('monitor', 'device_pc_BAKED_UNLIT');
    const props = vertexLit('props', '01_TV_props_BAKED_UNLIT');
    // The desk corner's props: their own mesh, culled by the frustum of a view that looks away from the desk.
    const deskProps = vertexLit('desk', '02_Desk_props_BAKED_UNLIT');
    // Light itself: the globe and the bulb's filament are drawn in their lamp's colour, pushed past white so the
    // finish's highlights bloom around them.
    const emitter = (mesh: MeshName, name: string, light: { color: readonly number[]; glow: number }): Mesh => {
      const data = gen.meshes[mesh];
      const geometry = new k.BufferGeometry();
      geometry.setAttribute('position', new k.BufferAttribute(data.positions, 3));
      geometry.setAttribute('normal', new k.BufferAttribute(data.normals, 3));
      const material = new k.MeshBasicMaterial();
      material.name = name;
      material.color.setRGB(
        (light.color[0] ?? 1) * light.glow,
        (light.color[1] ?? 1) * light.glow,
        (light.color[2] ?? 1) * light.glow,
      );
      const made = new k.Mesh(geometry, material);
      made.name = `Generated ${mesh}`;
      return made;
    };
    const globe = emitter('globe', '01_TV_lamp_opaline_BAKED_UNLIT', TV_LAMP_SPEC);
    const filament = emitter('filament', '01_TV_bulb_filament_BAKED_UNLIT', BULB_SPEC);
    // The bulb's glass: clear, so only what it reflects, added to the frame in the colours its generator gave it. The
    // lava lamp's bottle is drawn the same way (LavaWax), on the same program.
    const bulbData = gen.meshes.bulb;
    const bulbGeometry = new k.BufferGeometry();
    bulbGeometry.setAttribute('position', new k.BufferAttribute(bulbData.positions, 3));
    bulbGeometry.setAttribute('color', new k.BufferAttribute(bulbData.albedo, 3));
    const bulb = new k.Mesh(
      bulbGeometry,
      new k.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        // Its alpha (what the finish reads as a surface, not a display) is left alone.
        blending: k.CustomBlending,
        blendSrc: k.OneFactor,
        blendDst: k.OneFactor,
        blendSrcAlpha: k.ZeroFactor,
        blendDstAlpha: k.OneFactor,
        depthWrite: false,
      }),
    );
    bulb.name = 'Generated bulb glass';

    const blankCanvas = document.createElement('canvas');
    blankCanvas.width = blankCanvas.height = 1;
    this.blank = new k.CanvasTexture(blankCanvas);
    this.blank.colorSpace = k.SRGBColorSpace;
    const names: Record<number, string> = {
      [GROUP.cabinet]: '01_TV_surfaces_BAKED_UNLIT',
      [GROUP.wall]: '03_Room_surfaces_BAKED_UNLIT',
      [GROUP.floor]: '03_Room_floor_BAKED_UNLIT',
      [GROUP.desk]: '02_Desk_surfaces_BAKED_UNLIT',
      [GROUP.dresser]: '04_Drawer_surfaces_BAKED_UNLIT',
      // Wool: baked like the floor it lies on, but no varnish (RoomGloss gives a name it does not list none).
      [GROUP.rug]: '03_Room_rug_BAKED_UNLIT',
    };
    for (const data of gen.charts.display) {
      const geometry = new k.BufferGeometry();
      geometry.setAttribute('position', new k.BufferAttribute(data.positions, 3));
      geometry.setAttribute('normal', new k.BufferAttribute(data.normals, 3));
      geometry.setAttribute('uv', new k.BufferAttribute(data.uvs, 2));
      const material = new k.MeshBasicMaterial({ map: this.blank });
      material.name = names[data.group] ?? '01_TV_surfaces_BAKED_UNLIT';
      material.userData.page = data.page;
      const mesh = new k.Mesh(geometry, material);
      mesh.name = `Generated charts ${data.group}`;
      // The shell does not shadow the room's lights: they stand inside it.
      if (data.group !== GROUP.wall && data.group !== GROUP.floor && data.group !== GROUP.rug) {
        mesh.layers.enable(CASTERS_ALL);
        mesh.layers.enable(CASTERS_LOCAL);
      }
      this.charts.set(data.group, mesh);
    }

    this.art ??= new k.CanvasTexture(this.artCanvas);
    this.art.colorSpace = k.SRGBColorSpace;
    this.art.flipY = false;
    this.art.anisotropy = context.anisotropy;
    // The view outside: a plate behind the window, which the rain's refraction samples (userData.exterior).
    this.exterior = new k.CanvasTexture(this.exteriorCanvas);
    this.exterior.colorSpace = k.SRGBColorSpace;
    this.stopCanvas = k.onCanvasRestored(this.artCanvas, () => this.paint());
    // The prints: the set's own (its legends and wordmark go where the set goes), and everything else's.
    const printsOf = (tvOnly: boolean): Mesh => {
      const [start, count] = gen.props.find((prop) => prop.name === 'tv-set')?.decals ?? [0, 0];
      const pick = (array: Float32Array, size: number): Float32Array => {
        const [from, to] = [start * 6 * size, (start + count) * 6 * size];
        if (tvOnly) return array.subarray(from, to);
        const rest = new Float32Array(array.length - (to - from));
        rest.set(array.subarray(0, from));
        rest.set(array.subarray(to), from);
        return rest;
      };
      const geometry = new k.BufferGeometry();
      geometry.setAttribute('position', new k.BufferAttribute(pick(gen.decals.positions, 3), 3));
      geometry.setAttribute('uv', new k.BufferAttribute(pick(gen.decals.uvs, 2), 2));
      geometry.setAttribute('color', new k.BufferAttribute(pick(gen.decals.tints, 3), 3));
      const mesh = new k.Mesh(
        geometry,
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
      mesh.name = tvOnly ? 'Generated TV prints' : 'Generated prints';
      return mesh;
    };

    const { minX, maxX, minY, maxY, z } = EXTERIOR_PLATE;
    const plate = new k.BufferGeometry();
    plate.setAttribute(
      'position',
      new k.BufferAttribute(
        new Float32Array([minX, minY, z, maxX, minY, z, maxX, maxY, z, minX, minY, z, maxX, maxY, z, minX, maxY, z]),
        3,
      ),
    );
    plate.setAttribute('uv', new k.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), 2));
    const outside = new k.Mesh(plate, new k.MeshBasicMaterial({ map: this.exterior }));
    outside.name = 'Generated view outside';
    outside.userData.exterior = true;

    // The lava lamp's wax and bottle: the wax moves, by the clock, while the room is what is drawn.
    this.lava = new LavaWax(k, gen.meshes.glass, {
      camera: context.stage.camera,
      isVisible: () => this.shown && context.stage.visible,
      reducedMotion: context.reducedMotion,
      invalidate: () => context.stage.loop.invalidate(),
    });
    this.stopLava = context.stage.onRender(this.lava.sync);

    // The CD player, part by part on its pivots.
    this.radioParts = new GeneratedRadio(k, gen);
    context.stage.scene.add(this.radioParts.group);

    tvSet.add(tv, printsOf(true));
    pc.add(monitor, this.pickMesh(gen, deskProps, PICK_PROPS.pc, 'desk'));
    const deskCharts = this.charts.get(GROUP.desk);
    if (deskCharts) desk.add(deskCharts);
    desk.add(this.pickMesh(gen, deskProps, PICK_PROPS.desk, 'desk'));
    room.add(props, deskProps, globe, filament, bulb, printsOf(false), outside, ...this.lava.meshes);
    for (const [index, mesh] of this.charts) if (index !== GROUP.desk) room.add(mesh);
    return { tv: tvSet, pc, monitor, desk, dresser: this.charts.get(GROUP.dresser) ?? null, radio: this.radioParts };
  }

  /**
   * The named props' triangles of the merged props mesh as a mesh of their own, for pointer rays only: it shares the
   * props' vertices, holds an index and its own bounds, and is never drawn.
   */
  private pickMesh(gen: GenScene, props: Mesh, names: readonly string[], from: MeshName = 'props'): Mesh {
    const { kit: k } = this;
    const ranges = gen.props.flatMap((prop) =>
      names.includes(prop.name) && prop.ranges[from] ? [prop.ranges[from] as readonly [number, number]] : [],
    );
    const index = new Uint32Array(ranges.reduce((sum, [, count]) => sum + count, 0));
    const positions = gen.meshes[from].positions;
    const low = [Infinity, Infinity, Infinity];
    const high = [-Infinity, -Infinity, -Infinity];
    let at = 0;
    for (const [start, count] of ranges)
      for (let vertex = start; vertex < start + count; vertex++) {
        index[at++] = vertex;
        for (let c = 0; c < 3; c++) {
          const value = positions[vertex * 3 + c] as number;
          low[c] = Math.min(low[c] as number, value);
          high[c] = Math.max(high[c] as number, value);
        }
      }
    const geometry = new k.BufferGeometry();
    geometry.setAttribute('position', props.geometry.getAttribute('position'));
    geometry.setIndex(new k.BufferAttribute(index, 1));
    geometry.boundingBox = new k.Box3(new k.Vector3(...low), new k.Vector3(...high));
    geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new k.Sphere());
    const mesh = new k.Mesh(geometry, props.material);
    mesh.name = `Pick ${names.join(' ')}`;
    mesh.visible = false;
    this.picks.push(mesh);
    return mesh;
  }

  private paint(): void {
    paintArt(this.artCanvas, this.tier.artSize);
    if (this.art) this.art.needsUpdate = true;
    paintExterior(this.exteriorCanvas, this.tier.artSize);
    if (this.exterior) this.exterior.needsUpdate = true;
  }

  private bakeOptions(): ConstructorParameters<typeof Baker>[5] {
    const { stage } = this.context;
    const tier = this.tier;
    // The finish's static lights as the room sets them for this mood (none without a finish).
    const lit = stage.mood !== 'original';
    return {
      shadowSize: tier.shadowSize,
      lightScale: tier.lightScale,
      sampleSet: tier.sampleSet,
      halfFloat: this.halfFloat,
      exposure: 1,
      staticColor: TV_LAMP_SPEC.color.map((value) => (lit ? value * TV_LAMP_INTENSITY : 0)) as [number, number, number],
      warmth: POOL_WARMTH[stage.mood],
      anisotropy: this.context.anisotropy,
    };
  }

  private startBake(): void {
    const { gen, art, context, kit, request } = this;
    if (!gen || !art || !request || this.disposed || this.failed) return;
    const { stage } = context;
    let baker: Baker;
    try {
      baker = new Baker(kit, stage.renderer, stage.scene, gen, art, this.bakeOptions());
    } catch (error) {
      this.fail(error);
      return;
    }
    this.baker = baker;
    this.mark('baker');
    this.transientBytes = baker.transientBytes;
    this.timings = { cpu: 0, longest: 0, started: 0, gpu: 0, deferred: false, shown: 0, baked: 0, views: 0 };
    this.viewGpuMs = UNIT_GPU_TARGET_MS.rest;
    this.slowUnits = 0;
    // The display's programs and the bake's link off the main thread; the first unit waits for the bake's. In the
    // next task: making the bake's buffers and the programs' sources are each a slow phone's whole frame or two.
    void pause().then(() => {
      if (this.disposed || this.baker !== baker) return;
      // What the opening view shows goes first; without one (the camera is elsewhere) the whole room is one pass.
      const clip = request.opening();
      const parts = clip ? openingParts(gen, clip, kit) : null;
      this.opening = clip && parts ? { clip: clip.clone(), share: parts.share } : null;
      this.late = parts && parts.share < 1 ? parts.late : null;
      if (parts && this.late) baker.begin(parts.early);
      // The pick meshes are never drawn, so they stay out of the compile: `renderer.compile` prepares invisible
      // meshes too, and the props' material on their geometry without normals is a program of its own under a finish.
      const parents = this.picks.map((pick) => pick.parent);
      for (const pick of this.picks) pick.removeFromParent();
      stage.prepare(stage.scene);
      this.picks.forEach((pick, i) => void parents[i]?.add(pick));
      this.mark('prepared');
      this.compile(baker);
    });
  }

  private compile(baker: Baker): void {
    baker.compile().then(
      () => {
        if (this.disposed || this.baker !== baker) return;
        this.mark('compiled');
        // The real bake holds the programs now.
        this.warm?.dispose(true);
        this.warm = null;
        this.next(baker);
      },
      (error: unknown) => this.fail(error),
    );
  }

  /**
   * Queues the bake's next unit: a few views, as many as the GPU has been seen to do in the time a unit may take.
   * Until the opening view is baked nothing of the room is on screen and units follow each other as fast as the GPU
   * takes them. After that IdleWork says when the main thread may run one (between a playing game's frames while a
   * view is quick on this GPU, else only in a quiet moment, unless a visitor is waiting for the room). The unit after
   * is never queued until the GPU has this one's work behind it, so frames go in between and no two pile up on one.
   */
  private next(baker: Baker): void {
    if (this.paced) this.queue(baker);
    else soon(() => this.unit(baker));
  }

  private queue(baker: Baker): void {
    this.dropTask?.();
    if (!this.request) return;
    const run = this.unit.bind(this);
    const kit = this.kit;
    const deferred = (): boolean => this.timings.deferred;
    this.dropTask = this.request.background.add(
      (function* (): IdleTask {
        // Kept for a quiet moment once a single view has taken the GPU too long to hide between two frames.
        if (deferred()) yield kit.quiet;
        run(baker);
      })(),
      { estimateMs: UNIT_ESTIMATE_MS, apart: true },
    );
  }

  private unit(baker: Baker): void {
    this.timer = null;
    this.dropTask = null;
    if (this.disposed || this.baker !== baker) return;
    const { renderer } = this.context.stage;
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number } | null;
    // The opening pass does not wait for a timer's result (it follows the fence by a task or two): the wait for the
    // fence is its measure.
    const query = timer && this.paced ? gl.createQuery() : null;
    const started = performance.now();
    if (!this.timings.started) this.timings.started = started;
    if (timer && query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
    const target = this.hurried
      ? UNIT_GPU_TARGET_MS.hurried
      : this.shown
        ? UNIT_GPU_TARGET_MS.rest
        : UNIT_GPU_TARGET_MS.opening;
    const most = this.paced ? MAX_VIEWS_A_UNIT.rest : MAX_VIEWS_A_UNIT.opening;
    // Behind the room's frames a unit is also short on the main thread: IdleWork judges every task's untimed units by
    // the longest unit it has run, and a long one here would keep the monitor's still waiting for a quiet moment.
    const cpu = this.paced ? Math.floor(UNIT_CPU_TARGET_MS / this.viewCpuMs) : most;
    const views = Math.max(1, Math.min(most, cpu, Math.floor(target / this.viewGpuMs)));
    // The bake clears with its own colour; the room's frames clear with theirs.
    const clearAlpha = renderer.getClearAlpha();
    const clearColor = renderer.getClearColor(new this.kit.Color());
    let more = true;
    let stepped = 0;
    try {
      for (; stepped < views && more; stepped++) more = baker.step();
    } catch (error) {
      this.fail(error);
      return;
    } finally {
      renderer.setClearColor(clearColor, clearAlpha);
    }
    this.timings.views += more ? stepped : Math.max(0, stepped - 2);
    if (timer && query) gl.endQuery(timer.TIME_ELAPSED_EXT);
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const took = performance.now() - started;
    if (stepped > 0) this.viewCpuMs = Math.max(0.05, took / stepped);
    this.timings.cpu += took;
    this.timings.longest = Math.max(this.timings.longest, took);
    if (!more) {
      if (query) gl.deleteQuery(query);
      if (sync) gl.deleteSync(sync);
      baker.result().then(
        (result) => this.passed(baker, result),
        (error: unknown) => this.fail(error),
      );
      return;
    }
    // Wait for the GPU, off the frame's path, then judge the unit and queue the next.
    let polls = 0;
    const poll = (): void => {
      this.timer = null;
      this.waited = null;
      if (this.disposed || this.baker !== baker) return;
      const signalled = !sync || gl.clientWaitSync(sync, 0, 0) !== gl.TIMEOUT_EXPIRED;
      const measured = query ? (gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) as boolean) : false;
      // The timer's result follows the fence by a task or two; without a timer the wait itself is the measure.
      if (!signalled || (query && !measured && ++polls < 6)) {
        if (this.paced) this.wait(poll, signalled ? 0 : GPU_POLL_MS);
        else later(poll);
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
      // One slow reading is the GPU busy with a frame; three in a row is this GPU.
      this.slowUnits = this.viewGpuMs > UNIT_GPU_LIMIT_MS ? this.slowUnits + 1 : 0;
      if (this.slowUnits >= 3) this.timings.deferred = true;
      this.next(baker);
    };
    if (this.paced) this.wait(poll, GPU_POLL_MS);
    else later(poll);
  }

  /** A pass is back from the GPU: light the meshes; after the opening view's, show the room and start on the rest. */
  private passed(baker: Baker, result: BakeResult): void {
    const { gen, context } = this;
    if (this.disposed || this.baker !== baker || !gen) return;
    this.mark('lit');
    if (!this.shown) {
      // A program the driver refused draws nothing and says nothing: a room without any light is not a room.
      let light = 0;
      for (let i = 0; i < result.colors.length && light === 0; i += 97) light += result.colors[i] as number;
      if (light === 0) {
        this.fail(new Error('The bake lit nothing'));
        return;
      }
      let offset = 0;
      for (const [name, data] of Object.entries(gen.meshes)) {
        const count = data.positions.length;
        const colors = this.vertexLit[name as MeshName]?.geometry.getAttribute('color') as BufferAttribute | undefined;
        if (colors) {
          (colors.array as Float32Array).set(result.colors.subarray(offset, offset + count));
          colors.needsUpdate = true;
        }
        offset += count;
      }
      this.radioParts?.light(result.colors);
      for (const mesh of this.charts.values()) {
        const material = mesh.material as MeshBasicMaterial;
        material.map = result.pages[material.userData.page as number] ?? this.blank;
      }
    }
    const late = this.late;
    this.late = null;
    if (!late) {
      baker.dispose();
      this.timings.baked = performance.now();
    }
    const done = (): void => {
      if (!late) {
        this.complete = true;
        this.hurried = false;
        this.events.onComplete(this.stats as GeneratedStats);
        for (const resolve of this.waiting.splice(0)) resolve();
        return;
      }
      baker.begin(late);
      this.next(baker);
    };
    if (this.shown) {
      done();
      return;
    }
    linked(context.stage.renderer).then(() => {
      if (this.disposed || this.baker !== baker) return;
      this.shown = true;
      this.timings.shown = performance.now();
      this.mark('shown');
      this.lava?.sync();
      // Sixty frames a second in every view, whether or not something moves.
      this.stopFrames ??= sixtyFrames(context.stage);
      this.events.onShown(this.stats as GeneratedStats);
      done();
    });
  }

  private mark(name: string): void {
    this.marks[name] ??= Math.round(performance.now() - this.created);
  }

  /**
   * Whether the bake's units wait their turn behind the room's frames (IdleWork, timers): once the room is on screen,
   * unless a visitor waits for the rest of it. Otherwise they follow each other as fast as the GPU takes them.
   */
  private get paced(): boolean {
    return this.shown && !this.hurried;
  }

  /** A look at a unit's fence, later: on a timer, which a visitor's wait for the room cuts short (whenWhole). */
  private wait(poll: () => void, ms: number): void {
    this.waited = poll;
    this.timer = setTimeout(poll, ms);
  }

  private stopWork(): void {
    this.dropTask?.();
    this.dropTask = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.waited = null;
  }

  private readonly onLost = (): void => {
    // The pages are gone with the context. Freed now, while the lost context takes every call in silence: after the
    // restore the same calls would name objects of a context that no longer exists.
    this.stopWork();
    this.stopFrames?.();
    this.stopFrames = null;
    this.baker?.dispose(true);
    this.baker = null;
    this.warm?.dispose(true);
    this.warm = null;
    for (const mesh of this.charts.values()) (mesh.material as MeshBasicMaterial).map = this.blank;
    const was = this.shown;
    this.shown = false;
    this.complete = false;
    this.lava?.sync();
    if (was) this.events.onLost();
  };

  private readonly onRestored = (): void => {
    if (this.disposed || !this.gen) return;
    this.paint();
    this.startBake();
  };

  private fail(error: unknown): void {
    if (this.disposed || this.failed) return;
    this.failed = true;
    this.stopWork();
    this.events.onFailed(error);
    for (const resolve of this.waiting.splice(0)) resolve();
  }
}

/**
 * The chart cells (six vertices each, kit/charts.ts) a view shows, and the rest, as the two parts of a bake: a cell is
 * the view's unless all its corners lie beyond one of the view's planes, pushed out by OPENING_MARGIN.
 */
function openingParts(
  gen: GenScene,
  clip: Matrix4,
  kit: GenKit,
): { readonly early: BakePart; readonly late: BakePart; readonly share: number } {
  const corner = new kit.Vector4();
  const reach = 1 + OPENING_MARGIN;
  const early: Uint32Array[] = [];
  const late: Uint32Array[] = [];
  let [seen, all] = [0, 0];
  for (const mesh of gen.charts.bake) {
    const cells = mesh.positions.length / 18;
    const first: number[] = [];
    const rest: number[] = [];
    for (let cell = 0; cell < cells; cell++) {
      let outside = 63;
      for (let vertex = 0; vertex < 6; vertex++) {
        const at = (cell * 6 + vertex) * 3;
        const p = corner
          .set(mesh.positions[at] as number, mesh.positions[at + 1] as number, mesh.positions[at + 2] as number, 1)
          .applyMatrix4(clip);
        const w = p.w * reach;
        outside &=
          (p.x < -w ? 1 : 0) |
          (p.x > w ? 2 : 0) |
          (p.y < -w ? 4 : 0) |
          (p.y > w ? 8 : 0) |
          (p.z < -p.w ? 16 : 0) |
          (p.z > p.w ? 32 : 0);
      }
      const list = outside === 0 ? first : rest;
      for (let vertex = 0; vertex < 6; vertex++) list.push(cell * 6 + vertex);
    }
    early.push(new Uint32Array(first));
    late.push(new Uint32Array(rest));
    seen += first.length;
    all += cells * 6;
  }
  return {
    early: { charts: early, vertices: true },
    late: { charts: late, vertices: false },
    share: all ? seen / all : 1,
  };
}

/** Whether the view `clip` shows nothing the view `within` (with its margin) did not: its corners, near and far. */
function inside(clip: Matrix4, within: Matrix4, kit: GenKit): boolean {
  const unproject = clip.clone().invert();
  const corner = new kit.Vector4();
  const reach = 1 + OPENING_MARGIN;
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 0.999 : -1, 1).applyMatrix4(unproject);
    corner.multiplyScalar(1 / corner.w).applyMatrix4(within);
    if (Math.abs(corner.x) > corner.w * reach || Math.abs(corner.y) > corner.w * reach) return false;
  }
  return true;
}

/**
 * Runs `task` as the next task, without a timer's clamp (4 ms once timers nest): the opening pass's units and the
 * looks at their fences follow each other with frames and input in between, and no time lost.
 */
/** Longest a slice of the room's raising waits for the page to be idle (ms). */
const PAUSE_MS = 120;

/**
 * Ends a task of the room's raising. The next starts when the page is idle, so whatever else is starting (the game, on
 * the startup still) goes first; on an idle page that is at once, and on a busy one within PAUSE_MS.
 */
const pause = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: PAUSE_MS });
    else soon(resolve);
  });

function soon(task: () => void): void {
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    channel.port1.close();
    task();
  };
  channel.port2.postMessage(null);
}

/**
 * Runs `task` once nothing more urgent is queued, without a timer: a look at a fence the GPU has yet to reach. Polling
 * it as the very next task would keep the page from ever being idle, and the app's own idle work (the computer's
 * wallpaper) waiting for the whole bake.
 */
function later(task: () => void): void {
  const tasks = (globalThis as { scheduler?: { postTask?(task: () => void, options: { priority: string }): unknown } })
    .scheduler;
  if (typeof tasks?.postTask === 'function') void tasks.postTask(task, { priority: 'background' });
  else soon(task);
}

/**
 * The smallest scene a Baker takes: one chart cell and one triangle. Its programs are the bake's, so compiling them
 * while the worker still builds the room leaves the real bake nothing to wait for (three shares programs by source).
 */
function tinyScene(): GenScene {
  const cell = (size: number): Float32Array => new Float32Array(6 * size);
  const mesh = {
    positions: new Float32Array(9),
    normals: new Float32Array(9),
    albedo: new Float32Array(9),
    shade: new Float32Array(3),
  };
  return {
    meshes: { tv: mesh },
    pages: [{ width: 32, height: 32 }],
    charts: {
      display: [],
      bake: [
        {
          page: 0,
          positions: cell(3),
          normals: cell(3),
          uvs: cell(2),
          local: cell(2),
          st: cell(2),
          material: cell(1),
          params: cell(4),
          shade: cell(1),
        },
      ],
    },
    decals: { positions: new Float32Array(0), uvs: new Float32Array(0), tints: new Float32Array(0) },
    props: [],
    buildMs: 0,
  } as unknown as GenScene;
}

/** Longest the room waits for its programs to link before drawing with them anyway (ms). */
const LINK_WAIT_MS = 4000;

/**
 * Resolves once every program the renderer holds has linked, so the frame that first draws the room does not wait on
 * the driver. Where the GPU cannot say (no KHR_parallel_shader_compile) it resolves at once.
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
      else setTimeout(poll, 4);
    };
    poll();
  });
}

/**
 * Asks for frames all the time, as a run of frames (so the quality governor judges them), until the returned function
 * is called: on the display's own frames (`RenderLoop.pace`), so a 60 Hz display draws every frame and a 120 Hz one
 * every other, evenly spaced. None while the canvas is off screen or the tab hidden.
 */
function sixtyFrames(stage: RoomStage): () => void {
  return stage.loop.pace(() => stage.visible);
}
