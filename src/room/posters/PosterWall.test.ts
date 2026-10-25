import { readFileSync } from 'node:fs';
import { Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type IdleTask, type IdleTaskOptions, type IdleWork, QUIET } from '../stage/IdleWork';
import type { RoomStage } from '../stage/RoomStage';
import type { ViewController } from '../ViewController';
import type { RoomView } from '../viewState';
import { POSTERS_FADE_MS, PosterWall } from './PosterWall';
import type { PosterKit } from './posterKit';

/** The 2K tier's strips (stripUpload.ts): the fake uploader yields once per strip. */
const STRIPS = 8;

/** posters.glb's shape: one marked node holding the cards and the skirts primitives. */
function gltfScene(): Group {
  const scene = new Group();
  const node = new Group();
  node.userData.posters = 1;
  for (const name of ['posters_cards', 'posters_skirts']) {
    node.add(new Mesh(new PlaneGeometry(), new MeshBasicMaterial({ name })));
  }
  scene.add(node);
  return scene;
}

interface Setup {
  readonly lite?: boolean;
  /** Whether a piece is in the camera's frame (posterVisibility.anyInView). */
  readonly inView?: () => boolean;
  /** The glb's fetch fails. */
  readonly glbFails?: boolean;
  readonly reducedMotion?: boolean;
  /** The glb parses but has no posters node (one from before the contract, say). */
  readonly staleGlb?: boolean;
  /** compileAsync's promises settle only when the test resolves them (`compiles`). */
  readonly deferCompile?: boolean;
}

function setup(options: Setup = {}) {
  const bitmaps: { close: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      const bitmap = { width: 2048, height: 1024, close: vi.fn() };
      bitmaps.push(bitmap);
      return bitmap;
    }),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL) => {
      const failed = options.glbFails === true && url.pathname.endsWith('.glb');
      return { ok: !failed, status: failed ? 404 : 200, arrayBuffer: async () => new ArrayBuffer(8) };
    }),
  );

  // IdleWork's contract: a drop takes the task off the queue and ends it, so its `finally` runs.
  const queue: { task: IdleTask; options: IdleTaskOptions }[] = [];
  const background = {
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
      if (result.done) queue.shift();
      else yielded.push(result.value);
    }
    return yielded;
  };

  const animations: ((now: number) => boolean)[] = [];
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
    renderer: {
      compileAsync: () =>
        options.deferCompile === true ? new Promise<void>((resolve) => compiles.push(resolve)) : Promise.resolve(),
    },
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
  const kit = {
    flightMs: 1100,
    cutHoldMs: 1200,
    saveData: () => false,
    tier: () => '2k',
    slowFlight: () => false,
    quiet: QUIET,
    allocateStripTarget: (_renderer: unknown, width: number, height: number) => {
      const target = { image: { width, height }, dispose: vi.fn() };
      targets.push(target);
      return target;
    },
    uploadStrips: function* () {
      for (let strip = 0; strip < STRIPS; strip++) yield QUIET;
    },
    decorBoxes: () => [],
    anyInView: options.inView ?? (() => false),
    skirtsOrder: 1,
    cardsOrder: 2,
    cardsMaterial: () => new MeshBasicMaterial(),
    skirtsMaterial: () => new MeshBasicMaterial(),
  } as unknown as PosterKit;

  const loader = {
    parseAsync: async () => ({ scene: options.staleGlb === true ? new Group() : gltfScene() }),
  } as unknown as GLTFLoader;
  const events = { onStaged: vi.fn(), onShown: vi.fn(), onFailed: vi.fn() };
  const wall = new PosterWall(
    {
      stage,
      views: views as unknown as ViewController,
      background: background as unknown as IdleWork,
      loader,
      assetBaseUrl: 'https://example.test/room/',
      anisotropy: 4,
      reducedMotion: { matches: options.reducedMotion === true } as MediaQueryList,
    },
    kit,
    events,
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
    queue,
    runUnits,
    frame,
    animations,
    canvas,
    bitmaps,
    targets,
    compiles,
    flyTo,
    land,
    node,
    meshes,
  };
}

function materialOf(mesh: Mesh | undefined): MeshBasicMaterial {
  if (!mesh) throw new Error('No such mesh');
  return mesh.material as MeshBasicMaterial;
}

/** Lets the fetches, the decode and the parse's promise settle. */
const flush = async () => {
  for (let turn = 0; turn < 5; turn++) await new Promise((resolve) => setTimeout(resolve, 0));
};

/** At the TV with the bytes in hand: the parse runs as ordinary background work and the wall is staged. */
async function staged(options: Setup = {}) {
  const context = setup(options);
  await flush();
  context.runUnits();
  await flush();
  return context;
}

