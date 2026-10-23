import { type Material, Mesh, type Texture } from 'three';
import type { GameSurface } from '@/engine/core/GameSurface';
import type { RoomAssets } from './assets/roomAssets';
import { CameraRig } from './camera/CameraRig';
import { ScreenFade } from './camera/ScreenFade';
import type { Interactable } from './interaction/Interactable';
import { RoomInteraction } from './interaction/RoomInteraction';
import { LavaLamp } from './stage/LavaLamp';
import type { RoomStage } from './stage/RoomStage';
import { addRoomLighting } from './stage/roomLighting';
import { Television } from './tv/Television';
import { TvInteractable } from './tv/TvInteractable';
import { locateTv } from './tv/tvModel';
import type { ViewController } from './ViewController';

export interface RoomSceneOptions {
  readonly stage: RoomStage;
  readonly assets: RoomAssets;
  readonly surface: GameSurface;
  readonly views: ViewController;
  readonly reducedMotion: MediaQueryList;
}

/** Everything that exists once the room's assets are loaded. */
export interface RoomScene {
  readonly rig: CameraRig;
  readonly television: Television;
  readonly tvInput: TvInteractable;
  readonly lava: LavaLamp;
  register(interactable: Interactable): () => void;
  /** Re-evaluates the pointer cursor after the view changed. */
  refreshCursor(): void;
  dispose(): void;
}

const MAX_ANISOTROPY = 4;

/** Puts the loaded attic together: lighting, TV, camera, lava and pointer interaction. */
export function assembleRoom({ stage, assets, surface, views, reducedMotion }: RoomSceneOptions): RoomScene {
  const { scene, loop, camera } = stage;
  scene.add(assets.room.scene, assets.tv, ...assets.devices);
  const removeLighting = addRoomLighting(scene);
  const anisotropy = Math.min(MAX_ANISOTROPY, stage.renderer.capabilities.getMaxAnisotropy());
  scene.traverse((object) => {
    if (object instanceof Mesh) forEachTexture(object.material, (texture) => (texture.anisotropy = anisotropy));
  });

  const model = locateTv(assets.tv);
  const fade = new ScreenFade();
  scene.add(fade.mesh);
  const rig = new CameraRig(camera, loop, model, reducedMotion, fade);
  const television = new Television({ model, surface, scene, loop, reducedMotion });
  const lava = new LavaLamp({
    root: assets.room.scene,
    clips: assets.room.animations,
    camera,
    isStageVisible: () => stage.visible,
    reducedMotion,
    invalidate: () => loop.invalidate(),
  });

  const tvInput = new TvInteractable({
    tv: model,
    surface,
    contentRect: television.contentRect,
    isPlayable: () => views.atTv && television.powerState === 'on',
    isInRoomView: () => views.view === 'room',
    focusTv: () => views.request('tv'),
  });
  const interaction = new RoomInteraction({
    canvas: stage.canvas,
    camera,
    isEnabled: () => !views.moving,
    // Clicking anything but the TV while watching it steps back into the room.
    onMiss: () => {
      if (views.view === 'tv') views.request('room');
    },
    idleCursor: () => (views.atTv ? 'zoom-out' : 'default'),
    onPointer: (ndc) => rig.setParallaxPointer(ndc),
  });
  const unregisterTv = interaction.register(tvInput);

  const syncSize = (): void => {
    rig.resize(stage.size);
    television.setPixelRatio(stage.size.pixelRatio);
  };
  syncSize();
  const stopResize = stage.onResize(syncSize);
  const stopRender = stage.onRender(() => {
    television.syncGlow();
    lava.sync();
  });
  rig.jumpTo(views.view);

  return {
    rig,
    television,
    tvInput,
    lava,
    register: (interactable) => interaction.register(interactable),
    refreshCursor: () => interaction.refreshCursor(),
    dispose() {
      stopResize();
      stopRender();
      unregisterTv();
      interaction.dispose();
      lava.dispose();
      television.dispose();
      rig.dispose();
      fade.dispose();
      removeLighting();
    },
  };
}

export function forEachTexture(material: Material | Material[], visit: (texture: Texture) => void): void {
  for (const m of Array.isArray(material) ? material : [material]) {
    for (const value of Object.values(m)) {
      if (isTexture(value)) visit(value);
    }
  }
}

function isTexture(value: unknown): value is Texture {
  return typeof value === 'object' && value !== null && (value as { isTexture?: unknown }).isTexture === true;
}
