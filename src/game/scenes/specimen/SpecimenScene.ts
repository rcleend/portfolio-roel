import { characters, type SkillId, skills } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { mod } from '@/engine/math/scalar';
import { blink } from '@/engine/motion/oscillators';
import { frames } from '@/engine/motion/progress';
import { CHARACTER_ANIMATIONS, CUSTOMER_ANIMATIONS } from '../../art/looks/contracts';
import { skillIcons } from '../../art/looks/Looks';
import type { TextStyleName } from '../../fonts';
import { palette } from '../../palette';
import type { GameServices } from '../../services';
import { Button } from '../../ui/Button';
import { handCursorSheet } from '../../ui/cursor';
import { drawIconSlot, iconSlotSize } from '../../ui/iconSlot';
import { TypewriterText } from '../../ui/TypewriterText';
import { windowThemes } from '../../ui/theme';
import { drawWindow, windowContent } from '../../ui/Window';
import type { GameScene, GameStep, SpecimenParams } from '../params';
import { enemyPage, heroRows } from './layout';

const PAGES = ['TYPE', 'CHARACTERS', 'ENEMY + ICONS', 'UI KIT'] as const;
/** The label face's cell height, for centring a skill's name on its slot. */
const LABEL_HEIGHT = 8;

/**
 * Development-only specimen sheet (`?scene=specimen`): every font, text
 * style, sprite animation and UI widget on screen at native resolution, so
 * crispness can be checked by eye. Left/right flips pages.
 */
export class SpecimenScene implements GameScene<SpecimenParams | undefined> {
  readonly #services: GameServices;
  readonly #cursor = SpriteSheet.compile(handCursorSheet, 'ui/hand-cursor');
  readonly #typewriter: TypewriterText;
  readonly #buttons: Button[];
  #page = 0;
  #time = 0;
  #focus = 0;