describe('PosterWall', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // A runtime import of anything the room's chunk also carries splits it, three.js included, into a common chunk on
  // the critical path (posterKit.ts); the kit is the one runtime seam.
  it('imports types only', () => {
    const source = readFileSync(new URL('./PosterWall.ts', import.meta.url), 'utf8');
    const imports = source.match(/^import\b[^;]*;/gm) ?? [];
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter((statement) => !statement.startsWith('import type '))).toEqual([]);
    expect(source).not.toMatch(/\bimport\(/);
  });

  it("queues the TV's parse as ordinary work, judged by its own small estimate rather than the room's heaviest unit", async () => {
    const { queue } = setup();
    await flush();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.options.urgent).toBeUndefined();
    expect(queue[0]?.options.estimateMs).toBeGreaterThan(0);
    expect(queue[0]?.options.estimateMs).toBeLessThanOrEqual(4);
  });

  it('decodes and parses at the TV and uploads nothing there; the first departure puts it up, between frames', async () => {
    const { wall, events, queue, runUnits, targets, flyTo, node } = await staged();
    expect(events.onStaged).toHaveBeenCalledOnce();
    expect(queue).toHaveLength(0);
    expect(targets).toHaveLength(0);
    expect(wall.texturePixels).toBe(0);

    flyTo('room');
    wall.depart();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.options.sliceMs).toBeGreaterThan(0);
    expect(queue[0]?.options.urgent?.()).toBe(true);
    // Unit 1 (the storage and the program), then one unit per strip: every one of them an upload.
    expect(runUnits()).toEqual(Array.from({ length: STRIPS + 1 }, () => QUIET));
    await flush();
    expect(wall.texturePixels).toBe(2048 * 1024);
    expect(wall.shown).toBe(true);
    expect(events.onShown).toHaveBeenCalledOnce();
    // Shown in flight, with nothing of it in frame yet: simply drawn.
    expect(node()?.visible).toBe(true);
  });

  it('holds a reduced-motion cut only to the room view, and only while what is left needs no network', async () => {
    const context = setup();
    // Bytes still on their way: the cut never waits for the network.
    expect(context.wall.holdsCut('room')).toBe(false);
    await flush();
    context.runUnits();
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

  it('fades late bytes in when a piece is already in frame, and ends on the opaque program', async () => {
    const { wall, runUnits, frame, animations, flyTo, land, meshes } = setup({ inView: () => true });
    flyTo('room');
    land();
    wall.depart();
    // The first flight's frame sample ends at its first frame at rest.
    frame(performance.now());
    await flush();
    runUnits();
    await flush();
    runUnits();
    await flush();
    const { cards, skirts } = meshes();
    const cardsMaterial = materialOf(cards);
    expect(wall.shown).toBe(true);
    expect(animations).toHaveLength(1);
    expect(cardsMaterial.transparent).toBe(true);
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

  it('pops late bytes in under reduced motion and on the lite path, which also drops the skirts', async () => {
    for (const options of [{ reducedMotion: true }, { lite: true }]) {
      const { wall, runUnits, frame, animations, flyTo, land, meshes } = setup({ inView: () => true, ...options });
      flyTo('room');
      land();
      wall.depart();
      frame(performance.now());
      await flush();
      runUnits();
      await flush();
      runUnits();
      await flush();
      expect(wall.shown).toBe(true);
      expect(animations).toHaveLength(0);
      expect(meshes().skirts === undefined).toBe(options.lite === true);
    }
  });

  it('after a context restore during the upload, closes the old bitmap, starts over and is shown again', async () => {
    const { wall, events, queue, runUnits, canvas, bitmaps, targets, flyTo } = await staged();
    flyTo('room');
    wall.depart();
    runUnits(3);
    expect(queue).toHaveLength(1);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    // The interrupted upload ended: its bitmap is closed and its target let go, not disposed (it was the old context's).
    expect(queue).toHaveLength(0);
    expect(bitmaps[0]?.close).toHaveBeenCalledOnce();
    expect(targets[0]?.dispose).not.toHaveBeenCalled();
    await flush();
    expect(queue).toHaveLength(1);
    runUnits();
    await flush();
    expect(wall.shown).toBe(true);
    expect(events.onShown).toHaveBeenCalledOnce();
    expect(targets).toHaveLength(2);
    expect(bitmaps[1]?.close).toHaveBeenCalledOnce();
  });

  it('after a context restore before the upload has started, closes the bitmap it never took and is shown again', async () => {
    const { wall, events, queue, runUnits, canvas, bitmaps, flyTo } = await staged();
    flyTo('room');
    wall.depart();
    expect(queue).toHaveLength(1);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(queue).toHaveLength(0);
    expect(bitmaps[0]?.close).toHaveBeenCalledOnce();
    await flush();
    expect(queue).toHaveLength(1);
    runUnits();
    await flush();
    expect(wall.shown).toBe(true);
    expect(wall.holdsCut('room')).toBe(false);
    expect(events.onShown).toHaveBeenCalledOnce();
  });

  it('after a context restore while staged at the TV, swaps the bitmap and puts it up on the departure', async () => {
    const { wall, queue, runUnits, canvas, bitmaps, flyTo } = await staged();
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

  it('after a context restore during the fade, ends the fade on opaque cards and fades in again once re-uploaded', async () => {
    const { wall, runUnits, frame, animations, canvas, flyTo, land, meshes } = setup({ inView: () => true });
    flyTo('room');
    land();
    wall.depart();
    // The first flight's frame sample ends at its first frame at rest.
    frame(performance.now());
    await flush();
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

  it('stays bare when the glb fails, closing the bitmap that did decode', async () => {
    const { wall, events, bitmaps, node } = setup({ glbFails: true });
    await flush();
    expect(events.onFailed).toHaveBeenCalledOnce();
    expect(bitmaps[0]?.close).toHaveBeenCalledOnce();
    expect(wall.holdsCut('room')).toBe(false);
    expect(node()).toBeUndefined();
  });

  it('fails, rather than loading forever, on a glb without the posters node', async () => {
    const { wall, events, bitmaps, node } = await staged({ staleGlb: true });
    expect(events.onFailed).toHaveBeenCalledOnce();
    expect(events.onStaged).not.toHaveBeenCalled();
    expect(bitmaps[0]?.close).toHaveBeenCalledOnce();
    expect(wall.holdsCut('room')).toBe(false);
    expect(node()).toBeUndefined();
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
