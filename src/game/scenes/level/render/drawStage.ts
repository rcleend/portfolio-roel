import type { Gfx } from '@/engine/gfx/Gfx';
import { drawParallax } from '@/engine/gfx/Parallax';
import type { RenderKit } from '../../../entities/RenderKit';
import type { World } from '../../../world/World';
import { drawWorld } from './drawWorld';
import { drawSparseForeground } from './foreground';
import { drawPlayPlane } from './playPlane';
import { drawPitSigns, drawRails } from './stageDressing';

/**
 * A stage as play shows it, under the HUD: parallax, play plane, dressing,
 * every entity, the sparse foreground and any full-screen flash. `time`
 * drives the backdrop's drift; `inWorld` draws extra layers in world space
 * on top of the entities (the hitbox debug view).
 */
export function drawStage(gfx: Gfx, world: World, kit: RenderKit, time: number, inWorld?: (gfx: Gfx) => void): void {
  const { art } = kit;
  const view = world.camera.view;
  const { stage } = world;
  drawParallax(gfx, art.background, view.x, 0, time);
  gfx.withOffset(-view.x, -view.y, () => {
    drawPlayPlane(gfx, stage.layout, art.tileset, view.x);
    drawPitSigns(gfx, stage.layout, stage.theme.pit, kit.text.label, view.x);
    for (const mover of world.movers) drawRails(gfx, mover, stage.layout, stage.theme.mover);
    drawWorld(gfx, world, kit);
    inWorld?.(gfx);
  });
  drawSparseForeground(gfx, art.foreground, view.x, stage.theme.foreground, world.arenaX);
  const flash = world.flashColor;
  if (flash) gfx.fillRect(0, 0, gfx.width, gfx.height, flash);
}
