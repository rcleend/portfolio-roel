import { type Character, type CharacterId, characters, type SkillId, skills } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { Looks } from '../../art/looks/Looks';
import type { TextStyles } from '../../fonts';
import { palette } from '../../palette';
import { drawIconSlot } from '../../ui/iconSlot';
import { Paragraph } from '../../ui/Paragraph';
import { windowThemes } from '../../ui/theme';
import { classThemes } from './classThemes';
import { ATTACK_Y, BIO_Y, CLASS_Y, DETAILS, NAME_Y, type SelectLayout, SKILL_NAME_HEIGHT } from './layout';

/** The heading's outline reaches one pixel left of its pen position. */
const NAME_MASK_BLEED = 1;
/** Cap height plus outline and drop shadow. */
const NAME_HEIGHT = 18;

export interface DetailsRenderOptions {
  readonly character: Character;
  readonly time: number;
  /** Horizontal settle of the name after a switch. */
  readonly nameOffset: number;
  /** Skill slot (0 or 1) to light up, if any. */
  readonly litSkill: 0 | 1 | null;
}

/**
 * The right-hand column: name and tag, class, bio, primary attack and the
 * two skills. Bios are wrapped once up front, so switching characters never
 * re-lays out text mid-frame.
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

    // The heading settles in from the switch direction behind a mask at the column edge,
    // so it never slides across the hand cursor parked beside it.
    gfx.withClip(x - NAME_MASK_BLEED, NAME_Y - 2, gfx.width - x + NAME_MASK_BLEED, NAME_HEIGHT, () => {
      const name = gfx.text(character.name, x + options.nameOffset, NAME_Y, text.prompt);
      gfx.text(character.tag, x + options.nameOffset + name.width + 6, NAME_Y, {
        ...text.prompt,
        fill: ['#cfe6ff', palette.sky, palette.royal],
        bands: 3,
      });
    });

    const accent = classThemes[character.id].accent;
    gfx.fillRect(x, CLASS_Y + 2, 3, 3, accent);
    gfx.text(character.className, x + 6, CLASS_Y, { ...text.label, fill: accent });

    this.#bios.get(character.id)?.render(gfx, x, BIO_Y);

    const attackLabel = gfx.text('ATTACK', x, ATTACK_Y, { ...text.label, fill: palette.gold });
    gfx.text(character.attack.toUpperCase(), x + attackLabel.width + 6, ATTACK_Y, text.label);

    character.skills.forEach((skillId, slot) => {
      this.#renderSkill(gfx, skillId, slot === 0 ? 0 : 1, options);
    });
  }

  #renderSkill(gfx: Gfx, skillId: SkillId, slot: 0 | 1, options: DetailsRenderOptions): void {
    const { skillRows, slotSize } = this.#layout;
    const row = skillRows[slot];
    const lit = options.litSkill === slot;
    drawIconSlot(gfx, this.#looks.skills[skillId].icon, options.time, {
      x: row.x,
      y: row.y,
      size: slotSize,
      theme: lit ? windowThemes.indigo : windowThemes.steel,
    });
    gfx.text(skills[skillId].name, row.x + slotSize + 6, row.y + Math.floor((slotSize - SKILL_NAME_HEIGHT) / 2), {
      ...this.#text.label,
      fill: lit ? palette.gold : palette.white,
    });
  }
}
