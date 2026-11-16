// Of the room's chunk, types only: every runtime dependency it also carries arrives through the PosterKit
// (posterKit.ts). What this chunk alone carries (the layout, the geometry, the faces' addresses) it imports as usual;
// the designs are the painter's, in its worker or, where none can be had, in a chunk of their own.
import type { Box3, DataTexture, Group, Material, Mesh, MeshBasicMaterial } from 'three';
import type { IdleTask, IdleTaskOptions, IdleWork } from '../stage/IdleWork';
import type { RoomStage } from '../stage/RoomStage';
import type { ViewController } from '../ViewController';
import type { RoomView } from '../viewState';
import { FACES } from './paint/faces';
import type { PaintReply, PaintRequest } from './paint/worker';
import type { PosterKit } from './posterKit';
import type { PosterTier } from './posterTier';
import { wallGeometry } from './wall/geometry';

/** The late arrival: pieces already in frame fade in over this long rather than pop. */
export const POSTERS_FADE_MS = 300;
/**
 * After an early departure, the units left may follow a flight frame that left no idle period
 * (IdleTaskOptions.sliceMs) while they take at most this long: measured at 6× CPU on an Apple GPU, a strip takes
 * 0.3-5 ms beside a 9.8 ms flight frame at 16:10, so frame and unit stay inside 16.7 ms.
 */
const UPLOAD_SLICE_MS = 6.5;
/**
 * What the upload's first unit (the storage and the program) is judged by at the TV (IdleTaskOptions.estimateMs),
 * rather than the heaviest unit the room has run: measured at 6× CPU on an Apple GPU between the playing game's
 * frames, 3.9-4.5 ms on a desktop and a phone, so it waits for an idle period that holds it; the strips after it are
 * judged by what it and they then take (0.1-4 ms).
 */
const UPLOAD_ESTIMATE_MS = 4;
/** What building the geometry is judged by at the TV: one unit, 1-2 ms on a laptop. */
const BUILD_ESTIMATE_MS = 4;
/** What a unit of the main thread's own painting is judged by until one has been timed (a sheet: 0.5-4 ms). */
const PAINT_ESTIMATE_MS = 4;
/** The longest the main thread's own painting waits for the site's faces before it sets its type in the fallbacks. */
const FONT_WAIT_MS = 2500;

/** The lazy painter for the main thread; a seam for tests. */
export type AtlasLoader = () => Promise<typeof import('./paint/atlas')>;
/** Starts the painter's worker; a seam for tests. Throws, or returns null, where there is none to be had. */
export type PainterStarter = () => Worker | null;

const loadAtlas: AtlasLoader = () => import('./paint/atlas');
const startPainter: PainterStarter = () =>
  typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined'
    ? null
    : new Worker(new URL('./paint/worker.ts', import.meta.url), { type: 'module' });

export interface PosterWallContext {
  readonly stage: RoomStage;
  readonly views: ViewController;
  readonly background: IdleWork;
  readonly anisotropy: number;
}

export interface PosterWallEvents {
  /** The atlas is painted and the geometry built, on the CPU: what is left is the upload. */
  readonly onStaged: () => void;
  /** The texture is complete, the program compiled and the node shown (or resting hidden at a pose). */
  readonly onShown: () => void;
  /** A context loss took the atlas: the node is hidden until it is painted and up again (onShown). */
  readonly onLost: () => void;
  /** The posters will not show this page load (no painter and no 2D canvas, a program that would not compile). */
  readonly onFailed: (error: unknown) => void;
}

/** The walls' node and its two meshes. */
interface PostersNode {
  readonly root: Group;
  readonly cards: Mesh;
  readonly skirts: Mesh;
  readonly boxes: readonly Box3[];
}

/**
 * The decorated walls (docs/ROOM.md › Posters): one node, two meshes sharing one atlas, all of it made here: the
 * geometry from the layout (wall/) and the atlas painted with the 2D canvas (paint/), the night's light multiplied into
 * it. No model and no picture is fetched. The tier is decided once, at the TV, and the atlas is painted there, in a
 * worker, so the playing game never pays for it; where a worker or its OffscreenCanvas cannot be had, the main thread
 * paints it a sheet per unit of background work. On a hardware GPU the upload (one unit for the program and the
 * storage, then strips) follows at the TV too, the node hidden, so the first flight has nothing left to do but draw
 * it. What is left at the first departure (all of the upload on a software GPU, whose GPU is the CPU drawing the
 * game) rides that flight's first frames as urgent background work, and the node is shown once complete, normally
 * before any piece enters the flight's frame.
 */
