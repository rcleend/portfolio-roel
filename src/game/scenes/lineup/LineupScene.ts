import { getCharacter } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import { drawParallax } from '@/engine/gfx/Parallax';
import type { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { terrariaDesignSheet } from '../../art/looks/terraria/designs';
import type { LevelArt } from '../../levels/art/LevelArt';
import { palette } from '../../palette';
import type { GameServices } from '../../services';
import { GROUND_Y } from '../../world/map/buildGrid';
import type { LevelLayout } from '../../world/map/layout';
import { drawBackdrop } from '../character-select/backdrop';
import { classThemes } from '../character-select/classThemes';
import { drawPlayPlane } from '../level/render/playPlane';
import type { GameScene, LineupParams } from '../params';
import { arenaStage } from '../showcase/arena';
import { standsFor, standX } from './cast';
import { resolveLineup } from './params';

/** Feet on the stages' ground line; the select screen's navy gets a floor line there to compare heights. */
const FEET_Y = GROUND_Y;
const LABEL_GAP = 6;
const CAPTION_GAP = 16;

/** A stage to stand on: its art and a flat, one-screen stretch of its ground. */
interface Stage {
  readonly art: LevelArt;
  readonly layout: LevelLayout;
}

interface Figure {
  readonly sheet: SpriteSheet;
  readonly label: string;
  readonly color: string;
  readonly caption: string | null;
}

/**
 * Development-only lineup (`?scene=lineup`): characters standing still side
 * by side at native size, each labelled under its feet, on the select
 * screen's navy or on a stage. `{"cast":"terraria"}` (the default) stands the
 * Terraria designs (art/looks/terraria/designs.ts) beside the game's ENGINEER
 * for scale; `{"cast":"game"}` the three heroes as the game draws them. The
 * designs load with whoever opens the scene (`preloadSceneArt`). Static: it
 * is for looking at.
 */
export class LineupScene implements GameScene<LineupParams | undefined> {
  readonly #services: GameServices;
  /** `null` stands them on the select screen's navy. */
  #stage: Stage | null = null;
  #figures: readonly Figure[] = [];

  constructor(services: GameServices) {
    this.#services = services;
  }

  enter(params: LineupParams | undefined): void {
    const { cast, backdrop } = resolveLineup(params);
    const { assets, looks, levelArt } = this.#services;
    this.#stage = backdrop === 'menu' ? null : { art: levelArt.get(backdrop), layout: arenaStage(backdrop, []).layout };
    this.#figures = standsFor(cast).map((stand): Figure => {
      const hero = getCharacter(stand.hero);
      const accent = classThemes[stand.hero].accent;
      if (stand.design) {
        return {
          sheet: terrariaDesignSheet(assets, stand.design),
          label: hero.className,
          color: accent,
          caption: stand.design.variant,
        };
      }
      const look = looks.characters[stand.hero];
      const lookName = look.lookId.toUpperCase();
      return stand.scale
        ? { sheet: look.sheet, label: lookName, color: palette.steel, caption: null }
        : { sheet: look.sheet, label: hero.className, color: accent, caption: lookName };
    });
  }

  exit(): void {}

  update(): void {}

  render(gfx: Gfx): void {
    this.#drawBackdrop(gfx);
    const { text } = this.#services;
    this.#figures.forEach((figure, index) => {
      const x = standX(index, this.#figures.length, gfx.width);
      gfx.sprite(figure.sheet, 'idle', 0, x, FEET_Y);
      gfx.text(figure.label, x, FEET_Y + LABEL_GAP, { ...text.hud, fill: figure.color }, { align: 'center' });
      if (figure.caption) {
        gfx.text(figure.caption, x, FEET_Y + CAPTION_GAP, { ...text.hud, fill: palette.steel }, { align: 'center' });
      }
    });
  }

  #drawBackdrop(gfx: Gfx): void {
    const stage = this.#stage;
    if (!stage) {
      drawBackdrop(gfx);
      gfx.fillRect(0, FEET_Y, gfx.width, 1, palette.violet);
      return;
    }
    drawParallax(gfx, stage.art.background, 0);
    drawPlayPlane(gfx, stage.layout, stage.art.tileset, 0);
  }
}
