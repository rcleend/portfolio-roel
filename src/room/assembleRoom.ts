import { Box3, Matrix4, type Object3D, PerspectiveCamera, Vector2, Vector3 } from 'three';
import type { GameSurface } from '@/engine/core/GameSurface';
import { type AnchorTarget, type PropAnchor, propAnchors, type RoomTarget } from './camera/anchors';
import { CameraRig, type FramingInsets } from './camera/CameraRig';
import { boxCorners } from './camera/framing';
import { ScreenFade } from './camera/ScreenFade';
import { CASTERS_ALL, CASTERS_LOCAL } from './gen/bake/Baker';
import type { GeneratedParts } from './gen/GeneratedRoom';
import { LAVA_BOUNDS } from './gen/roomSpec';
import type { Interactable } from './interaction/Interactable';
import { RoomInteraction } from './interaction/RoomInteraction';
import { planeCentre } from './pc/glassPlane';
import { Monitor } from './pc/Monitor';
import { PcInteractable } from './pc/PcInteractable';
import { createPcGlass } from './pc/pcGlass';
import { pcModelOf } from './pc/pcModel';
import type { ScreenOverlay } from './pc/ScreenOverlay';
import type { RadioDoorHandle } from './radio/RadioDoor';
import { RadioInteractable } from './radio/RadioInteractable';
import { RADIO_ANCHOR, type RadioModel, radioModelOf } from './radio/radioModel';
import type { SpotlitProp } from './spotlight/spotlightContract';
import { type IdleMoment, IdleWork } from './stage/IdleWork';
import type { RoomStage } from './stage/RoomStage';
import { uploadTextures } from './stage/sceneTextures';
import { Television } from './tv/Television';
import { TvInteractable } from './tv/TvInteractable';
import { pictureOutline } from './tv/tvFraming';
import { createTvGlass } from './tv/tvGlass';
import { type TvModel, tvModelOf } from './tv/tvModel';
import type { ViewController } from './ViewController';
import type { RoomView } from './viewState';

/**
 * What one of the room's texture uploads is assumed to cost on the main thread before one is timed, when they go up
 * from the TV (`prewarm`): a decoded image's copy to the GPU. Without it the first would be judged by the longest unit
 * any task has run, and never fit between the game's frames.
 */
const PREWARM_UNIT_ESTIMATE_MS = 2;

export interface RoomSceneOptions {
  readonly stage: RoomStage;
  /** The generated room's nodes, already in the scene. */
  readonly parts: GeneratedParts;
  /** Texture anisotropy the room uses (≤ 4). */
  readonly anisotropy: number;
  readonly surface: GameSurface;
  readonly views: ViewController;
  readonly reducedMotion: MediaQueryList;
  /** The computer's live screen, created before the room loaded. */
  readonly overlay: ScreenOverlay;
  /** The CD player's public face, created before the room loaded. */
  readonly radio: RadioDoorHandle;
  /** Where the props now sit in the settled room view; called on every viewport change. */
  readonly onAnchorsChange: (anchors: readonly PropAnchor[]) => void;
  /** The prop the pointer is over (its click flies there from the room view), or null. */
  readonly onHover: (target: RoomTarget | null) => void;
  /** While true, a touch anywhere on the TV set presses the game (Room.setTapToBegin). */
  readonly tapToBegin: () => boolean;
}

/** Everything that exists once the room's geometry is in. */
export interface RoomScene {
  readonly rig: CameraRig;
  /** The reduced-motion cut's black veil. */
  readonly fade: ScreenFade;
  readonly television: Television;
  readonly tvInput: TvInteractable;
  readonly monitor: Monitor;
  /** The radio and its surroundings. */
  readonly radioModel: RadioModel;
  /** Work ahead of need on idle time; `start()` it once the first frame is drawn. */
  readonly background: IdleWork;
  /** The props the spotlight lights. */
  readonly spotlit: readonly SpotlitProp[];
  register(interactable: Interactable): () => void;
  setFramingInsets(insets: FramingInsets): void;
  /** Re-evaluates the pointer cursor after the view changed. */
  refreshCursor(): void;
  /** Starts uploading the rest of the room's textures from the TV, ahead of the first look around. */
  prewarm(): void;
  /** World to clip space of the settled TV view for the viewport as it is: what the page opens on. */
  tvClip(): Matrix4;
  /** The phone's tilt as the room view's parallax (Room.setTilt). */
  tilt(tilt: { readonly x: number; readonly y: number } | null): void;
  dispose(): void;
}