export class PosterWall {
  readonly #context: PosterWallContext;
  readonly #kit: PosterKit;
  readonly #events: PosterWallEvents;
  readonly #startPainter: PainterStarter;
  readonly #loadAtlas: AtlasLoader;
  readonly #tier: PosterTier;
  /** A software GPU: no skirts (the one blended overdraw), no fade, no program of its own. */
  readonly #lite: boolean;
  #node: PostersNode | null = null;
  /** The painted atlas until it is on the GPU: the worker's bitmap, or the main thread's own canvas. */
  #image: ImageBitmap | HTMLCanvasElement | null = null;
  #worker: Worker | null = null;
  #target: DataTexture | null = null;
  #painting = false;
  #departed = false;
  #dropBuild: (() => void) | null = null;
  #dropPaint: (() => void) | null = null;
  #dropUpload: (() => void) | null = null;
  #staged = false;
  #complete = false;
  #compiled = false;
  /** Counts restarts (a context restore): a program compiled or an atlas painted for an earlier one says nothing. */
  #generation = 0;
  /** When a reduced-motion cut first held its black for the posters (performance.now()); null before. */
  #heldSince: number | null = null;
  #shown = false;
  #failed = false;
  #disposed = false;
  /** The first flight was slow: the skirts go at the next moment nothing of the node is in frame. */
  #slow = false;
  #stopFade: (() => void) | null = null;
  readonly #stops: (() => void)[] = [];

