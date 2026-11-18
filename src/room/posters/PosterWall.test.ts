import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BufferGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type IdleTask, type IdleTaskOptions, type IdleWork, QUIET } from '../stage/IdleWork';
import type { RoomStage } from '../stage/RoomStage';
import type { ViewController } from '../ViewController';
import type { RoomView } from '../viewState';
import { POSTERS_FADE_MS, PosterWall } from './PosterWall';
import type { PaintRequest } from './paint/worker';
import type { PosterKit } from './posterKit';

/** The 2K tier's strips (stripUpload.ts): the fake uploader yields once per strip. */
const STRIPS = 8;
/** The units the fake painter takes after its first (the real one: one per sheet). */
const SHEETS = 3;

/** The main thread's painter, faked: how often it started, and whether it finds a 2D canvas. */
const painter = { fails: false, started: 0 };
const atlas = {
  atlasSize: (scale: number) => [2048 * scale, 1024 * scale] as const,
  paintAtlas: function* () {
    painter.started++;
    if (painter.fails) throw new Error('No 2D canvas for the posters');
    for (let sheet = 0; sheet < SHEETS; sheet++) yield;
  },
} as unknown as typeof import('./paint/atlas');

interface FakeBitmap {
  readonly width: number;
  readonly height: number;
  readonly close: ReturnType<typeof vi.fn>;
}

/** The painter's worker, faked: it answers a request with a bitmap of the asked size on the next turn. */
class FakeWorker {
  onmessage: ((event: { data: FakeBitmap | null }) => void) | null = null;
  onerror: (() => void) | null = null;
  readonly terminate = vi.fn();
  readonly requests: PaintRequest[] = [];
  constructor(
    private readonly bitmaps: FakeBitmap[],
    private readonly answer: 'bitmap' | 'null' | 'error' | 'never',
  ) {}
  postMessage(request: PaintRequest): void {
    this.requests.push(request);
    if (this.answer === 'never') return;
    setTimeout(() => {
      if (this.answer === 'error') return this.onerror?.();
      if (this.answer === 'null') return this.onmessage?.({ data: null });
      const bitmap = { width: 2048 * request.scale, height: 1024 * request.scale, close: vi.fn() };
      this.bitmaps.push(bitmap);
      this.onmessage?.({ data: bitmap });
    }, 0);
  }
}

interface Setup {
  readonly lite?: boolean;
  /** Whether a piece is in the camera's frame (posterVisibility.anyInView). */
  readonly inView?: () => boolean;
  /** compileAsync's promises settle only when the test resolves them (`compiles`). */
  readonly deferCompile?: boolean;
  /** The faces never arrive. */
  readonly noFonts?: boolean;
  /** What the painter's worker does: answers with a bitmap (the default), or not; 'none': there is no worker. */
  readonly worker?: 'bitmap' | 'null' | 'error' | 'never' | 'none' | 'throws';
}

interface FakeCanvas extends EventTarget {
  width: number;
  height: number;
}

