import { type Character, type CharacterId, characters, type SkillId, skills } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import type { SkillIconAnimation } from '../../art';
import type { TextStyles } from '../../fonts';
import { palette } from '../../palette';
import { Paragraph } from '../../ui/Paragraph';
import { windowThemes } from '../../ui/theme';
import { drawWindow } from '../../ui/Window';
import { classThemes } from './classThemes';
import { ATTACK_Y, BIO_Y, CLASS_Y, DETAILS, NAME_Y, SKILL_ROWS, SKILL_SLOT_SIZE } from './layout';

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

    const name = gfx.text(character.name, x + options.nameOffset, NAME_Y, text.prompt);
    gfx.text(character.tag, x + options.nameOffset + name.width + 6, NAME_Y, {
      ...text.prompt,
      fill: ['#cfe6ff', palette.sky, palette.royal],
      bands: 3,
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