  constructor(
    context: PosterWallContext,
    kit: PosterKit,
    events: PosterWallEvents,
    painter: PainterStarter = startPainter,
    atlas: AtlasLoader = loadAtlas,
  ) {
    this.#context = context;
    this.#kit = kit;
    this.#events = events;
    this.#startPainter = painter;
    this.#loadAtlas = atlas;
    const { stage, views } = context;
    this.#lite = stage.softwareGpu;
    this.#tier = kit.tier(stage);
    this.#stops.push(
      views.onChange(() => this.#leave()),
      views.onSettle((view) => this.#settle(view)),
      stage.onResize(() => {
        if (!views.moving) this.#settle(views.view);
      }),
    );
    stage.canvas.addEventListener('webglcontextrestored', this.#onContextRestored);
    this.#dropBuild = context.background.add(this.#build(), { ...this.#urgency(), estimateMs: BUILD_ESTIMATE_MS });
    this.#paint();
  }

  get tier(): PosterTier {
    return this.#tier;
  }

  get shown(): boolean {
    return this.#shown;
  }

  /** The software-GPU path: the cards alone, on the room's own opaque program, and no fade. */
  get lite(): boolean {
    return this.#lite;
  }

  /** A late arrival is fading in (POSTERS_FADE_MS). */
  get fading(): boolean {
    return this.#stopFade !== null;
  }

  /** Texels of the atlas on the GPU (0 until its storage is allocated). */
  get texturePixels(): number {
    const image = this.#target?.image;
    return image ? image.width * image.height : 0;
  }

  /**
   * A reduced-motion cut to the room view holds its black from the moment the atlas is painted until it is up (never
   * while the painter or its faces are still on their way), so it lands on a decorated room. A cut to any other view never waits for them:
   * at rest there the node is hidden. The posters hold the black for at most one cut's worth of time in all
   * (PosterKit.cutHoldMs, from the first held frame), so a state that never resolves costs one long black, not one on
   * every later cut.
   */
  holdsCut(to: RoomView): boolean {
    if (to !== 'room' || !this.#image || this.#shown || this.#failed || this.#disposed) return false;
    const now = performance.now();
    this.#heldSince ??= now;
    return now - this.#heldSince < this.#kit.cutHoldMs;
  }

  /** The camera leaves the TV for the first time: what is left is urgent now, and goes between the flight's frames. */
  depart(): void {
    if (this.#departed) return;
    this.#departed = true;
    this.#measureFlight();
    this.#queueUpload();
    // What is under way at the TV need not wait out a long request.
    this.#context.background.hurry();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const stop of this.#stops) stop();
    this.#context.stage.canvas.removeEventListener('webglcontextrestored', this.#onContextRestored);
    this.#stopFade?.();
    this.#dropBuild?.();
    this.#dropPaint?.();
    this.#dropUpload?.();
    this.#worker?.terminate();
    this.#worker = null;
    this.#release();
    this.#target?.dispose();
    const node = this.#node;
    if (node) {
      node.root.removeFromParent();
      for (const mesh of [node.cards, node.skirts]) {
        mesh.geometry.dispose();
        (mesh.material as Material).dispose();
      }
    }
  }

  /** Lets the painted atlas go, and its pixels with it. */
  #release(): void {
    const image = this.#image;
    this.#image = null;
    if (!image) return;
    if ('close' in image) image.close();
    else {
      image.removeEventListener('contextrestored', this.#onCanvasRestored);
      image.width = 0;
      image.height = 0;
    }
  }

  /** One unit: the cards and the skirts from the layout, hidden until their atlas is up. */
  // biome-ignore lint/correctness/useYield: a single unit: the whole body is the unit's work.
  *#build(): IdleTask {
    this.#dropBuild = null;
    const kit = this.#kit;
    const geometry = wallGeometry();
    const cards = kit.mesh(geometry.cards, kit.cardsMaterial());
    const skirts = kit.mesh(geometry.skirts, kit.skirtsMaterial());
    cards.renderOrder = kit.cardsOrder;
    skirts.renderOrder = kit.skirtsOrder;
    const root = kit.group();
    root.add(cards);
    if (!this.#lite) root.add(skirts);
    root.visible = false;
    this.#node = { root, cards, skirts, boxes: kit.decorBoxes(geometry.boxes) };
    this.#stage();
  }

  /** Asks the painter's worker for the atlas; without one, or if it fails, the main thread paints it. */
  #paint(): void {
    if (this.#painting || this.#image || this.#failed || this.#disposed) return;
    this.#painting = true;
    const generation = this.#generation;
    const onMain = (): void => {
      this.#worker?.terminate();
      this.#worker = null;
      if (generation === this.#generation && !this.#disposed) this.#paintOnMain(generation);
    };
    let worker: Worker | null = null;
    try {
      worker = this.#startPainter();
    } catch {
      worker = null;
    }
    if (!worker) {
      onMain();
      return;
    }
    this.#worker = worker;
    worker.onmessage = ({ data }: MessageEvent<PaintReply>) => {
      if (worker !== this.#worker) return data?.close();
      if (!data) return onMain();
      worker.terminate();
      this.#worker = null;
      this.#painted(data);
    };
    worker.onerror = onMain;
    const request: PaintRequest = {
      scale: this.#scale,
      faces: FACES.map(([family, weight, url]) => [family, weight, new URL(url, location.href).href]),
    };
    worker.postMessage(request);
  }

  /** Canvas pixels per texel of the 2K atlas. */
  get #scale(): number {
    return this.#tier === '2k' ? 1 : 0.5;
  }

  /**
   * The main thread's own painting, where there is no worker: the designs' chunk, the site's faces (waited for at most
   * FONT_WAIT_MS), then a sheet per unit; urgent like the upload it leads to from the first departure.
   */
  #paintOnMain(generation: number): void {
    const current = (): boolean => generation === this.#generation && !this.#disposed && !this.#failed;
    this.#loadAtlas().then(
      (atlas) => {
        let waiting = true;
        const start = (): void => {
          if (!waiting || !current()) return;
          waiting = false;
          this.#dropPaint = this.#context.background.add(this.#paintUnits(atlas), {
            ...this.#urgency(),
            estimateMs: PAINT_ESTIMATE_MS,
          });
        };
        setTimeout(start, FONT_WAIT_MS);
        Promise.all(FACES.map(([family, weight]) => document.fonts.load(`${weight} 16px ${family}`))).then(
          start,
          start,
        );
      },
      (error: unknown) => {
        if (current()) this.#fail(error);
      },
    );
  }

  *#paintUnits({ atlasSize, paintAtlas }: typeof import('./paint/atlas')): IdleTask {
    const canvas = document.createElement('canvas');
    try {
      [canvas.width, canvas.height] = atlasSize(this.#scale);
      yield* paintAtlas(canvas, this.#scale, true);
    } catch (error) {
      this.#dropPaint = null;
      this.#fail(error);
      return;
    }
    this.#dropPaint = null;
    // A GPU process reset hands a 2D canvas back blank (docs/ROOM.md › Lost canvases): painted again from the start.
    canvas.addEventListener('contextrestored', this.#onCanvasRestored);
    this.#painted(canvas);
  }

  #painted(image: ImageBitmap | HTMLCanvasElement): void {
    this.#painting = false;
    this.#image = image;
    this.#stage();
  }

  /** The atlas painted and the geometry built: what is left is the upload. */
  #stage(): void {
    if (!this.#image || !this.#node || this.#staged || this.#disposed) return;
    this.#staged = true;
    this.#events.onStaged();
    this.#queueUpload();
  }

  /**
   * Once the atlas is painted: on a hardware GPU at once, its strips between the playing game's frames
   * (IdleTaskOptions.smallUploads), else from the first departure; urgent from then until shown.
   */
  #queueUpload(): void {
    const image = this.#image;
    if (!this.#staged || !image || !this.#node || this.#dropUpload || this.#shown || this.#disposed) return;
    if (this.#lite && !this.#departed) return;
    this.#dropUpload = this.#context.background.add(this.#upload(image, this.#node), {
      ...this.#urgency(),
      smallUploads: true,
      estimateMs: UPLOAD_ESTIMATE_MS,
    });
  }

  /** The units' urgency: from the first departure until shown, between the flight's frames. */
  #urgency(): IdleTaskOptions {
    const { views } = this.#context;
    return {
      // At the TV (before the first departure, or after a context loss there) the units fit the game's idle periods.
      urgent: () => this.#departed && !this.#shown && (views.view !== 'tv' || views.moving),
      sliceMs: UPLOAD_SLICE_MS,
    };
  }

