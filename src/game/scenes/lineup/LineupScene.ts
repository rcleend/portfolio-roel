import { getCharacter } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import { drawParallax } from '@/engine/gfx/Parallax';
import type { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { customerConceptSheet } from '../../art/looks/terraria/customer-concepts/concepts';
import { terrariaDesignSheet } from '../../art/looks/terraria/designs';
import type { LevelArt } from '../../levels/art/LevelArt';
import { palette } from '../../palette';
import type { GameServices } from '../../services';
import { GROUND_Y } from '../../world/map/buildGrid';
import type { LevelLayout } from '../../world/map/layout';
import { drawBackdrop } from '../character-select/backdrop';
import { classThemes } from '../character-select/classThemes';
import { drawPlayPlane } from '../level/render/playPlane';
import type { GameScene, GameStep, LineupParams } from '../params';
import { arenaStage } from '../showcase/arena';
import { customerStandsFor, customersScaleHero, standsFor, standX } from './cast';
import { type Lineup, type LineupCustomer, resolveLineup } from './params';

/** Feet on the stages' ground line; the select screen's paper gets a floor line there to compare heights. */
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
  /** What it plays: a hero idles; a customer holds one of its moods. */
  readonly animation: string;
  readonly label: string;
  readonly color: string;
  readonly caption: string | null;
}

/**
 * Development-only lineup (`?scene=lineup`): characters standing still side
 * by side at native size, each labelled under its feet, on the select
 * screen's blueprint paper or on a stage. `{"cast":"terraria"}` (the default) stands the
 * Terraria designs (art/looks/terraria/designs.ts) beside the game's ENGINEER
 * for scale, `{"cast":"revised"}` their revision, a design's variant named
 * under it; `{"cast":"game"}` the three heroes as the game draws them;
 * `{"cast":"customers"}` a customer shouting and won over beside the
 * Terraria ENGINEER, the game's customer unless `customer` names a Terraria
 * concept (art/looks/terraria/customer-concepts/), which then stands beside
 * the game's for scale too. The designs and concepts load with whoever opens
 * the scene (`preloadSceneArt`). Heroes play their idle on the scene's own
 * clock, so a design blinks as it will in the game, and customers their
 * moods; nothing else moves.
 */
export class LineupScene implements GameScene<LineupParams | undefined> {
  readonly #services: GameServices;
  /** `null` stands them on the select screen's paper. */
  #stage: Stage | null = null;
  #figures: readonly Figure[] = [];
  #time = 0;

  constructor(services: GameServices) {
    this.#services = services;
  }

  enter(params: LineupParams | undefined): void {
    const lineup = resolveLineup(params);
    const { backdrop } = lineup;
    this.#time = 0;
    const { levelArt } = this.#services;
    this.#stage = backdrop === 'menu' ? null : { art: levelArt.get(backdrop), layout: arenaStage(backdrop, []).layout };
    this.#figures = lineup.cast === 'customers' ? this.#customers(lineup.customer) : this.#heroes(lineup.cast);
  }

  #heroes(cast: Exclude<Lineup['cast'], 'customers'>): readonly Figure[] {
    const { assets, looks } = this.#services;
    return standsFor(cast).map((stand): Figure => {
      const hero = getCharacter(stand.hero);
      const accent = classThemes[stand.hero].accent;
      if (stand.design) {
        return {
          sheet: terrariaDesignSheet(assets, stand.design),
          animation: 'idle',
          label: hero.className,
          color: accent,
          caption: stand.design.variant,
        };
      }
      const look = looks.characters[stand.hero];
      const lookName = look.lookId.toUpperCase();
      return stand.scale
        ? { sheet: look.sheet, animation: 'idle', label: lookName, color: palette.steel, caption: null }
        : { sheet: look.sheet, animation: 'idle', label: hero.className, color: accent, caption: lookName };
    });
  }

  #customers(customer: LineupCustomer): readonly Figure[] {
    const { assets, looks } = this.#services;
    const design = customersScaleHero();
    const hero: Figure = {
      sheet: terrariaDesignSheet(assets, design),
      animation: 'idle',
      label: getCharacter(design.hero).className,
      color: classThemes[design.hero].accent,
      caption: null,
    };
    const lookName = looks.customer.lookId.toUpperCase();
    const customers = customerStandsFor(customer).map((stand): Figure => {
      const sheet = stand.concept ? customerConceptSheet(assets, stand.concept) : looks.customer.sheet;
      if (stand.scale) return { sheet, animation: stand.pose, label: lookName, color: palette.steel, caption: null };
      const happy = stand.pose === 'happy';
      return {
        sheet,
        animation: stand.pose,
        label: happy ? 'HAPPY' : 'UNHAPPY',
        color: happy ? palette.green : palette.red,
        caption: stand.concept ? null : lookName,
      };
    });
    return [hero, ...customers];
  }

  exit(): void {}

  update(step: GameStep): void {
    this.#time += step.dt;
  }

  render(gfx: Gfx): void {
    this.#drawBackdrop(gfx);
    const { text } = this.#services;
    this.#figures.forEach((figure, index) => {
      const x = standX(index, this.#figures.length, gfx.width);
      gfx.sprite(figure.sheet, figure.animation, this.#time, x, FEET_Y);
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
