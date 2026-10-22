import { type Character, type CharacterId, characters, type SkillId, skills } from '@/content';
import { shade } from '@/engine/gfx/color';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import { blink } from '@/engine/motion/oscillators';
import { frames } from '@/engine/motion/progress';
import type { SkillIconAnimation } from '../../art';
import type { TextStyles } from '../../fonts';
import { palette } from '../../palette';
import { Paragraph } from '../../ui/Paragraph';
import { windowThemes } from '../../ui/theme';
import { drawWindow } from '../../ui/Window';
import { classThemes } from './classThemes';
import { BIO_Y, DETAILS, NAME_Y, PROMPT_Y, SKILL_ROWS, SKILL_SLOT_SIZE, SKILLS_Y } from './layout';

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
  /** Skill slot (0 or 1) to light up, if any. */
  readonly litSkill: 0 | 1 | null;
}

/**
 * The right-hand column: the PICK YOUR ROEL prompt, the class heading, the
 * bio and the two skills. Bios are wrapped once up front, so switching
 * characters never re-lays out text mid-frame.
 */
export class DetailsPanel {
  readonly #text: TextStyles;
  readonly #icons: Readonly<Record<SkillId, SpriteSheet<SkillIconAnimation>>>;
  readonly #bios: ReadonlyMap<CharacterId, Paragraph>;

  constructor(text: TextStyles, icons: Readonly<Record<SkillId, SpriteSheet<SkillIconAnimation>>>) {
    this.#text = text;
    this.#icons = icons;
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
    gfx.text(`${PROMPT}${cursor}`, x, PROMPT_Y, { ...text.label, fill: palette.lavender });

    // The heading settles in from the switch direction behind a mask at the column edge,
    // so it never slides across the hand cursor parked beside it.
    gfx.withClip(x - NAME_MASK_BLEED, NAME_Y - 2, gfx.width - x + NAME_MASK_BLEED, NAME_HEIGHT, () => {
      gfx.text(character.className, x + options.nameOffset, NAME_Y, headingStyle(text.prompt, character.id));
    });

    this.#bios.get(character.id)?.render(gfx, x, BIO_Y);

    gfx.text('SKILLS', x, SKILLS_Y, { ...text.label, fill: palette.gold });

    character.skills.forEach((skillId, slot) => {
      this.#renderSkill(gfx, skillId, slot === 0 ? 0 : 1, options);
    });
  }

  #renderSkill(gfx: Gfx, skillId: SkillId, slot: 0 | 1, options: DetailsRenderOptions): void {
    const row = SKILL_ROWS[slot];
    const lit = options.litSkill === slot;
    const frame = { x: row.x, y: row.y, w: SKILL_SLOT_SIZE, h: SKILL_SLOT_SIZE };
    drawWindow(gfx, frame, lit ? windowThemes.indigo : windowThemes.steel);
    gfx.sprite(this.#icons[skillId], 'idle', options.time, frame.x + 4, frame.y + 4);
    gfx.text(skills[skillId].name, row.x + SKILL_SLOT_SIZE + 6, row.y + 8, {
      ...this.#text.label,
      fill: lit ? palette.gold : palette.white,
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