  /** Unit 1: the program (off the frame where the browser can) and the storage; then 8 (2K) or 4 (1K) strips. */
  *#upload(image: ImageBitmap | HTMLCanvasElement, node: PostersNode): IdleTask {
    const { stage, anisotropy } = this.#context;
    const { renderer, scene, camera } = stage;
    try {
      const target = this.#kit.allocateStripTarget(renderer, image.width, image.height, anisotropy);
      this.#target = target;
      for (const mesh of [node.cards, node.skirts]) (mesh.material as MeshBasicMaterial).map = target;
      if (!node.root.parent) scene.add(node.root);
      this.#compiled = false;
      const generation = this.#generation;
      // The lite path draws the cards with the room's own opaque program, which already exists.
      const compiled = this.#lite ? Promise.resolve() : renderer.compileAsync(node.root, camera, scene);
      compiled.then(
        () => {
          if (generation !== this.#generation) return;
          this.#compiled = true;
          this.#reveal();
        },
        (error: unknown) => {
          if (generation === this.#generation) this.#fail(error);
        },
      );
      // The strips are uploads, like the rest of them (IdleWork's QUIET).
      yield this.#kit.quiet;
      yield* this.#kit.uploadStrips(renderer, image, target);
      this.#complete = true;
      // On the GPU: the painted pixels are not kept (a lost context has them painted again).
      if (this.#image === image) this.#release();
    } finally {
      this.#dropUpload = null;
    }
    this.#reveal();
  }

  /**
   * At the first frame the texture is complete and the program compiled. At rest at the TV, PC or radio it stays
   * hidden where no piece is in frame; with no piece in frame (the normal case: before the first departure, or early
   * in the first flight) it is simply shown; pieces already in frame (a late arrival) fade in on the full path, under
   * reduced motion too (a fade is not motion, and the room's own cuts fade).
   */
  #reveal(): void {
    const node = this.#node;
    if (!node || !this.#complete || !this.#compiled || this.#shown || this.#disposed) return;
    this.#shown = true;
    const { views, stage } = this.#context;
    const inView = this.#kit.anyInView(node.boxes, stage.camera);
    if (!views.moving && views.view !== 'room' && !inView) node.root.visible = false;
    else if (inView && !this.#lite) this.#fade(node);
    else node.root.visible = true;
    stage.loop.invalidate();
    this.#events.onShown();
  }

  /**
   * Cards and skirts from 0 to 1 over POSTERS_FADE_MS; the cards return to the opaque program after. Fading, the cards
   * draw first among the transparent objects (PosterKit.fadingCardsOrder), behind every one of them in the room.
   */
  #fade(node: PostersNode): void {
    const cards = node.cards.material as MeshBasicMaterial;
    const skirts = node.skirts.material as MeshBasicMaterial;
    setFading(cards, true);
    node.cards.renderOrder = this.#kit.fadingCardsOrder;
    node.root.visible = true;
    const finish = (): void => {
      setFading(cards, false);
      node.cards.renderOrder = this.#kit.cardsOrder;
      skirts.opacity = 1;
      this.#stopFade = null;
    };
    const start = performance.now();
    // A frame's timestamp may precede `start` (it is the frame's, not the callback's).
    const step = (now: number): boolean => {
      const t = Math.min(1, Math.max(0, (now - start) / POSTERS_FADE_MS));
      cards.opacity = t;
      skirts.opacity = t;
      if (t < 1) return true;
      finish();
      return false;
    };
    const stop = this.#context.stage.loop.animate(step);
    // Stopped part-way (a context loss), the cards are opaque again.
    this.#stopFade = () => {
      stop();
      finish();
    };
  }

  /** Leaving a pose never pops anything: the node is drawn for every flight. */
  #leave(): void {
    if (this.#shown && this.#node) this.#node.root.visible = true;
  }

  /**
   * At rest in the TV, PC or radio view (and on every resize there), the node is hidden only if no item's box meets
   * the resting frustum; in the room view it is always drawn.
   */
  #settle(view: RoomView): void {
    const node = this.#node;
    if (!this.#shown || !node) return;
    const inView = view === 'room' || this.#kit.anyInView(node.boxes, this.#context.stage.camera);
    // A slow first flight drops the skirts at the next moment nothing of the node is on screen.
    if (!inView && this.#slow) node.skirts.removeFromParent();
    if (node.root.visible !== inView) {
      node.root.visible = inView;
      this.#context.stage.loop.invalidate();
    }
  }

  /** The first flight's frame times: a hardware GPU that could not hold 30 fps drops the skirts afterwards. */
  #measureFlight(): void {
    if (this.#lite) return;
    const { stage, views } = this.#context;
    const frames: number[] = [];
    const end = performance.now() + this.#kit.flightMs;
    stage.loop.animate((now) => {
      frames.push(now);
      if (now < end && views.moving) return true;
      this.#slow = this.#kit.slowFlight(frames);
      return false;
    });
  }

  /**
   * Nothing of the atlas survived on the GPU, and its pixels were let go once it was up: it is painted again and
   * strip-uploaded again, and the program rebuilt. Mid-painting or mid-upload, both start over.
   */
  readonly #onContextRestored = (): void => {
    if (this.#disposed || this.#failed) return;
    // Its GPU copy went with the old context: disposing it would ask the new one to delete a texture it never had.
    this.#target = null;
    this.#restart();
  };

  /** The main thread's own canvas came back blank before it was all on the GPU. */
  readonly #onCanvasRestored = (): void => {
    if (this.#disposed || this.#failed) return;
    this.#target?.dispose();
    this.#target = null;
    this.#restart();
  };

  #restart(): void {
    this.#generation++;
    this.#stopFade?.();
    // Dropped, a task ends where it is (the upload's `finally` runs); a painter at work answers no one.
    this.#dropPaint?.();
    this.#dropPaint = null;
    this.#dropUpload?.();
    this.#dropUpload = null;
    this.#worker?.terminate();
    this.#worker = null;
    this.#release();
    if (this.#node) this.#node.root.visible = false;
    this.#shown = false;
    this.#painting = false;
    this.#staged = false;
    this.#complete = false;
    this.#compiled = false;
    this.#events.onLost();
    this.#paint();
  }

  #fail(error: unknown): void {
    if (this.#failed || this.#disposed) return;
    this.#failed = true;
    console.warn('The posters could not be made; the walls stay bare.', error);
    this.#events.onFailed(error);
    this.dispose();
  }
}

/** A fading card is transparent and premultiplied (the skirts' program); at rest it is the room's opaque one. */
function setFading(material: MeshBasicMaterial, fading: boolean): void {
  material.transparent = fading;
  material.premultipliedAlpha = fading;
  material.opacity = fading ? 0 : 1;
  material.needsUpdate = true;
}