function setup(options: Setup = {}) {
  painter.fails = false;
  painter.started = 0;
  const canvases: FakeCanvas[] = [];
  vi.stubGlobal('document', {
    createElement: () => {
      const canvas = Object.assign(new EventTarget(), { width: 300, height: 150 });
      canvases.push(canvas);
      return canvas;
    },
    fonts: { load: () => (options.noFonts === true ? new Promise(() => {}) : Promise.resolve([])) },
  });
  vi.stubGlobal('location', { href: 'https://example.test/' });
  const bitmaps: FakeBitmap[] = [];
  const workers: FakeWorker[] = [];
  const startPainter = (): Worker | null => {
    const answer = options.worker ?? 'bitmap';
    if (answer === 'none') return null;
    if (answer === 'throws') throw new Error('No workers here');
    const worker = new FakeWorker(bitmaps, answer);
    workers.push(worker);
    return worker as unknown as Worker;
  };

  // IdleWork's contract: a drop takes the task off the queue and ends it, so its `finally` runs.
  const queue: { task: IdleTask; options: IdleTaskOptions }[] = [];
  /** What the screen is doing, as IdleWork would say: a test that flies sets it. */
  const moment = { now: 'quiet' as 'quiet' | 'flying' };
  const background = {
    hurry: vi.fn(),
    moment: () => moment.now,
    add: (task: IdleTask, taskOptions: IdleTaskOptions = {}) => {
      const queued = { task, options: taskOptions };
      queue.push(queued);
      return () => {
        const at = queue.indexOf(queued);
        if (at >= 0) queue.splice(at, 1);
        task.return();
      };
    },
  };
  /** Runs up to `limit` queued units, first task first, as the room's idle work would. */
  const runUnits = (limit = 100): unknown[] => {
    const yielded: unknown[] = [];
    for (let units = 0; queue.length > 0 && units < limit; units++) {
      const queued = queue[0] as (typeof queue)[number];
      const result = queued.task.next();
      if (result.done) {
        const at = queue.indexOf(queued);
        if (at >= 0) queue.splice(at, 1);
      } else yielded.push(result.value);
    }
    return yielded;
  };

  const animations: ((now: number) => boolean)[] = [];
  const warm = vi.fn();
  const canvas = new EventTarget();
  /** Resolves each deferred compileAsync, in call order. */
  const compiles: (() => void)[] = [];
  const scene = new Group();
  const stage = {
    softwareGpu: options.lite === true,
    size: { width: 1440, height: 900, pixelRatio: 2 },
    canvas,
    scene,
    camera: {},
    renderer: {},
    // The stage compiles for the target frames draw into (RoomStage.prepareAsync) and warms what it is given.
    prepareAsync: () =>
      options.deferCompile === true ? new Promise<void>((resolve) => compiles.push(resolve)) : Promise.resolve(),
    warm,
    loop: {
      invalidate: vi.fn(),
      animate: (step: (now: number) => boolean) => {
        animations.push(step);
        return () => animations.splice(animations.indexOf(step), 1);
      },
    },
    onResize: () => () => {},
  } as unknown as RoomStage;
  /** Runs every animation one frame at `now`. */
  const frame = (now: number) => {
    for (const step of [...animations]) if (!step(now)) animations.splice(animations.indexOf(step), 1);
  };

  const settles: ((view: RoomView) => void)[] = [];
  const changes: (() => void)[] = [];
  const views = {
    view: 'tv' as RoomView,
    moving: false,
    onSettle: (listener: (view: RoomView) => void) => {
      settles.push(listener);
      return () => {};
    },
    onChange: (listener: () => void) => {
      changes.push(listener);
      return () => {};
    },
  };
  /** The camera leaves for `view` and comes to rest there. */
  const flyTo = (view: RoomView) => {
    views.moving = true;
    for (const listener of changes) listener();
    views.view = view;
  };
  const land = () => {
    views.moving = false;
    for (const listener of settles) listener(views.view);
  };

  const targets: { image: { width: number; height: number }; dispose: ReturnType<typeof vi.fn> }[] = [];
  /** The frames the wall timed its first flight by, as it hands them to the slow-device rule. */
  const slowFlight = vi.fn((_frames: readonly number[]) => false);
  /** What each upload was handed, and its size then (the canvas is let go after). */
  const uploaded: { canvas: unknown; width: number }[] = [];
  const kit = {
    flightMs: 1100,
    cutHoldMs: 1200,
    tier: () => '2k',
    slowFlight,
    quiet: QUIET,
    allocateStripTarget: (_renderer: unknown, width: number, height: number) => {
      const target = { image: { width, height }, dispose: vi.fn() };
      targets.push(target);
      return target;
    },
    uploadStrips: function* (_renderer: unknown, image: FakeCanvas | FakeBitmap) {
      uploaded.push({ canvas: image, width: image.width });
      for (let strip = 0; strip < STRIPS; strip++) yield QUIET;
    },
    decorBoxes: () => [],
    anyInView: options.inView ?? (() => false),
    group: () => new Group(),
    mesh: (_numbers: unknown, material: MeshBasicMaterial) => new Mesh(new BufferGeometry(), material),
    skirtsOrder: 1,
    cardsOrder: 2,
    fadingCardsOrder: -1,
    cardsMaterial: () => new MeshBasicMaterial({ name: 'posters_cards' }),
    skirtsMaterial: () => new MeshBasicMaterial({ name: 'posters_skirts' }),
  } as unknown as PosterKit;

  const events = { onStaged: vi.fn(), onShown: vi.fn(), onLost: vi.fn(), onFailed: vi.fn() };
  const wall = new PosterWall(
    { stage, views: views as unknown as ViewController, background: background as unknown as IdleWork, anisotropy: 4 },
    kit,
    events,
    startPainter,
    async () => atlas,
  );
  const node = () => scene.children[0] as Group | undefined;
  const meshes = () => {
    const found: Mesh[] = [];
    node()?.traverse((object) => {
      if ((object as Mesh).isMesh) found.push(object as Mesh);
    });
    const byName = (name: string) => found.find((mesh) => (mesh.material as MeshBasicMaterial).name === name);
    return { cards: byName('posters_cards'), skirts: byName('posters_skirts') };
  };
  return {
    wall,
    events,
    background,
    queue,
    runUnits,
    frame,
    animations,
    canvas,
    canvases,
    bitmaps,
    workers,
    uploaded,
    targets,
    compiles,
    flyTo,
    land,
    node,
    meshes,
    moment,
    warm,
    slowFlight,
  };
}

