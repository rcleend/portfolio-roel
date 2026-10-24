import { Box3, Mesh, Vector3 } from 'three';
import type { GameSurface } from '@/engine/core/GameSurface';
import type { RoomAssets } from './assets/roomAssets';
import { type AnchorTarget, type PropAnchor, propAnchors } from './camera/anchors';
import { CameraRig, type FramingInsets } from './camera/CameraRig';
import { ScreenFade } from './camera/ScreenFade';
import type { Interactable } from './interaction/Interactable';
import { RoomInteraction } from './interaction/RoomInteraction';
import { planeCentre } from './pc/glassPlane';
import { Monitor } from './pc/Monitor';
import { PcInteractable } from './pc/PcInteractable';
import { locatePc } from './pc/pcModel';
import type { ScreenOverlay } from './pc/ScreenOverlay';
import type { RadioDoorHandle } from './radio/RadioDoor';
import { RadioInteractable } from './radio/RadioInteractable';
import { locateRadio, RADIO_ANCHOR, type RadioModel } from './radio/radioModel';
import { type IdleMoment, IdleWork } from './stage/IdleWork';
import { LavaLamp } from './stage/LavaLamp';
import type { RoomStage } from './stage/RoomStage';
import { addRoomLighting } from './stage/roomLighting';
import { forEachTexture, uploadTextures } from './stage/sceneTextures';
import { Television } from './tv/Television';
import { TvInteractable } from './tv/TvInteractable';
import { locateTv, type TvModel } from './tv/tvModel';
import type { ViewController } from './ViewController';
import type { RoomView } from './viewState';

export interface RoomSceneOptions {
  readonly stage: RoomStage;
  readonly assets: RoomAssets;
  readonly surface: GameSurface;
  readonly views: ViewController;
  readonly reducedMotion: MediaQueryList;
  /** The computer's live screen, created before the room loaded. */
  readonly overlay: ScreenOverlay;
  /** The CD player's public face, created before the room loaded. */
  readonly radio: RadioDoorHandle;
  /** Where the props now sit in the settled room view; called on every viewport change. */
  readonly onAnchorsChange: (anchors: readonly PropAnchor[]) => void;
}

/** Everything that exists once the room's assets are loaded. */
export interface RoomScene {
  readonly rig: CameraRig;
  readonly television: Television;
  readonly tvInput: TvInteractable;
  readonly monitor: Monitor;
  /** The radio and its surroundings; null when the assets lack it. */
  readonly radioModel: RadioModel | null;
  readonly lava: LavaLamp;
  /** Work ahead of need on idle time; `start()` it once the first frame is drawn. */
  readonly background: IdleWork;
  /** Texture anisotropy the room uses (≤ 4). */
  readonly anisotropy: number;
  register(interactable: Interactable): () => void;
  setFramingInsets(insets: FramingInsets): void;
  /** Re-evaluates the pointer cursor after the view changed. */
  refreshCursor(): void;
  dispose(): void;
}

const MAX_ANISOTROPY = 4;

