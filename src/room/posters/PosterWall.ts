// Types only: every runtime dependency the room's chunk also carries arrives through the PosterKit (posterKit.ts).
import type { Box3, DataTexture, Group, Material, Mesh, MeshBasicMaterial, Object3D } from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { IdleTask, IdleTaskOptions, IdleWork } from '../stage/IdleWork';
import type { RoomStage } from '../stage/RoomStage';
import type { ViewController } from '../ViewController';
import type { RoomView } from '../viewState';
import type { PosterKit } from './posterKit';
import type { PosterTier } from './posterTier';

/** The posters' runtime files (tools/room/posters.mjs; public/room/manifest.json › lazyFiles). */
export const POSTERS_FILE = 'posters.glb';
export const POSTERS_TIER_FILES: Readonly<Record<PosterTier, string>> = {
  '2k': 'posters-2k.webp',
  '1k': 'posters-1k.webp',
};
/** The late-bytes arrival: pieces already in frame fade in over this long rather than pop. */
export const POSTERS_FADE_MS = 300;
/**
 * After an early departure, the upload's units left may follow a flight frame that left no idle period
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
/**
 * What the glb's parse is judged by at the TV (IdleTaskOptions.estimateMs), rather than the heaviest unit the room has
 * run: measured at 6× CPU, the parse and the Meshopt decode it starts take 1.6-2.8 ms together, so it fits any idle
 * period the playing game leaves of at least this long.
 */
const PARSE_ESTIMATE_MS = 3;

export interface PosterWallContext {
  readonly stage: RoomStage;
  readonly views: ViewController;
  readonly background: IdleWork;
  /** The room's GLTFLoader (Meshopt). */
  readonly loader: GLTFLoader;
  readonly assetBaseUrl: string;
  readonly anisotropy: number;
}

export interface PosterWallEvents {
  /** The tier is decoded and the glb parsed, on the CPU: what is left is the upload, which waits for the departure. */
  readonly onStaged: () => void;
  /** The texture is complete, the program compiled and the node shown (or resting hidden at a pose). */
  readonly onShown: () => void;
  /** A context loss took the atlas: the node is hidden until it is up again (onShown). */
  readonly onLost: () => void;
  /** The posters will not show this page load (a failed fetch, decode or parse). */
  readonly onFailed: (error: unknown) => void;
}

/** The loaded posters node and the two meshes of its two primitives. */
interface PostersNode {
  readonly root: Group;
  readonly cards: Mesh;
  readonly skirts: Mesh;
  readonly boxes: readonly Box3[];
}

/**
 * The decorated walls (docs/ROOM.md › Posters): one node, two primitives sharing one baked, unlit atlas. The tier is
 * decided once, at the TV, and that tier and the glb are fetched and decoded there; on a hardware GPU the upload (one
 * unit for the program and the storage, then strips) goes between the playing game's frames there too, the node
 * hidden, so the first flight has nothing left to do but draw it. What is left at the first departure (all of it on a
 * software GPU, whose GPU is the CPU drawing the game) rides that flight's first frames as urgent background work, and
 * the node is shown once complete, normally before any piece enters the flight's frame.
 */
export class PosterWall {
  readonly #context: PosterWallContext;
  readonly #kit: PosterKit;
  readonly #events: PosterWallEvents;
  readonly #tier: PosterTier;
  /** A software GPU: no skirts (the one blended overdraw), no fade, no program of its own. */
  readonly #lite: boolean;
  #node: PostersNode | null = null;
  /** The tier's encoded bytes, kept for a context loss. */
  #bytes: ArrayBuffer | null = null;
  #bitmap: ImageBitmap | null = null;
  /** The first decode, until settled: a dispose before the parse closes its bitmap through it. */
  #image: Promise<ImageBitmap> | null = null;
  #target: DataTexture | null = null;
  #fetching = false;
  /** The tier decoded and the glb's bytes fetched: what is left needs no network. */
  #decoded = false;
  #fetched = false;
  #departed = false;
  /** The glb's parse, one unit of background work, until it runs. */
  #parse: (() => void) | null = null;
  #dropParse: (() => void) | null = null;
  #dropUpload: (() => void) | null = null;
  #complete = false;
  #compiled = false;
  /** Counts context restores: a program compiled for an earlier context says nothing of this one. */
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

