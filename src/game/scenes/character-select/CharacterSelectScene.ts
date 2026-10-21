import { type Character, characters, skills } from '@/content';
import { iris } from '@/engine/core/transitions';
import type { Gfx } from '@/engine/gfx/Gfx';
import { mod } from '@/engine/math/scalar';
import { blink, bob } from '@/engine/motion/oscillators';
import { palette } from '../../palette';
import type { GameServices } from '../../services';
import { Button } from '../../ui/Button';
import { Paragraph } from '../../ui/Paragraph';
import { windowThemes } from '../../ui/theme';
import { drawWindow } from '../../ui/Window';
import type { GameScene, GameStep } from '../params';
import { drawStubBanner } from '../StubBanner';

/**
 * STUB — replaced by the character-select crew (starfield card, pedestal,
 * tooltips, READY! stamp; docs/ART-DIRECTION.md › Character select).
 * Left/right picks a character, confirm (or SELECT) continues.
 */
export class CharacterSelectScene implements GameScene {
  readonly #services: GameServices;
  readonly #select: Button;
  #index = 0;
  #time = 0;
  #changedAt = 0;
  #bio: Paragraph | null = null;
  readonly #stars: readonly { readonly x: number; readonly y: number }[];
  #leaving = false;

  constructor(services: GameServices) {
    this.#services = services;
    this.#select = new Button({
      label: 'SELECT',
      bounds: { x: 196, y: 204, w: 72, h: 22 },
      theme: windowThemes.indigo,
      style: services.text.label,
      cursor: undefined,
    });
    const rng = services.rng.fork();
    this.#stars = Array.from({ length: 40 }, () => ({ x: rng.int(0, 115), y: rng.int(0, 110) }));
  }

  enter(): void {
    const saved = this.#services.session.state.characterId;
    this.#index = Math.max(
      0,
      characters.findIndex((character) => character.id === saved),
    );
    this.#layoutBio();
    this.#services.audio.playMusic('select');
  }

  exit(): void {}

  update(step: GameStep): void {
    this.#time += step.dt;
    const { input } = step;
    const delta = (input.wasPressed('right') ? 1 : 0) - (input.wasPressed('left') ? 1 : 0);
    if (delta !== 0) {
      this.#index = mod(this.#index + delta, characters.length);
      this.#changedAt = this.#time;
      this.#layoutBio();
      this.#services.audio.playSfx('menu-move');
    }
    const clicked = this.#select.update(input, true, step.dt);
    if (clicked || input.wasPressed('confirm')) this.#choose();
  }

  render(gfx: Gfx): void {
    const { text, sprites } = this.#services;
    const character = this.#character;
    gfx.fillRect(0, 0, gfx.width, gfx.height, { stops: [palette.navy, palette.ink], bands: 5, dither: 'bayer2' });

    const card = { x: 20, y: 28, w: 128, h: 184 };
    drawWindow(gfx, card, windowThemes.indigo);
    gfx.fillRect(card.x + 5, card.y + 5, card.w - 10, card.h - 10, {
      stops: ['#1a1450', '#3a2a7a'],
      bands: 6,
      dither: 'bayer4',
    });
    for (const [i, star] of this.#stars.entries()) {
      if (blink(this.#time + i * 0.37, 1.1, 0.25)) {
        gfx.pixel(card.x + 6 + star.x, card.y + 6 + star.y, i % 5 === 0 ? palette.white : palette.lavender);
      }
    }
    drawPedestal(gfx, card.x + card.w / 2, card.y + 132);
    gfx.sprite(
      sprites.characters[character.id],
      'idle',
      this.#time - this.#changedAt,
      card.x + card.w / 2,
      card.y + 130,
    );
    const nudge = bob(this.#time, 2, 0.5);
    drawArrow(gfx, card.x - 6 - nudge, card.y + 92, -1);
    drawArrow(gfx, card.x + card.w + 5 + nudge, card.y + 92, 1);

    const x = 164;
    const name = gfx.text(character.name, x, 30, text.prompt);
    gfx.text(character.tag, x + name.width + 6, 30, { ...text.prompt, fill: [palette.sky, palette.royal] });
    gfx.text(character.className, x, 48, { ...text.label, fill: palette.lavender });
    this.#bio?.render(gfx, x, 62);

    character.skills.forEach((skillId, i) => {
      const y = 132 + i * 26;
      drawWindow(gfx, { x, y, w: 26, h: 26 }, windowThemes.steel);
      gfx.sprite(sprites.skillIcons[skillId], 'idle', this.#time, x + 5, y + 5);
      gfx.text(skills[skillId].name, x + 32, y + 9, text.label);
    });

    this.#select.render(gfx);
    drawStubBanner(gfx, this.#services, 'CHARACTER SELECT');
  }

  get #character(): Character {
    return characters[this.#index] as Character;
  }

  #layoutBio(): void {
    this.#bio = new Paragraph(this.#character.bio, this.#services.text.body, { maxWidth: 146 });
  }

  #choose(): void {
    if (this.#leaving) return;
    this.#leaving = true;
    const character = this.#character;
    this.#services.audio.playSfx('menu-confirm');
    this.#services.session.update((state) => ({ ...state, characterId: character.id }));
    this.#services.director.goTo('levelSelect', {}, iris());
  }
}

/** A flat elliptical pedestal, drawn row by row so its edge stays on whole pixels. */
function drawPedestal(gfx: Gfx, cx: number, cy: number): void {
  const rx = 26;
  const ry = 7;
  const span = (dy: number): number => Math.round(rx * Math.sqrt(1 - (dy * dy) / (ry * ry)));
  for (let dy = 0; dy <= ry; dy++) gfx.fillRect(cx - span(dy), cy + dy + 3, span(dy) * 2, 1, '#2a2068');
  for (let dy = -ry; dy <= ry; dy++)
    gfx.fillRect(cx - span(dy), cy + dy, span(dy) * 2, 1, dy === -ry ? '#a99cf0' : '#5a4ab0');
}

/** A chunky outlined triangle pointing left (-1) or right (1), tip at (x, y). */
function drawArrow(gfx: Gfx, x: number, y: number, direction: -1 | 1): void {
  for (let i = 0; i <= 7; i++) {
    const span = i;
    const column = x - direction * i;
    gfx.fillRect(column, y - span - 1, 1, span * 2 + 3, palette.ink);
    if (i > 0 && i < 7) gfx.fillRect(column, y - span, 1, span * 2 + 1, palette.white);
  }
}
