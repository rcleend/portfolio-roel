import { type Character, type CharacterId, characters, type SkillId, skills } from '@/content';
import { shade } from '@/engine/gfx/color';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import { blink } from '@/engine/motion/oscillators';
import { frames } from '@/engine/motion/progress';
import type { Looks } from '../../art/looks/Looks';
import type { TextStyles } from '../../fonts';
import { palette } from '../../palette';
import { drawIconSlot } from '../../ui/iconSlot';
import { Paragraph } from '../../ui/Paragraph';
import { windowThemes } from '../../ui/theme';
import { classThemes } from './classThemes';
import { BIO_Y, DETAILS, NAME_Y, PROMPT_Y, type SelectLayout, SKILL_NAME_HEIGHT, SKILLS_Y } from './layout';

/** The heading's outline reaches one pixel left of its pen position. */
const NAME_MASK_BLEED = 1;
/** Cap height plus outline and drop shadow. */
const NAME_HEIGHT = 18;
const PROMPT = 'PICK YOUR ROEL';
/** A slow, even cursor blink: the prompt is waiting, not urging like PRESS START. */
const PROMPT_CURSOR_BLINK = frames(36);

export interface DetailsRenderOptions {
  readonly character: Character;
  readonly time: number;
  /** Horizontal settle of the name after a switch. */
  readonly nameOffset: number;
}

/**
 * The right-hand column: the PICK YOUR ROEL prompt, the class heading, the
 * bio and the two skills. Bios are wrapped once up front, so switching
 * characters never re-lays out text mid-frame.
 */
export class DetailsPanel {
  readonly #text: TextStyles;
  readonly #looks: Looks;
  readonly #layout: SelectLayout;
  readonly #bios: ReadonlyMap<CharacterId, Paragraph>;

  constructor(text: TextStyles, looks: Looks, layout: SelectLayout) {
    this.#text = text;
    this.#looks = looks;
    this.#layout = layout;
    this.#bios = new Map(
      characters.map((character) => [character.id, new Paragraph(character.bio, text.body, { maxWidth: DETAILS.w })]),
    );
  }

  render(gfx: Gfx, options: DetailsRenderOptions): void {
    const { character } = options;
    const text = this.#text;
    const x = DETAILS.x;

    // The cursor takes the next character cell, like a machine waiting for input.
    const cursor = blink(options.time, PROMPT_CURSOR_BLINK, PROMPT_CURSOR_BLINK) ? '_' : '';
    // Lilac, the palette's palest lavender: the prompt sits in the paper's light, where lavender fades into the blue.
    gfx.text(`${PROMPT}${cursor}`, x, PROMPT_Y, { ...text.label, fill: palette.lilac });

    // The heading settles in from the switch direction behind a mask at the column edge,
    // so it never slides across the hand cursor parked beside it.
    gfx.withClip(x - NAME_MASK_BLEED, NAME_Y - 2, gfx.width - x + NAME_MASK_BLEED, NAME_HEIGHT, () => {
      gfx.text(character.className, x + options.nameOffset, NAME_Y, headingStyle(text.prompt, character.id));
    });

    this.#bios.get(character.id)?.render(gfx, x, BIO_Y);

    gfx.text('SKILLS', x, SKILLS_Y, { ...text.label, fill: palette.gold });

    character.skills.forEach((skillId, slot) => {
      this.#renderSkill(gfx, skillId, slot === 0 ? 0 : 1, options.time);
    });
  }

  #renderSkill(gfx: Gfx, skillId: SkillId, slot: 0 | 1, time: number): void {
    const { skillRows, slotSize } = this.#layout;
    const row = skillRows[slot];
    drawIconSlot(gfx, this.#looks.skills[skillId].icon, time, {
      x: row.x,
      y: row.y,
      size: slotSize,
      theme: windowThemes.steel,
    });
    gfx.text(skills[skillId].name, row.x + slotSize + 6, row.y + Math.floor((slotSize - SKILL_NAME_HEIGHT) / 2), {
      ...this.#text.label,
      fill: palette.white,
    });
  }
}

/**
 * The class heading keeps the prompt face's navy outline and shadow but
 * bands its fill from a light tint of the class colour down to the colour
 * itself, so it reads as crisply as the white-to-lavender prompts.
 */
function headingStyle(prompt: TextStyle, id: CharacterId): TextStyle {
  const { accent } = classThemes[id];
  return { ...prompt, fill: [shade(accent, 0.8), accent], bands: 4 };
}
