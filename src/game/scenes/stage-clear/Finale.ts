import { type CharacterId, nextLevelTeaser } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { mod } from '@/engine/math/scalar';
import { easeOutBack } from '@/engine/motion/easing';
import { blink } from '@/engine/motion/oscillators';
import { frames, segment } from '@/engine/motion/progress';
import { palette } from '../../palette';
import type { GameServices } from '../../services';
import { Button } from '../../ui/Button';
import { handCursorSheet } from '../../ui/cursor';
import { Paragraph } from '../../ui/Paragraph';
import { windowThemes } from '../../ui/theme';
import { envelopeSheet } from '../level-select/art/icons';
import type { TeaserSlot } from '../level-select/missions';
import { Postcards } from '../level-select/Postcards';
import type { GameStep } from '../params';
import { SlamTitle } from './SlamTitle';
import { drawSpotlight } from './spotlight';

export type FinaleAction = 'contact' | 'missionSelect' | 'close';

const TITLE_TIMING = { letterStart: (index: number) => 0.15 + index * 0.04, fall: 0.2 } as const;
const CARD = { x: 111, y: 46, w: 98, h: 82 } as const;
const CARD_IN = { start: 0.9, end: 1.25 } as const;
const BUTTONS_AT = 1.5;

/**
 * Shown once every mission is cleared: "ALL MISSIONS COMPLETE!", then the
 * locked third postcard — MISSION 3, YOUR TEAM? — with the contact call to
 * action. The game's last word is an invitation, not a credits roll.
 */
export class Finale {
  readonly #services: GameServices;
  readonly #characterId: CharacterId;
  readonly #title: SlamTitle;
  readonly #postcards: Postcards;
  readonly #body: Paragraph;
  readonly #cursor = SpriteSheet.compile(handCursorSheet, 'ui/hand-cursor');
  readonly #envelope = SpriteSheet.compile(envelopeSheet, 'mission-select/envelope');
  readonly #buttons: readonly { readonly action: FinaleAction; readonly button: Button }[];
  #time = 0;
  #focus = 0;

  constructor(services: GameServices, characterId: CharacterId) {
    this.#services = services;
    this.#characterId = characterId;
    const { text } = services;
    this.#title = new SlamTitle(['ALL MISSIONS COMPLETE!'], text.title, 1);
    this.#postcards = new Postcards(services);
    this.#body = new Paragraph(
      nextLevelTeaser.body,
      { ...text.body, fill: palette.white },
      { maxWidth: 236, align: 'center' },
    );
    const make = (action: FinaleAction, label: string, x: number, w: number) => ({
      action,
      button: new Button({
        label,
        bounds: { x, y: 190, w, h: 20 },
        theme: action === 'contact' ? windowThemes.indigo : windowThemes.steel,
        style: { ...text.label, fill: action === 'contact' ? palette.gold : palette.white },
        cursor: this.#cursor,
      }),
    });
    this.#buttons = [make('contact', 'CONTACT', 58, 96), make('missionSelect', 'MISSION SELECT', 166, 96)];
  }

  update(step: GameStep): FinaleAction | null {
    this.#time += step.dt;
    const { input } = step;
    if (this.#time < BUTTONS_AT) return null;
    if (input.wasPressed('back')) return 'close';
    const delta = (input.wasPressed('right') ? 1 : 0) - (input.wasPressed('left') ? 1 : 0);
    if (delta !== 0) {
      this.#focus = mod(this.#focus + delta, this.#buttons.length);
      this.#services.audio.playSfx('menu-move');
    }
    for (const [index, { action, button }] of this.#buttons.entries()) {
      if (button.update(input, index === this.#focus, step.dt)) return action;
    }
    return null;
  }

  render(gfx: Gfx): void {
    // The night sky closes over the results in three flat steps, then the finale owns the screen.
    const cover = Math.min(1, (Math.floor(this.#time / frames(2)) + 1) / 3);
    gfx.withAlpha(cover, () => drawNightSky(gfx, this.#time));
    this.#title.render(gfx, gfx.width / 2, 16, this.#time, TITLE_TIMING);

    const rise = segment(this.#time, CARD_IN.start, CARD_IN.end, easeOutBack);
    if (this.#time >= CARD_IN.start) {
      const card = { ...CARD, y: CARD.y + Math.round((1 - rise) * 40) };
      // The tab names the postcard the way the caption under it does.
      const teaser: TeaserSlot = { kind: 'teaser', label: nextLevelTeaser.mission, teaser: nextLevelTeaser };
      this.#postcards.draw(gfx, teaser, card, {
        focused: true,
        lift: 0,
        time: this.#time,
      });
      const { looks } = this.#services;
      drawSpotlight(gfx, 62, 126);
      drawSpotlight(gfx, 258, 126);
      gfx.sprite(looks.characters[this.#characterId].sheet, 'victory', this.#time, 62, 126);
      gfx.sprite(looks.customer.sheet, 'happy', this.#time, 258, 126, { flipX: true });
    }
    if (this.#time < BUTTONS_AT) return;
    const { text } = this.#services;
    gfx.text(
      `${nextLevelTeaser.mission} · ${nextLevelTeaser.title}`,
      gfx.width / 2,
      138,
      { ...text.label, fill: palette.gold },
      { align: 'center' },
    );
    this.#body.render(gfx, gfx.width / 2 - 118, 152);
    for (const { button } of this.#buttons) button.render(gfx);
    const address = nextLevelTeaser.cta.label;
    const addressWidth = gfx.measureText(address, text.body).width + 15;
    const addressX = Math.round((gfx.width - addressWidth) / 2);
    gfx.sprite(this.#envelope, 'idle', this.#time, addressX, 218);
    gfx.text(address, addressX + 15, 219, { ...text.body, fill: palette.lavender });
  }
}

const STAR_COUNT = 48;

/** A deep indigo sky with stars that twinkle on hard on/off beats, each on its own phase. */
function drawNightSky(gfx: Gfx, time: number): void {
  gfx.fillRect(0, 0, gfx.width, gfx.height, {
    stops: [palette.ink, palette.navy, palette.indigo],
    bands: 6,
    dither: 'bayer2',
  });
  for (let i = 0; i < STAR_COUNT; i++) {
    const x = Math.floor(hash01(i * 2 + 1) * gfx.width);
    const y = Math.floor(hash01(i * 2 + 2) * gfx.height);
    const on = blink(time + hash01(i + 97) * 3, frames(90), frames(12));
    if (on) gfx.pixel(x, y, i % 5 === 0 ? palette.gold : palette.lilac);
  }
}

function hash01(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
