import type { Gfx } from '@/engine/gfx/Gfx';
import { drawParallax } from '@/engine/gfx/Parallax';
import { LabelLayout, type LabelScreen } from '../../../entities/customer/label';
import { drawCustomerLabels, layOutCustomerLabels } from '../../../entities/customer/renderCustomer';
import type { RenderKit } from '../../../entities/RenderKit';
import type { CameraFollow } from '../../../world/CameraFollow';
import type { World } from '../../../world/World';
import { drawWorld } from './drawWorld';
import { drawSparseForeground } from './foreground';
import { drawPlayPlane } from './playPlane';
import { drawPitSigns, drawRails } from './stageDressing';

/** Where the HUD along the bottom of the screen begins, in screen rows: the customers' labels keep above it. */
export interface BottomHud {
  /** Once it has settled in place, which decides the rows the labels take. */
  readonly settled: number;
  /** As drawn this frame: the boss bar overshoots as it rises into place. */
  readonly top: number;
}

/** A `LabelScreen` refilled every frame, so laying out the labels allocates nothing. */
export type LabelScreenBuffer = { -readonly [K in keyof LabelScreen]: LabelScreen[K] };

/**
 * Fills `screen` with where the customers' labels may go this frame on a
 * screen `height` rows tall: the camera at rest and as drawn, above `hud`
 * (none by default). As drawn they clear the HUD both where it settles and
 * where it is this frame, so a shake never carries one onto the rows the
 * HUD is about to take, nor the boss bar's bounce onto one.
 */
export function fillLabelScreen(
  screen: LabelScreenBuffer,
  camera: Pick<CameraFollow, 'width' | 'left' | 'top' | 'view'>,
  height: number,
  hud?: BottomHud,
): void {
  const settled = hud?.settled ?? height;
  const view = camera.view;
  screen.width = camera.width;
  screen.restLeft = camera.left;
  screen.restBottom = camera.top + settled;
  screen.left = view.x;
  screen.bottom = view.y + Math.min(settled, hud?.top ?? height);
}

/**
 * Draws a stage as play shows it, under the HUD: parallax, play plane,
 * dressing, every entity, the sparse foreground, the customers' labels and
 * any full-screen flash. It owns the labels' layout, which remembers from
 * frame to frame the row each label took, so keep one per scene.
 */
export class StageRenderer {
  readonly #labels = new LabelLayout();
  readonly #screen: LabelScreenBuffer = { width: 0, restLeft: 0, restBottom: 0, left: 0, bottom: 0 };

  /**
   * Draws `world`'s stage. `time` drives the backdrop's drift; labels keep
   * above `hud` (none by default); `inWorld` draws extra layers in world
   * space on top of the entities (the hitbox debug view).
   */
  draw(gfx: Gfx, world: World, kit: RenderKit, time: number, hud?: BottomHud, inWorld?: (gfx: Gfx) => void): void {
    const { art } = kit;
    const { camera, stage } = world;
    const view = camera.view;
    const labels = this.#labels;
    const screen = this.#screen;
    fillLabelScreen(screen, camera, gfx.height, hud);
    layOutCustomerLabels(kit, labels, world.customers, world.player, screen);

    drawParallax(gfx, art.background, view.x, 0, time);
    gfx.withOffset(-view.x, -view.y, () => {
      drawPlayPlane(gfx, stage.layout, art.tileset, view.x);
      drawPitSigns(gfx, stage.layout, stage.theme.pit, kit.text.label, view.x);
      for (const mover of world.movers) drawRails(gfx, mover, stage.layout, stage.theme.mover);
      drawWorld(gfx, world, kit, labels);
      inWorld?.(gfx);
    });
    drawSparseForeground(gfx, art.foreground, view.x, stage.theme.foreground, world.arenaX);
    drawCustomerLabels(gfx, kit, labels, 'front', -view.x, -view.y);
    const flash = world.flashColor;
    if (flash) gfx.fillRect(0, 0, gfx.width, gfx.height, flash);
  }
}