/** The prop a hover on each interactable lights: the one its click flies to (the desk's is the computer's). */
const HOVER_TARGETS: Readonly<Record<string, RoomTarget>> = { tv: 'tv', pc: 'pc', desk: 'pc', radio: 'radio' };

/** Wires the generated attic: TV, computer, radio, camera and pointer interaction around its nodes. */
export function assembleRoom(options: RoomSceneOptions): RoomScene {
  const { stage, parts, surface, views, reducedMotion, overlay, radio, anisotropy } = options;
  const { scene, loop, camera } = stage;
  // The two screens' glass: display meshes made here, in their sets' nodes. They close their tubes in the bake's
  // shadow maps like any other part of the set.
  const tvGlass = createTvGlass();
  parts.tv.add(tvGlass);
  const pcGlass = createPcGlass();
  parts.pc.add(pcGlass);
  for (const glass of [tvGlass, pcGlass]) {
    glass.layers.enable(CASTERS_ALL);
    glass.layers.enable(CASTERS_LOCAL);
  }
  scene.updateMatrixWorld(true);
  const tvModel = tvModelOf(parts.tv, tvGlass);
  const pcModel = pcModelOf({ root: parts.pc, desk: parts.desk, shell: parts.monitor, glass: pcGlass });
  const fade = new ScreenFade();
  scene.add(fade.mesh);
  const television = new Television({ model: tvModel, surface, scene, loop, reducedMotion });
  // The TV view frames the picture the game draws into, the content rect the pointer maps through.
  const picture = pictureOutline(tvModel.screen, television.contentRect);
  const rig = new CameraRig(camera, loop, { ...tvModel, picture }, pcModel, reducedMotion, fade);
  const background = new IdleWork((): IdleMoment => {
    const power = television.powerState;
    // A flight, the CRT turning on or off, or the radio's lid and discs in motion. A reduced-motion cut held black
    // shows nothing that moves: what runs then is out of sight (the posters' strips, for one, before the fade back).
    if (
      (views.moving && !rig.veiled) ||
      power === 'powering-on' ||
      power === 'powering-off' ||
      radio.prepared?.moving === true
    ) {
      return 'moving';
    }
    // The game at the TV, the computer's live screen, or the radio's discs floating: only units that fit a frame.
    const playing = (views.atTv && power === 'on' && !surface.paused) || overlay.live || radio.prepared?.ambient;
    return playing ? 'playing' : 'quiet';
  });
  // The TV view's own textures are on the GPU with the first frame, and the baked pages are made there; any canvas
  // no frame at the TV has drawn (the view outside the window) goes up a while after the
  // TV turns on (`prewarm`), between the game's frames where an idle period can hold one and else in a quiet moment,
  // so the first look around no longer uploads them in its flight (on a phone that flight lagged: round six, item 32);
  // or, at the latest, once the visitor first looks around.
  let uploadQueued = false;
  const queueUploads = (view: RoomView | 'prewarm'): void => {
    if (uploadQueued || view === 'tv') return;
    uploadQueued = true;
    background.add(
      uploadTextures(scene, stage.renderer),
      view === 'prewarm' ? { smallUploads: true, estimateMs: PREWARM_UNIT_ESTIMATE_MS } : {},
    );
  };
  const stopUploads = views.onChange(queueUploads);
  const monitor = new Monitor({
    model: pcModel,
    scene,
    loop,
    renderer: stage.renderer,
    anisotropy,
    cpuCanvases: stage.softwareGpu,
    overlay,
    pose: rig.viewpoint('pc'),
    // The glass is on screen in the room and at the computer, and may be on any flight. The TV's and the radio's
    // frames keep it out of sight, so a minute on its clock waits for the next flight there rather than drawing a
    // frame of a radio otherwise at rest.
    isInView: () => views.moving || views.view === 'room' || views.view === 'pc',
    background,
  });
  // The monitor's light spill draws with ScreenGlow's program, which the TV's own spill quads used to compile with the
  // room; the TV's light is now drawn by the finish's programs, so it is compiled here, and no flight that first shows
  // the spill stops to compile it (e2e/programs.ts counts it in the room's first view).
  const spill = scene.getObjectByName('ScreenGlow');
  if (spill) stage.prepare(spill);
  // The radio view keeps the lava lamp out of frame (so it can rest at zero frames of the lamp's own).
  const radioModel = radioModelOf(
    parts.radio.group,
    parts.dresser,
    new Box3(new Vector3(...LAVA_BOUNDS.min), new Vector3(...LAVA_BOUNDS.max)),
  );

  const tvInput = new TvInteractable({
    tv: tvModel,
    surface,
    contentRect: television.contentRect,
    isPlayable: () => views.atTv && television.powerState === 'on',
    isInRoomView: () => views.view !== 'tv',
    focusTv: () => views.request('tv'),
    tapToBegin: options.tapToBegin,
  });
  // Where the top of the TV set lands on the screen (NDC y), from the camera as it is now.
  const tvCorners = boxCorners(tvModel.bounds.min, tvModel.bounds.max);
  const tvTopNdc = (): number => Math.max(...tvCorners.map((corner) => corner.clone().project(camera).y));
  const interaction = new RoomInteraction({
    canvas: stage.canvas,
    camera,
    isEnabled: () => !views.moving,
    // The empty surroundings always pull back to the room overview.
    onMiss: () => {
      if (views.view !== 'room') views.request('room');
    },
    // On a touch screen a stray tap beside or below the picture (the pad's plate) is too easy while playing: there
    // only a tap above the set, or the guide's popup, leaves the game (docs/ROOM.md › Using it from the app).
    ignoresClick: (pointerType, ndc) => pointerType !== 'mouse' && views.view === 'tv' && ndc.y < tvTopNdc(),
    // ...except on the title, where a finger anywhere below the top of the set (the cabinet, the floor, beside it)
    // begins, as one on the picture does; above the set it still leaves.
    claimsPress: (pointerType, ndc) =>
      views.view === 'tv' && ndc.y < tvTopNdc() && tvInput.pressToBegin(pointerType) ? tvInput : null,
    idleCursor: () => (views.view === 'room' || views.moving ? 'idle' : 'leave'),
    onPointer: (ndc) => {
      rig.setParallaxPointer(ndc);
      radio.prepared?.setPointer(ndc);
    },
    // Cutting the desk for picking would add 9 ms (50 ms on a slow phone) to the first frame.
    background,
    // At the computer, a click on its bezel or keyboard must not take the keys from its screen
    // (arrows would stop scrolling the document); a click outside hides the screen, and the app
    // moves focus then.
    keepsFocus: () => overlay.live,
    onHover: (interactable) => options.onHover((interactable && HOVER_TARGETS[interactable.id]) ?? null),
  });
  // The game's play moves under a resting mouse: what a click there would do changes without the pointer moving.
  const stopCursor = surface.onCursorChange(() => interaction.redrawCursor());
  const unregister = [
    interaction.register(tvInput),
    interaction.register(new PcInteractable('pc', pcModel.root, views)),
    interaction.register(new PcInteractable('desk', pcModel.desk, views)),
  ];
  // The radio, its cabinet and the lava lamp: one target that flies to the CD player.
  unregister.push(
    interaction.register(
      new RadioInteractable({
        root: radioModel.root,
        bodyBounds: radioModel.bodyBounds,
        cabinet: radioModel.cabinet,
        views,
        deck: radio,
      }),
    ),
  );

  // The spotlight (docs/ROOM.md › The spotlight): the TV and the radio glow and bounce whole; at the computer only the
  // monitor does, so nothing slides across the desk and no glow outlines a keyboard the chair half hides.
  const monitor3d = [pcModel.shell, pcModel.glass];
  const spotlit = [
    inTheLight('tv', [tvModel.root], [tvModel.root], tvModel.bounds),
    inTheLight('pc', monitor3d, monitor3d, pcModel.shellBounds),
    // The radio's device hangs its discs and its LCD in the scene beside it once prepared:
    // the prop takes them in, so it lights and bounces whole.
    inTheLight(
      'radio',
      [radioModel.root],
      [radioModel.root],
      radioModel.bodyBounds,
      () => radio.prepared?.root ?? null,
    ),
  ];

  const anchorTargets: readonly AnchorTarget[] = [
    { target: 'tv', point: tvPictureCentre(tvModel) },
    { target: 'pc', point: planeCentre(pcModel.picture) },
    { target: 'radio', point: RADIO_ANCHOR.clone() },
  ];
  const publishAnchors = (): void => {
    options.onAnchorsChange(propAnchors(anchorTargets, rig.viewpoint('room'), stage.size));
  };
  const syncSize = (): void => {
    rig.resize(stage.size);
    television.setPixelRatio(stage.size.pixelRatio);
    monitor.setPose(rig.viewpoint('pc'), stage.size);
    radio.deck?.resize();
    publishAnchors();
  };
  syncSize();
  const stopResize = stage.onResize(syncSize);
  const stopRender = stage.onRender(() => television.syncGlow());
  rig.jumpTo(views.view);
  // Asked for the computer before the room had loaded: the camera is already there.
  if (views.view !== 'tv') monitor.prepare('tv', views.view);
  queueUploads(views.view);
  if (import.meta.env.DEV) {
    // Where the picture lands, in CSS px: what the startup still's lengths in index.html are held to.
    (globalThis as { __tvPicture?: () => readonly number[] }).__tvPicture = () => {
      const { width, height } = stage.size;
      const points = picture.map((point) => point.clone().project(camera));
      const xs = points.map((point) => ((point.x + 1) / 2) * width);
      const ys = points.map((point) => ((1 - point.y) / 2) * height);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    };
  }

  return {
    rig,
    fade,
    television,
    tvInput,
    monitor,
    radioModel,
    background,
    spotlit,
    register: (interactable) => interaction.register(interactable),
    setFramingInsets(insets) {
      rig.setFramingInsets(insets);
      publishAnchors();
    },
    refreshCursor: () => interaction.refreshCursor(),
    prewarm: () => queueUploads('prewarm'),
    tvClip() {
      const pose = rig.viewpoint('tv');
      const eye = new PerspectiveCamera(pose.fov, stage.size.width / stage.size.height, camera.near, camera.far);
      eye.position.copy(pose.position);
      eye.lookAt(pose.target);
      eye.updateMatrixWorld(true);
      return new Matrix4().multiplyMatrices(eye.projectionMatrix, eye.matrixWorldInverse);
    },
    tilt: (tilt) => rig.setParallaxPointer(tilt ? new Vector2(tilt.x, tilt.y) : null),
    dispose() {
      background.dispose();
      stopUploads();
      stopResize();
      stopRender();
      stopCursor();
      for (const stop of unregister) stop();
      interaction.dispose();
      monitor.dispose();
      television.dispose();
      rig.dispose();
      fade.dispose();
      tvGlass.removeFromParent();
      pcGlass.removeFromParent();
      tvGlass.geometry.dispose();
      pcGlass.geometry.dispose();
    },
  };
}

/** A prop in the spotlight: what glows, and what bounces about the middle of its foot, its label on its top. */
function inTheLight(
  target: RoomTarget,
  glow: readonly Object3D[],
  bounce: readonly Object3D[],
  bounds: Box3,
  joins?: () => Object3D | null,
): SpotlitProp {
  const centre = bounds.getCenter(new Vector3());
  return {
    target,
    glow,
    bounce,
    pivot: centre.clone().setY(bounds.min.y),
    top: centre.setY(bounds.max.y),
    ...(joins ? { joins } : {}),
  };
}

/**
 * The middle of the game picture on the TV's glass. The picture is centred in the bezel's
 * aperture, which is centred on the glass, so it is the glass's middle on its front face.
 */
function tvPictureCentre(tv: TvModel): Vector3 {
  const glass = new Box3().setFromObject(tv.screen);
  return glass.getCenter(new Vector3()).setX(glass.min.x);
}