  constructor(services: GameServices) {
    this.#services = services;
    this.#typewriter = new TypewriterText(
      'LEENDERS PRODUCTION — typed one character every four frames.',
      services.text.body,
      {
        maxWidth: 140,
        framesPerChar: 4,
      },
    );
    this.#buttons = ['PLAY', 'SELECT'].map(
      (label, i) =>
        new Button({
          label,
          bounds: { x: 190, y: 150 + i * 28, w: 84, h: 22 },
          theme: i === 0 ? windowThemes.indigo : windowThemes.steel,
          style: services.text.label,
          cursor: this.#cursor,
        }),
    );
  }

  enter(params: SpecimenParams | undefined): void {
    this.#page = mod(params?.page ?? 0, PAGES.length);
  }

  exit(): void {}

  update(step: GameStep): void {
    this.#time += step.dt;
    const { input } = step;
    const delta = (input.wasPressed('right') ? 1 : 0) - (input.wasPressed('left') ? 1 : 0);
    if (delta) this.#page = mod(this.#page + delta, PAGES.length);
    if (input.wasPressed('down')) this.#focus = mod(this.#focus + 1, this.#buttons.length);
    if (input.wasPressed('up')) this.#focus = mod(this.#focus - 1, this.#buttons.length);
    this.#buttons.forEach((button, i) => {
      button.update(input, i === this.#focus, step.dt);
    });
    this.#typewriter.update();
  }

  render(gfx: Gfx): void {
    gfx.fillRect(0, 0, gfx.width, gfx.height, { stops: [palette.navy, palette.ink], bands: 4, dither: 'bayer2' });
    const { text } = this.#services;
    gfx.text(`SPECIMEN ${this.#page + 1}/${PAGES.length} · ${PAGES[this.#page]}`, 6, 4, text.hud);
    gfx.text('< > PAGE', gfx.width - 6, 4, { ...text.hud, fill: palette.lavender }, { align: 'right' });
    [this.#renderType, this.#renderCharacters, this.#renderEnemyAndIcons, this.#renderUiKit][this.#page]?.call(
      this,
      gfx,
    );
  }

  #renderType(gfx: Gfx): void {
    const { text, fonts } = this.#services;
    const samples: [TextStyleName, string][] = [
      ['prompt', 'PRESS ANY BUTTON'],
      ['title', 'PRODUCT ENGINEER'],
      ['label', 'FULL-STACK ATTACK  LV.99'],
      ['hud', 'SCORE 0012340  1UP=3'],
      ['body', 'Sees the interface before it exists.'],
    ];
    let y = 18;
    for (const [name, sample] of samples) {
      gfx.text(name.toUpperCase(), 6, y + 2, { ...text.hud, fill: palette.steel });
      const block = gfx.text(sample, 64, y, text[name]);
      y += block.height + 7;
    }
    const captionStyle = text.caption;
    gfx.fillRect(62, y - 2, 252, 13, palette.cream);
    gfx.text('Caption: dark navy on cream paper.', 64, y, captionStyle);
    y += 16;
    const small = { ...text.body, fill: palette.white, shadow: undefined };
    gfx.text('ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789', 6, y, small);
    gfx.text('abcdefghijklmnopqrstuvwxyz .,:;!?\'"-–—()/&%+@#', 6, y + 11, small);
    gfx.text('résumé · Björn · Späti · © 1996 ★ ×→', 6, y + 22, small);
    const ruler = 'Hello world, 28 characters!!';
    gfx.text(ruler, 6, y + 36, small);
    gfx.fillRect(6, y + 47, 170, 1, palette.red);
    gfx.text(`${fonts.small.measure(ruler)}px`, 180, y + 36, { ...text.hud, fill: palette.red });
    gfx.text('LABEL: ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789 ©·', 6, y + 52, text.label);
    gfx.text('ARCADE: ABCDEFGHIJKLM', 6, y + 66, { ...text.prompt, fill: palette.white });
    gfx.text('NOPQRSTUVWXYZ 0123456789!?', 6, y + 82, { ...text.prompt, fill: palette.white });
  }

  #renderCharacters(gfx: Gfx): void {
    const { looks, text } = this.#services;
    const sheets = characters.map((character) => looks.characters[character.id].sheet);
    const rows = heroRows(Math.max(...sheets.map((sheet) => sheet.height)));
    const feet = (row: number) => rows.firstFeet + row * rows.pitch;
    CHARACTER_ANIMATIONS.forEach((animation, column) => {
      const x = 22 + column * 38;
      gfx.text(animation.toUpperCase(), x, 18, { ...text.hud, fill: palette.lavender }, { align: 'center' });
      sheets.forEach((sheet, row) => {
        const time = mod(this.#time, sheet.duration(animation) + 0.5);
        gfx.sprite(sheet, animation, time, x, feet(row));
      });
    });
    characters.forEach((character, row) => {
      gfx.fillRect(4, feet(row), gfx.width - 8, 1, palette.violet);
      gfx.text(character.name, 4, feet(row) + 4, { ...text.hud, fill: palette.steel });
    });
  }

  #renderEnemyAndIcons(gfx: Gfx): void {
    const { looks, text } = this.#services;
    const sheet = looks.customer.sheet;
    const icons = (Object.keys(looks.skills) as SkillId[]).map((id) => ({ id, icon: looks.skills[id].icon }));
    const slot = iconSlotSize(26, skillIcons(looks));
    const page = enemyPage(sheet.height, slot);
    // Tall art leaves room for one row, which alternates between as drawn and flipped with a hit flash.
    const [first = 0, second] = page.customerFeet;
    const flipOnly = second === undefined && Math.floor(this.#time) % 2 === 1;
    const flipped = { flipX: true, flash: blink(this.#time, frames(4), frames(4)) ? '#ffffff' : undefined };
    CUSTOMER_ANIMATIONS.forEach((animation, column) => {
      const x = 32 + column * 60;
      gfx.text(animation.toUpperCase(), x, 20, { ...text.hud, fill: palette.lavender }, { align: 'center' });
      const time = mod(this.#time, sheet.duration(animation) + 0.3);
      gfx.sprite(sheet, animation, time, x, first, flipOnly ? flipped : undefined);
      if (second !== undefined) gfx.sprite(sheet, animation, time, x, second, flipped);
    });
    if (second !== undefined || flipOnly) {
      gfx.text(
        'FLIPPED + HIT FLASH',
        gfx.width / 2,
        page.captionY,
        { ...text.hud, fill: palette.steel },
        { align: 'center' },
      );
    }
    icons.forEach(({ id, icon }, i) => {
      const x = 8 + (i % 2) * 156;
      const y = page.iconsTop + Math.floor(i / 2) * page.iconPitch;
      drawIconSlot(gfx, icon, this.#time, { x, y, size: slot, theme: windowThemes.steel });
      gfx.text(skills[id].name, x + slot + 4, y + Math.floor((slot - LABEL_HEIGHT) / 2), { ...text.label });
    });
  }

  #renderUiKit(gfx: Gfx): void {
    const { text } = this.#services;
    const themes = [windowThemes.indigo, windowThemes.steel, windowThemes.cream];
    themes.forEach((theme, i) => {
      const frame = { x: 8 + i * 60, y: 22, w: 54, h: 40 };
      drawWindow(gfx, frame, theme);
      const inner = windowContent(frame);
      gfx.text(
        ['INDIGO', 'STEEL', 'CREAM'][i] ?? '',
        inner.x,
        inner.y,
        i === 2 ? { ...text.label, fill: palette.navy, shadow: undefined } : text.label,
      );
    });
    const typed = { x: 8, y: 74, w: 170, h: 50 };
    drawWindow(gfx, typed, windowThemes.indigo, { title: 'TYPEWRITER', titleStyle: text.label });
    this.#typewriter.render(gfx, typed.x + 8, typed.y + 12);
    for (const button of this.#buttons) button.render(gfx);
    gfx.text('UP/DOWN: FOCUS', 190, 210, { ...text.hud, fill: palette.steel });
    const swatches = Object.values(palette);
    swatches.forEach((color, i) => {
      gfx.fillRect(8 + (i % 10) * 17, 136 + Math.floor(i / 10) * 17, 15, 15, color);
    });
  }
}