function materialOf(mesh: Mesh | undefined): MeshBasicMaterial {
  if (!mesh) throw new Error('No such mesh');
  return mesh.material as MeshBasicMaterial;
}

/** Lets the faces' promise and a compile's settle. */
const flush = async () => {
  for (let turn = 0; turn < 5; turn++) await new Promise((resolve) => setTimeout(resolve, 0));
};

/** The main thread's own painting, where there is no worker: its units, the last of which ends it. */
const PAINT_UNITS = SHEETS + 1;

/**
 * At the TV with the geometry built (one unit) and the atlas painted by the worker: the wall is staged (on a hardware
 * GPU its upload is queued, not run).
 */
async function staged(options: Setup = {}) {
  const context = setup(options);
  context.runUnits(1);
  await flush();
  return context;
}

/** Every runtime import a module makes, followed through the posters' own folders. */
function runtimeImports(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) return seen;
  seen.add(file);
  const source = readFileSync(file, 'utf8');
  for (const [statement, specifier] of source.matchAll(/^import\b[^;]*?from '([^']+)';/gm)) {
    if (statement.startsWith('import type ')) continue;
    // A face's file is an address, not code.
    if (!specifier || specifier.endsWith('.woff2?url')) continue;
    const target = resolve(dirname(file), `${specifier}.ts`);
    expect(existsSync(target), `${specifier} from ${file}`).toBe(true);
    runtimeImports(target, seen);
  }
  return seen;
}