  constructor(context: PosterWallContext, kit: PosterKit, events: PosterWallEvents) {
    this.#context = context;
    this.#kit = kit;
    this.#events = events;
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
    // On Save-Data nothing is fetched at the TV.
    if (!kit.saveData()) this.#fetch();
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

  /** Late bytes are fading in (POSTERS_FADE_MS). */
  get fading(): boolean {
    return this.#stopFade !== null;
  }

  /** Texels of the atlas on the GPU (0 until its storage is allocated). */
  get texturePixels(): number {
    const image = this.#target?.image;
    return image ? image.width * image.height : 0;
  }

  /**
   * A reduced-motion cut to the room view holds its black from the moment what is left of the posters needs no
   * network (the parse, the program and the upload; never while waiting on a fetch), so it lands on a decorated room.
   * A cut to any other view never waits for them: at rest there the node is hidden. The posters hold the black for at
   * most one cut's worth of time in all (PosterKit.cutHoldMs, from the first held frame), so a state that never
   * resolves costs one long black, not one on every later cut.
   */
  holdsCut(to: RoomView): boolean {
    if (to !== 'room' || !this.#decoded || !this.#fetched || this.#shown || this.#failed || this.#disposed)
      return false;
    const now = performance.now();
    this.#heldSince ??= now;
    return now - this.#heldSince < this.#kit.cutHoldMs;
  }

  /** The camera leaves the TV for the first time: what is left goes up now, between the flight's frames. */
  depart(): void {
    if (this.#departed) return;
    this.#departed = true;
    this.#measureFlight();
    this.#fetch();
    this.#queueParse();
    this.#queueUpload();
    // An upload already under way at the TV is urgent from now on: its next unit need not wait out a long request.
    this.#context.background.hurry();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const stop of this.#stops) stop();
    this.#context.stage.canvas.removeEventListener('webglcontextrestored', this.#onContextRestored);
    this.#stopFade?.();
    this.#dropParse?.();
    this.#dropUpload?.();
    this.#bitmap?.close();
    this.#bitmap = null;
    // Decoded while the glb's parse was still queued, the bitmap is in no field yet (closing twice is harmless).
    this.#image?.then(
      (bitmap) => bitmap.close(),
      () => {},
    );
    this.#image = null;
    this.#bytes = null;
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

  /** Fetches the tier and the glb once (`priority: 'low'`), then decodes the image off the main thread. */
  #fetch(): void {
    if (this.#fetching || this.#disposed) return;
    this.#fetching = true;
    const { assetBaseUrl, loader } = this.#context;
    const kit = this.#kit;
    const bytesOf = (name: string): Promise<ArrayBuffer> =>
      fetch(new URL(name, assetBaseUrl), { priority: 'low' }).then((response) => {
        if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
        return response.arrayBuffer();
      });
    const image = bytesOf(POSTERS_TIER_FILES[this.#tier])
      .then((bytes) => {
        this.#bytes = bytes;
        return decode(bytes);
      })
      .then((bitmap) => {
        this.#decoded = true;
        return bitmap;
      });
    this.#image = image;
    // The glb's parse (Meshopt) is one unit of background work: it fits a frame. A glb without the posters' node (one
    // from before the contract, say) fails like a parse that throws.
    const node = bytesOf(POSTERS_FILE).then(
      (bytes) =>
        new Promise<PostersNode>((resolve, reject) => {
          this.#fetched = true;
          this.#parse = () =>
            loader
              .parseAsync(bytes, '')
              .then((gltf) => postersNode(gltf.scene, kit))
              .then(resolve, reject);
          this.#queueParse();
        }),
    );
    Promise.all([image, node]).then(
      ([bitmap, parsed]) => {
        this.#image = null;
        if (this.#disposed) {
          bitmap.close();
          return;
        }
        this.#bitmap = bitmap;
        this.#node = parsed;
        if (this.#lite) parsed.skirts.removeFromParent();
        this.#events.onStaged();
        this.#queueUpload();
      },
      (error: unknown) => {
        // The image may have decoded while the glb failed.
        this.#image = null;
        image.then(
          (bitmap) => bitmap.close(),
          () => {},
        );
        this.#fail(error);
      },
    );
  }

  /**
   * The parse waits at the TV as ordinary background work (a playing game on a slow CPU may leave it no idle period
   * there); once the visitor has left the TV it is urgent like the upload it leads to, so it is queued again as such.
   */
  #queueParse(): void {
    const parse = this.#parse;
    if (!parse || this.#disposed) return;
    this.#dropParse?.();
    this.#dropParse = this.#context.background.add(
      this.#parseUnit(parse),
      this.#departed ? this.#urgency() : { estimateMs: PARSE_ESTIMATE_MS },
    );
  }

  // biome-ignore lint/correctness/useYield: a single unit: the whole body is the unit's work.
  *#parseUnit(parse: () => void): IdleTask {
    this.#parse = null;
    this.#dropParse = null;
    parse();
  }

  /**
   * Once the bitmap is in hand: on a hardware GPU at once, its strips between the playing game's frames
   * (IdleTaskOptions.smallUploads), else from the first departure; urgent from then until shown.
   */
  #queueUpload(): void {
    if (!this.#bitmap || !this.#node || this.#dropUpload || this.#shown || this.#disposed) return;
    if (this.#lite && !this.#departed) return;
    this.#dropUpload = this.#context.background.add(this.#upload(this.#bitmap, this.#node), {
      ...this.#urgency(),
      smallUploads: true,
      estimateMs: UPLOAD_ESTIMATE_MS,
    });
  }

  /** The parse's and the upload's urgency: from the first departure until shown, between the flight's frames. */
  #urgency(): IdleTaskOptions {
    const { views } = this.#context;
    return {
      // At the TV (before the first departure, or after a context loss there) the units fit the game's idle periods.
      urgent: () => this.#departed && !this.#shown && (views.view !== 'tv' || views.moving),
      sliceMs: UPLOAD_SLICE_MS,
    };
  }

  /** Unit 1: the program (off the frame where the browser can) and the storage; then 8 (2K) or 4 (1K) strips. */
  *#upload(bitmap: ImageBitmap, node: PostersNode): IdleTask {
    const { stage, anisotropy } = this.#context;
    const { renderer, scene, camera } = stage;
    try {
      const target = this.#kit.allocateStripTarget(renderer, bitmap.width, bitmap.height, anisotropy);
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
      yield* this.#kit.uploadStrips(renderer, bitmap, target);
      this.#complete = true;
    } finally {
      bitmap.close();
      if (this.#bitmap === bitmap) this.#bitmap = null;
      this.#dropUpload = null;
    }
    this.#reveal();
  }

  /**
   * At the first frame the texture is complete and the program compiled. At rest at the TV, PC or radio it stays
   * hidden where no piece is in frame; with no piece in frame (the normal case: before the first departure, or early
   * in the first flight) it is simply shown; pieces already in frame (late bytes) fade in on the full path, under
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
   * Nothing of the atlas survived: the kept bytes are decoded and strip-uploaded again, and the program rebuilt. Staged
   * at the TV, the bitmap in hand is simply replaced; mid-upload, the upload starts over.
   */
  readonly #onContextRestored = (): void => {
    const node = this.#node;
    const bytes = this.#bytes;
    if (this.#disposed || !node || !bytes) return;
    this.#generation++;
    this.#stopFade?.();
    // Dropped before its first unit, the upload never reaches its finally: what that would release is released here.
    this.#dropUpload?.();
    this.#dropUpload = null;
    this.#bitmap?.close();
    this.#bitmap = null;
    // Its GPU copy went with the old context: disposing it would ask the new one to delete a texture it never had
    // (the radio's skin keeps the same rule).
    this.#target = null;
    node.root.visible = false;
    this.#shown = false;
    this.#complete = false;
    this.#compiled = false;
    this.#events.onLost();
    const generation = this.#generation;
    decode(bytes).then(
      (bitmap) => {
        // Disposed, or a later restore decodes its own.
        if (this.#disposed || generation !== this.#generation) return bitmap.close();
        this.#bitmap = bitmap;
        this.#queueUpload();
      },
      (error: unknown) => this.#fail(error),
    );
  };

  #fail(error: unknown): void {
    if (this.#failed || this.#disposed) return;
    this.#failed = true;
    console.warn('The posters could not load; the walls stay bare.', error);
    this.#events.onFailed(error);
    this.dispose();
  }
}

/** Off the main thread, with the bytes as baked: no orientation, no premultiplication, no colour conversion. */
function decode(bytes: ArrayBuffer): Promise<ImageBitmap> {
  return createImageBitmap(new Blob([bytes], { type: 'image/webp' }), {
    imageOrientation: 'none',
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
}

/**
 * The glb's node and its two primitives, with the room's materials (posterKit.ts); in the opaque pass the skirts draw
 * after the room and the cards after the skirts.
 */
function postersNode(scene: Group, kit: PosterKit): PostersNode {
  // The node carries the posters' extras (`posters: 1`, the decor boxes); the glb's scene shares its name. The scene,
  // which holds the node and nothing else, is what the room adds and shows.
  const marked: Object3D[] = [];
  scene.traverse((object: Object3D) => {
    if (object.userData.posters === 1) marked.push(object);
  });
  const node = marked[0];
  if (marked.length !== 1 || !node) throw new Error('posters.glb has no single posters node');
  const meshes = new Map<string, Mesh>();
  node.traverse((object: Object3D) => {
    const mesh = object as Mesh;
    if (mesh.isMesh) meshes.set((mesh.material as Material).name, mesh);
  });
  const cards = meshes.get('posters_cards');
  const skirts = meshes.get('posters_skirts');
  if (!cards || !skirts) throw new Error('posters.glb lacks its cards or skirts primitive');
  replaceMaterial(cards, kit.cardsMaterial());
  replaceMaterial(skirts, kit.skirtsMaterial());
  skirts.renderOrder = kit.skirtsOrder;
  cards.renderOrder = kit.cardsOrder;
  scene.visible = false;
  return { root: scene, cards, skirts, boxes: kit.decorBoxes(node.userData) };
}

function replaceMaterial(mesh: Mesh, material: MeshBasicMaterial): void {
  const loaded = mesh.material as Material;
  material.name = loaded.name;
  loaded.dispose();
  mesh.material = material;
}

/** A fading card is transparent and premultiplied (the skirts' program); at rest it is the room's opaque one. */
function setFading(material: MeshBasicMaterial, fading: boolean): void {
  material.transparent = fading;
  material.premultipliedAlpha = fading;
  material.opacity = fading ? 0 : 1;
  material.needsUpdate = true;
}
