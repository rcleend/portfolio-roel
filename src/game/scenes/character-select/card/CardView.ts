import { type CharacterId, characters } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import type { Rng } from '@/engine/math/Rng';
import type { CharacterAnimation } from '../../../art/looks/contracts';
import type { Looks } from '../../../art/looks/Looks';
import { INK, shadeOf } from '../../title/backdrops/blueprint/inks';
import { classThemes } from '../classThemes';
import { CARD, CARD_INNER, STAGE } from '../layout';
import { lazy } from '../lazy';
import { type CardFrameLook, drawCardFrame } from './cardFrame';
import { type EmblemAnimation, emblemSheets } from './emblems';
import { drawField } from './field';
import { createParticles, drawParticles, type Particle } from './particles';
import { drawPedestal } from './pedestal';
import { drawSpotlight } from './spotlight';
import { createStars, drawStars, type Star } from './starfield';

const STAR_COUNT = 34;
const SEAM_MIN_OFFSET = 4;

export interface CharacterPose {
  readonly animation: CharacterAnimation;
  /** Seconds into the animation. */
  readonly time: number;
  /** Paints the whole sprite in one colour, for the hit-flash beat when chosen. */
  readonly flash?: string;
}

export interface CardSwitch {
  readonly from: CharacterId;
  /** Content offsets from `switchOffsets`. */
  readonly incoming: number;
  readonly outgoing: number;
}

export interface CardRenderOptions {
  readonly characterId: CharacterId;
  /** Scene time: drives stars, particles and the pedestal pulse. */
  readonly time: number;
  readonly pose: CharacterPose;
  /** Present while the content wipes from one character to the next. */
  readonly switching?: CardSwitch;
  /** 0–1 white over the card's inside. */
  readonly flash?: number;
  readonly frameLook?: CardFrameLook;
  /** Vertical jolt of the whole card in pixels, e.g. when the stamp lands. */
  readonly jolt?: number;
}

interface CardScenery {
  readonly emblem: () => SpriteSheet<EmblemAnimation>;
  readonly stars: readonly Star[];
  readonly particles: readonly Particle[];
}

/** Centre of the class emblem, in the upper half of the spotlight. */
const EMBLEM_Y = CARD.y + 66;

/**
 * The tall character card on the left: bevelled frame around a deep
 * cyanotype starfield, class particles, a glowing pedestal and the character
 * idling on it. Scenery is generated once per character from a forked RNG,
 * so it is stable while browsing and reproducible under a fixed seed.
 */
export class CardView {
  readonly #looks: Looks;
  readonly #scenery: ReadonlyMap<CharacterId, CardScenery>;

  constructor(looks: Looks, rng: Rng) {
    this.#looks = looks;
    this.#scenery = new Map(
      characters.map((character) => [
        character.id,
        {
          emblem: lazy(() =>
            SpriteSheet.compile(emblemSheets[character.id], `character-select/emblem-${character.id}`),
          ),
          stars: createStars(rng, CARD_INNER.w, CARD_INNER.h, STAR_COUNT),
          particles: createParticles(classThemes[character.id].particles, rng, CARD_INNER.w, CARD_INNER.h),
        },
      ]),
    );
  }

  render(gfx: Gfx, options: CardRenderOptions): void {
    gfx.withOffset(0, options.jolt ?? 0, () => {
      drawCardFrame(gfx, CARD, options.frameLook);
      const inner = CARD_INNER;
      gfx.withClip(inner.x, inner.y, inner.w, inner.h, () => {
        drawField(gfx);
        const { switching } = options;
        if (switching) {
          // The previous character keeps idling as it slides away.
          this.#drawContent(gfx, switching.from, switching.outgoing, options.time, {
            animation: 'idle',
            time: options.time,
          });
          this.#drawContent(gfx, options.characterId, switching.incoming, options.time, options.pose);
          drawSeam(gfx, switching.incoming);
        } else {
          this.#drawContent(gfx, options.characterId, 0, options.time, options.pose);
        }
        const flash = options.flash ?? 0;
        if (flash > 0) gfx.withAlpha(flash, () => gfx.fillRect(inner.x, inner.y, inner.w, inner.h, '#ffffff'));
      });
    });
  }

  #drawContent(gfx: Gfx, id: CharacterId, offsetX: number, time: number, pose: CharacterPose): void {
    const scenery = this.#scenery.get(id);
    const theme = classThemes[id];
    const inner = CARD_INNER;
    const x = inner.x + offsetX;
    const cx = STAGE.x + offsetX;
    drawSpotlight(gfx, cx, inner.y, STAGE.y);
    if (scenery) {
      gfx.sprite(scenery.emblem(), 'still', 0, cx, EMBLEM_Y);
      drawStars(gfx, scenery.stars, x, inner.y, time);
      drawParticles(gfx, theme.particles, scenery.particles, x, inner.y, inner.h, time);
    }
    drawPedestal(gfx, cx, STAGE.y, theme, time);
    gfx.sprite(this.#looks.characters[id].sheet, pose.animation, pose.time, cx, STAGE.y + 1, { flash: pose.flash });
  }
}

/** A bright leading edge on the incoming content sells the wipe as a hard cut, not a soft slide. */
function drawSeam(gfx: Gfx, incoming: number): void {
  // The last few pixels of the ease are the settle; a seam there would read as a stray line on the frame.
  if (Math.abs(incoming) < SEAM_MIN_OFFSET) return;
  const inner = CARD_INNER;
  const edge = incoming > 0 ? inner.x + incoming : inner.x + inner.w + incoming;
  const trail = incoming > 0 ? 1 : -2;
  gfx.fillRect(edge - 1, inner.y, 2, inner.h, shadeOf(INK.hot));
  gfx.fillRect(edge + trail, inner.y, 1, inner.h, shadeOf(INK.mid));
}