/** Puts the loaded attic together: lighting, TV, computer, radio, camera, lava and pointer interaction. */
export function assembleRoom(options: RoomSceneOptions): RoomScene {
  const { stage, assets, surface, views, reducedMotion, overlay, radio } = options;
  const { scene, loop, camera } = stage;
  scene.add(assets.room.scene, assets.tv, ...assets.devices);
  const removeLighting = addRoomLighting(scene);
  const anisotropy = Math.min(MAX_ANISOTROPY, stage.renderer.capabilities.getMaxAnisotropy());
  scene.traverse((object) => {
    if (object instanceof Mesh) forEachTexture(object.material, (texture) => (texture.anisotropy = anisotropy));
  });

  const tvModel = locateTv(assets.tv);
  const pcRoot = assets.devices.find((device) => device.getObjectByName('PC_Imported_CRT_base'));
  const desk = assets.room.scene.getObjectByName('02_Desk');
  if (!pcRoot || !desk) throw new Error('Room assets lack the computer or its desk');
  const pcModel = locatePc(pcRoot, desk);
  const fade = new ScreenFade();
  scene.add(fade.mesh);
  const rig = new CameraRig(camera, loop, tvModel, pcModel, reducedMotion, fade);
  const television = new Television({ model: tvModel, surface, scene, loop, reducedMotion });
  const background = new IdleWork((): IdleMoment => {
    const power = television.powerState;
    // A flight, the CRT turning on or off, or the radio's lid and discs in motion.
    if (views.moving || power === 'powering-on' || power === 'powering-off' || radio.prepared?.moving === true) {
      return 'moving';
    }
    // The game at the TV, the computer's live screen, or the radio's discs floating: only units that fit a frame.
    const playing = (views.atTv && power === 'on' && !surface.paused) || overlay.live || radio.prepared?.ambient;
    return playing ? 'playing' : 'quiet';
  });
  // The TV view's own textures are on the GPU with the first frame; the rest wait until the visitor
  // first looks around, so a visitor who stays at the TV never allocates them (about 120 MB).
  let uploadQueued = false;
  const queueUploads = (view: RoomView): void => {
    if (uploadQueued || view === 'tv') return;
    uploadQueued = true;
    background.add(uploadTextures(scene, stage.renderer));
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
    isInView: () => views.view !== 'tv' || views.moving,
    background,
  });
  const lava = new LavaLamp({
    root: assets.room.scene,
    clips: assets.room.animations,
    camera,
    isStageVisible: () => stage.visible,
    reducedMotion,
    invalidate: () => loop.invalidate(),
  });
  // The radio view keeps the lamp out of frame (so it can rest at zero frames): its bounds are the ones the lamp
  // ticks for.
  const radioModel = locateRadio(
    assets.devices.find((device) => device.getObjectByName('Radio_Imported_Part_00_base')),
    assets.room.scene,
    lava.bounds,
  );

  const tvInput = new TvInteractable({
    tv: tvModel,
    surface,
    contentRect: television.contentRect,
    isPlayable: () => views.atTv && television.powerState === 'on',
    isInRoomView: () => views.view !== 'tv',
    focusTv: () => views.request('tv'),
  });
  const interaction = new RoomInteraction({
    canvas: stage.canvas,
    camera,
    isEnabled: () => !views.moving,
    // The empty surroundings always pull back to the room overview.
    onMiss: () => {
      if (views.view !== 'room') views.request('room');
    },
    idleCursor: () => (views.view === 'room' || views.moving ? 'default' : 'zoom-out'),
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
  });
  const unregister = [
    interaction.register(tvInput),
    interaction.register(new PcInteractable('pc', pcModel.root, views)),
    interaction.register(new PcInteractable('desk', pcModel.desk, views)),
  ];
  // The radio, its cabinet and the lava lamp: one target that flies to the CD player.
  if (radioModel) {
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
  }

  const anchorTargets: readonly AnchorTarget[] = [
    { target: 'tv', point: tvPictureCentre(tvModel) },
    { target: 'pc', point: planeCentre(pcModel.picture) },
    ...(radioModel ? [{ target: 'radio', point: RADIO_ANCHOR.clone() } as const] : []),
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
  const stopRender = stage.onRender(() => {
    television.syncGlow();
    lava.sync();
  });
  rig.jumpTo(views.view);
  // Asked for the computer before the room had loaded: the camera is already there.
  if (views.view !== 'tv') monitor.prepare('tv', views.view);
  queueUploads(views.view);

  return {
    rig,
    television,
    tvInput,
    monitor,
    radioModel,
    lava,
    background,
    anisotropy,
    register: (interactable) => interaction.register(interactable),
    setFramingInsets(insets) {
      rig.setFramingInsets(insets);
      publishAnchors();
    },
    refreshCursor: () => interaction.refreshCursor(),
    dispose() {
      background.dispose();
      stopUploads();
      stopResize();
      stopRender();
      for (const stop of unregister) stop();
      interaction.dispose();
      lava.dispose();
      monitor.dispose();
      television.dispose();
      rig.dispose();
      fade.dispose();
      removeLighting();
    },
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