describe('PosterWall', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // A runtime import of anything the room's chunk also carries splits it, three.js included, into a common chunk on
  // the critical path (posterKit.ts); the kit is the one runtime seam. What the wall does import at runtime is its own:
  // the layout, the geometry and the designs, and the integer hashes it shares with the generated room's lazy chunk.
  it("imports nothing of the room's chunk at runtime, in the wall, its worker or its own painter", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const seen = new Set<string>();
    for (const entry of ['PosterWall.ts', 'paint/worker.ts', 'paint/atlas.ts'])
      runtimeImports(resolve(here, entry), seen);
    const files = [...seen].map((file) => relative(here, file));
    expect(files.length).toBeGreaterThan(8);
    const foreign = files.filter(
      (file) => file !== 'PosterWall.ts' && !/^(paint|wall)\/\w+\.ts$/.test(file) && file !== '../gen/kit/hash.ts',
    );
    expect(foreign).toEqual([]);
    // The wall itself carries no design: they are the worker's, or a chunk fetched only where there is no worker.
    const wall = [...runtimeImports(resolve(here, 'PosterWall.ts'))].map((file) => relative(here, file));
    expect(wall.sort()).toEqual(['PosterWall.ts', 'paint/faces.ts', 'wall/geometry.ts', 'wall/layout.ts']);
  });

  it('asks the painter for the tier and the faces at once, and builds the geometry as one small unit', async () => {
    const { queue, wall, workers, events, runUnits } = setup();
    expect(workers).toHaveLength(1);
    expect(workers[0]?.requests[0]?.scale).toBe(1);
    expect(workers[0]?.requests[0]?.faces.map(([family, weight]) => `${family} ${weight}`)).toEqual([
      'Nunito 800',
      'Nunito 600',
      'Chewy 400',
      'Silkscreen 400',
    ]);
    for (const [, , url] of workers[0]?.requests[0]?.faces ?? [])
      expect(url).toMatch(/^https:\/\/example\.test\/.+woff2/);
    expect(queue).toHaveLength(1);
    expect(queue[0]?.options.urgent?.()).toBe(false);
    expect(queue[0]?.options.estimateMs).toBeGreaterThan(0);
    expect(queue[0]?.options.estimateMs).toBeLessThanOrEqual(4);
    // The painter and its faces are a download: a cut never waits for them.
    expect(wall.holdsCut('room')).toBe(false);
    await flush();
    expect(workers[0]?.terminate).toHaveBeenCalledOnce();
    expect(events.onStaged).not.toHaveBeenCalled();
    runUnits(1);
    expect(events.onStaged).toHaveBeenCalledOnce();
  });

  it('on a hardware GPU, uploads the painted atlas at the TV, between the game frames and hidden there', async () => {
    const { wall, events, background, queue, runUnits, bitmaps, uploaded, flyTo, node } = await staged();
    expect(events.onStaged).toHaveBeenCalledOnce();
    // The upload is ordinary background work at the TV, its strips small enough to go between a playing game's frames.
    expect(queue).toHaveLength(1);
    expect(queue[0]?.options.smallUploads).toBe(true);
    expect(queue[0]?.options.urgent?.()).toBe(false);
    expect(queue[0]?.options.estimateMs).toBeGreaterThan(0);
    // Unit 1 (the storage and the program), then one unit per strip: every one of them an upload.
    expect(runUnits()).toEqual(Array.from({ length: STRIPS + 1 }, () => QUIET));
    await flush();
    expect(wall.texturePixels).toBe(2048 * 1024);
    expect(wall.shown).toBe(true);
    expect(events.onShown).toHaveBeenCalledOnce();
    // The bitmap went up whole, and is let go once it is on the GPU.
    expect(uploaded).toEqual([{ canvas: bitmaps[0], width: 2048 }]);
    expect(bitmaps[0]?.close).toHaveBeenCalledOnce();
    // At rest at the TV with nothing of it in frame: hidden, and drawn from the first frame of the first flight.
    expect(node()?.visible).toBe(false);
    flyTo('room');
    expect(node()?.visible).toBe(true);
    wall.depart();
    expect(queue).toHaveLength(0);
    expect(background.hurry).toHaveBeenCalledOnce();
  });

  it('times the first flight from the frame the camera sets off in, however long the departure waited', async () => {
    const { wall, flyTo, land, frame, animations, slowFlight } = setup();
    await flush();
    // The visitor leaves, and the camera waits while the room is made ready: frames drawn meanwhile (the one that
    // shows the game's PAUSE) are not the flight's.
    wall.depart();
    const start = performance.now();
    frame(start);
    expect(animations).toHaveLength(0);
    expect(slowFlight).not.toHaveBeenCalled();
    // The camera sets off: every frame until it lands is timed.
    flyTo('room');
    for (let frames = 1; frames <= 15; frames++) frame(start + 400 + frames * 20);
    expect(slowFlight).not.toHaveBeenCalled();
    land();
    frame(start + 720);
    expect(slowFlight).toHaveBeenCalledOnce();
    expect(slowFlight.mock.calls[0]?.[0]).toHaveLength(16);
    // Once: a later flight is not timed.
    flyTo('tv');
    frame(start + 740);
    expect(animations).toHaveLength(0);
  });

  it('on a software GPU, uploads nothing at the TV; the first departure puts it up, between frames', async () => {
    const { wall, events, queue, runUnits, targets, flyTo, node, meshes } = await staged({ lite: true });
    expect(events.onStaged).toHaveBeenCalledOnce();
    expect(queue).toHaveLength(0);
    expect(targets).toHaveLength(0);
    expect(wall.texturePixels).toBe(0);

    flyTo('room');
    wall.depart();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.options.sliceMs).toBeGreaterThan(0);
    expect(queue[0]?.options.urgent?.()).toBe(true);
    expect(runUnits()).toEqual(Array.from({ length: STRIPS + 1 }, () => QUIET));
    await flush();
    expect(wall.texturePixels).toBe(2048 * 1024);
    expect(wall.shown).toBe(true);
    expect(events.onShown).toHaveBeenCalledOnce();
    // Shown in flight, with nothing of it in frame yet: simply drawn, and without the skirts.
    expect(node()?.visible).toBe(true);
    expect(meshes().skirts).toBeUndefined();
  });

  it('makes an upload still under way at the first departure urgent, and hurries the queue', async () => {
    const { wall, background, queue, runUnits, flyTo } = await staged();
    runUnits(3);
    expect(queue[0]?.options.urgent?.()).toBe(false);
    flyTo('room');
    wall.depart();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.options.urgent?.()).toBe(true);
    expect(background.hurry).toHaveBeenCalledOnce();
    runUnits();
    await flush();
    expect(wall.shown).toBe(true);
  });

  describe.each(['none', 'throws', 'null', 'error'] as const)('without a painter that paints (%s)', (worker) => {
    it('paints on the main thread once the faces are in: a sheet per unit, urgent from the first departure', async () => {
      const { wall, events, queue, runUnits, canvases, uploaded, workers, flyTo } = setup({ worker });
      runUnits(1);
      expect(queue).toHaveLength(0);
      await flush();
      for (const started of workers) expect(started.terminate).toHaveBeenCalled();
      expect(queue).toHaveLength(1);
      expect(queue[0]?.options.urgent?.()).toBe(false);
      expect(queue[0]?.options.estimateMs).toBeLessThanOrEqual(4);
      runUnits(2);
      expect(events.onStaged).not.toHaveBeenCalled();
      flyTo('room');
      wall.depart();
      expect(queue[0]?.options.urgent?.()).toBe(true);
      expect(queue[0]?.options.sliceMs).toBeGreaterThan(0);
      runUnits(PAINT_UNITS - 2);
      expect(events.onStaged).toHaveBeenCalledOnce();
      expect(canvases[0]?.width).toBe(2048);
      runUnits();
      await flush();
      expect(wall.shown).toBe(true);
      // Its own canvas went up, and its pixels are let go once it is on the GPU.
      expect(uploaded).toEqual([{ canvas: canvases[0], width: 2048 }]);
      expect(canvases[0]?.width).toBe(0);
    });
  });

  it("on the main thread, paints in the fallback faces when the site's do not arrive in time", async () => {
    vi.useFakeTimers();
    const { queue, runUnits } = setup({ worker: 'none', noFonts: true });
    runUnits(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(queue).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(600);
    expect(queue).toHaveLength(1);
  });

  it('on the main thread, paints again when its canvas comes back blank before it is all on the GPU', async () => {
    const { wall, queue, runUnits, canvases, targets } = setup({ worker: 'none' });
    runUnits(1);
    await flush();
    runUnits(PAINT_UNITS + 3);
    // A GPU process reset wipes the 2D canvas too (docs/ROOM.md › Lost canvases).
    canvases[0]?.dispatchEvent(new Event('contextrestored'));
    expect(targets[0]?.dispose).toHaveBeenCalledOnce();
    expect(queue).toHaveLength(0);
    await flush();
    expect(queue).toHaveLength(1);
    runUnits();
    await flush();
    expect(wall.shown).toBe(true);
    expect(painter.started).toBe(2);
    expect(canvases.map(({ width }) => width)).toEqual([0, 0]);
  });

  it('stays bare when there is no painter and no 2D canvas either', async () => {
    const { wall, events, queue, runUnits, node } = setup({ worker: 'none' });
    painter.fails = true;
    runUnits(1);
    await flush();
    runUnits();
    expect(events.onFailed).toHaveBeenCalledOnce();
    expect(events.onStaged).not.toHaveBeenCalled();
    expect(queue).toHaveLength(0);
    expect(wall.holdsCut('room')).toBe(false);
    expect(node()).toBeUndefined();
  });

  it('holds a reduced-motion cut only to the room view, from the atlas painted until it is up', async () => {
    const context = setup();
    expect(context.wall.holdsCut('room')).toBe(false);
    context.runUnits(1);
    await flush();
    expect(context.wall.holdsCut('room')).toBe(true);
    // At rest in the other views the node is hidden, so a cut there never waits for it.
    for (const view of ['tv', 'pc', 'radio'] as const) expect(context.wall.holdsCut(view)).toBe(false);
    context.flyTo('room');
    context.wall.depart();
    context.runUnits();
    await flush();
    expect(context.wall.holdsCut('room')).toBe(false);
  });

  it('closes a bitmap that arrives after a dispose, and stops a painter at work', async () => {
    const { wall, workers, bitmaps } = setup({ worker: 'never' });
    wall.dispose();
    expect(workers[0]?.terminate).toHaveBeenCalledOnce();
    const late = { width: 2048, height: 1024, close: vi.fn() };
    workers[0]?.onmessage?.({ data: late });
    expect(late.close).toHaveBeenCalledOnce();
    expect(bitmaps).toHaveLength(0);
  });

  it('hides the node at a pose with nothing of it in frame and always draws it in the room view', async () => {
    let inView = false;
    const { wall, runUnits, flyTo, land, node } = await staged({ inView: () => inView });
    flyTo('pc');
    wall.depart();
    runUnits();
    await flush();
    land();
    expect(node()?.visible).toBe(false);
    flyTo('room');
    expect(node()?.visible).toBe(true);
    land();
    expect(node()?.visible).toBe(true);
    flyTo('radio');
    inView = true;
    land();
    expect(node()?.visible).toBe(true);
  });

  it('shows walls that are ready in the middle of a flight only once the camera has landed, warmed first', async () => {
    const { wall, runUnits, compiles, moment, warm, flyTo, land, meshes } = await staged({ deferCompile: true });
    runUnits();
    expect(wall.shown).toBe(false);
    // The camera flies, and the program links meanwhile: nothing is made in a flight.
    moment.now = 'flying';
    flyTo('room');
    for (const compiled of compiles) compiled();
    await flush();
    expect(wall.shown).toBe(false);
    expect(warm).not.toHaveBeenCalled();
    moment.now = 'quiet';
    land();
    expect(wall.shown).toBe(true);
    const { cards, skirts } = meshes();
    expect(warm).toHaveBeenCalledTimes(1);
    expect(warm).toHaveBeenCalledWith([cards, skirts]);
  });

  it('keeps a flight waiting for painted walls until they are up, and not for walls still being painted', async () => {
    // Still with the painter: a flight does not wait for a worker.
    const painting = setup();
    let free = false;
    void painting.wall.boarded(60_000).then(() => (free = true));
    await flush();
    expect(free).toBe(true);

    // Painted, with the upload and the program left: the room runs those, and the flight waits for the walls.
    const { wall, runUnits, compiles } = await staged({ deferCompile: true });
    let boarded = false;
    void wall.boarded(60_000).then(() => (boarded = true));
    runUnits();
    await flush();
    expect(boarded).toBe(false);
    for (const compiled of compiles) compiled();
    await flush();
    expect(wall.shown).toBe(true);
    expect(boarded).toBe(true);
  });

  it('lets a flight go after its bounded wait when the walls are not up by then', async () => {
    const { wall, runUnits } = await staged({ deferCompile: true });
    let boarded = false;
    void wall.boarded(5).then(() => (boarded = true));
    runUnits();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(wall.shown).toBe(false);
    expect(boarded).toBe(true);
  });

  it('fades a late arrival in when a piece is already in frame, and ends on the opaque program', async () => {
    const { wall, runUnits, frame, animations, flyTo, land, meshes } = setup({ inView: () => true });
    flyTo('room');
    land();
    wall.depart();
    // The first flight's frame sample ends at its first frame at rest.
    frame(performance.now());
    runUnits();
    await flush();
    runUnits();
    await flush();
    const { cards, skirts } = meshes();
    const cardsMaterial = materialOf(cards);
    expect(wall.shown).toBe(true);
    expect(animations).toHaveLength(1);
    expect(cardsMaterial.transparent).toBe(true);
    // Fading, the cards draw first among the transparent objects, all of which are in front of the walls.
    expect(cards?.renderOrder).toBe(-1);
    const start = performance.now();
    // A frame's timestamp may precede the fade's start: it never goes below 0.
    frame(start - 50);
    expect(cardsMaterial.opacity).toBe(0);
    frame(start + POSTERS_FADE_MS / 2 + 5);
    expect(cardsMaterial.opacity).toBeGreaterThan(0.4);
    frame(start + POSTERS_FADE_MS + 5);
    expect(animations).toHaveLength(0);
    expect(cardsMaterial.transparent).toBe(false);
    expect(cardsMaterial.opacity).toBe(1);
    expect(materialOf(skirts).opacity).toBe(1);
    expect(cards?.renderOrder).toBe(2);
  });

  it('pops a late arrival in on the lite path', async () => {
    const { wall, runUnits, frame, animations, flyTo, land } = setup({ inView: () => true, lite: true });
    flyTo('room');
    land();
    wall.depart();
    frame(performance.now());
    runUnits();
    await flush();
    runUnits();
    await flush();
    expect(wall.shown).toBe(true);
    expect(animations).toHaveLength(0);
  });

  it('after a context restore during the upload, has the atlas painted again and is shown again', async () => {
    const { wall, events, queue, runUnits, canvas, bitmaps, workers, targets, flyTo } = await staged();
    flyTo('room');
    wall.depart();
    runUnits(3);
    expect(queue).toHaveLength(1);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    // The interrupted upload ended: its bitmap is closed and its target let go, not disposed (it was the old
    // context's); the painter is asked again.
    expect(queue).toHaveLength(0);
    expect(bitmaps[0]?.close).toHaveBeenCalledOnce();
    expect(targets[0]?.dispose).not.toHaveBeenCalled();
    expect(events.onLost).toHaveBeenCalledOnce();
    expect(workers).toHaveLength(2);
    await flush();
    expect(queue).toHaveLength(1);
    runUnits();
    await flush();
    expect(wall.shown).toBe(true);
    expect(events.onShown).toHaveBeenCalledOnce();
    expect(targets).toHaveLength(2);
    expect(bitmaps[1]?.close).toHaveBeenCalledOnce();
  });

  it('after a context restore at the TV, has it painted and puts it up there again, hidden', async () => {
    const { wall, events, queue, runUnits, canvas, node } = await staged();
    runUnits();
    await flush();
    expect(wall.shown).toBe(true);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(events.onLost).toHaveBeenCalledOnce();
    expect(wall.shown).toBe(false);
    await flush();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.options.urgent?.()).toBe(false);
    runUnits();
    await flush();
    expect(wall.shown).toBe(true);
    expect(events.onShown).toHaveBeenCalledTimes(2);
    expect(node()?.visible).toBe(false);
  });

  it('after a context restore while the painter is at work, stops it and asks again', async () => {
    const { wall, runUnits, canvas, workers, bitmaps } = setup();
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(workers).toHaveLength(2);
    expect(workers[0]?.terminate).toHaveBeenCalledOnce();
    runUnits(1);
    await flush();
    // The first painter's answer, had it still come, is no one's.
    expect(bitmaps.filter((bitmap) => bitmap.close.mock.calls.length === 0)).toHaveLength(1);
    runUnits();
    await flush();
    expect(wall.shown).toBe(true);
  });

  it('after a context restore while staged at the TV on a software GPU, swaps the bitmap and puts it up on the departure', async () => {
    const { wall, queue, runUnits, canvas, bitmaps, flyTo } = await staged({ lite: true });
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    await flush();
    expect(bitmaps[0]?.close).toHaveBeenCalledOnce();
    expect(queue).toHaveLength(0);
    flyTo('room');
    wall.depart();
    runUnits();
    await flush();
    expect(wall.shown).toBe(true);
    expect(bitmaps[1]?.close).toHaveBeenCalledOnce();
  });

  it("never takes an earlier context's program for this one's", async () => {
    const { wall, runUnits, canvas, compiles, flyTo } = await staged({ deferCompile: true });
    flyTo('room');
    wall.depart();
    runUnits(1);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    await flush();
    // The new upload's first unit starts this context's compile; the old context's then settles.
    runUnits(1);
    compiles[0]?.();
    await flush();
    runUnits();
    await flush();
    // Every strip is up, but this context's program is not compiled yet.
    expect(wall.shown).toBe(false);
    compiles[1]?.();
    await flush();
    expect(wall.shown).toBe(true);
  });

  it('after a context restore during the fade, ends the fade on opaque cards and fades in again once repainted', async () => {
    const { wall, runUnits, frame, animations, canvas, flyTo, land, meshes } = setup({ inView: () => true });
    flyTo('room');
    land();
    wall.depart();
    // The first flight's frame sample ends at its first frame at rest.
    frame(performance.now());
    runUnits();
    await flush();
    runUnits();
    await flush();
    const cardsMaterial = materialOf(meshes().cards);
    frame(performance.now() + POSTERS_FADE_MS / 3);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(animations).toHaveLength(0);
    expect(cardsMaterial.transparent).toBe(false);
    expect(cardsMaterial.opacity).toBe(1);
    expect(wall.shown).toBe(false);
    await flush();
    runUnits();
    await flush();
    expect(wall.shown).toBe(true);
    expect(animations).toHaveLength(1);
  });

  it("holds the black for at most one cut's worth of time in all", async () => {
    const { wall } = await staged();
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    expect(wall.holdsCut('room')).toBe(true);
    now += 1199;
    expect(wall.holdsCut('room')).toBe(true);
    // Whatever keeps the posters from showing, a later cut lands on the bare walls without waiting.
    now += 1;
    expect(wall.holdsCut('room')).toBe(false);
    now += 60_000;
    expect(wall.holdsCut('room')).toBe(false);
  });
});
