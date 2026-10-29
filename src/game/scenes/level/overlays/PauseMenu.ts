import { type CharacterId, getCharacter, skills } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import type { InputSnapshot } from '@/engine/input/InputSnapshot';
import { mod } from '@/engine/math/scalar';
import type { Looks } from '../../../art/looks/Looks';
import type { TextStyles } from '../../../fonts';
import type { Action } from '../../../input/bindings';
import { palette } from '../../../palette';
import { Button } from '../../../ui/Button';
import { drawKeyCap } from '../../../ui/hud/KeyCap';
import { type ControlDevice, keyCapFor } from '../../../ui/hud/keyLabels';
import type { LevelTextStyles } from '../../../ui/hud/styles';
import { drawIconSlot, iconSlotSize } from '../../../ui/iconSlot';
import { windowThemes } from '../../../ui/theme';
import { drawWindow } from '../../../ui/Window';
import { dimScreen } from './screen';

export type PauseChoice = 'resume' | 'restart' | 'missionSelect';

const OPTIONS: readonly { readonly choice: PauseChoice; readonly label: string }[] = [
  { choice: 'resume', label: 'RESUME' },
  { choice: 'restart', label: 'RESTART' },
  { choice: 'missionSelect', label: 'MISSION SELECT' },
];

const FRAME = { x: 16, y: 22, w: 288, h: 200 } as const;
const BUTTON = { x: 30, y: 84, w: 108, h: 22, gap: 8 } as const;
const COLUMN = { x: 152, w: 140 } as const;
/** Skill slots are at least this big — classic's 16 px icons with their bevel — and grow with a look's icons. */
const SLOT_SIZE = 22;

export interface PauseMenuKit {
  readonly text: TextStyles;
  readonly levelText: LevelTextStyles;
  readonly looks: Looks;
  readonly cursor: SpriteSheet<'point'>;
  readonly device: ControlDevice;
}

/**
 * The pause menu: Resume / Restart / Mission select, plus a reminder of what
 * the character's attack and two skills do. Works with keys, pad and pointer;
 * pause or back resumes.
 */
export class PauseMenu {
  readonly #kit: PauseMenuKit;
  readonly #characterId: CharacterId;
  readonly #buttons: readonly Button[];
  readonly #onMove: () => void;
  #focus = 0;
  /** Key activation is ignored until confirm has been seen released, so the key that opened the menu cannot pick an option. */
  #armed = false;

  constructor(kit: PauseMenuKit, characterId: CharacterId, onMove: () => void) {
    this.#kit = kit;
    this.#characterId = characterId;
    this.#onMove = onMove;
    this.#buttons = OPTIONS.map(
      (option, index) =>
        new Button({
          label: option.label,
          bounds: { x: BUTTON.x, y: BUTTON.y + index * (BUTTON.h + BUTTON.gap), w: BUTTON.w, h: BUTTON.h },
          theme: windowThemes.steel,
          style: kit.text.label,
          cursor: kit.cursor,
        }),
    );
  }

  update(input: InputSnapshot<Action>, dt: number): PauseChoice | null {
    const move = (input.wasPressed('down') ? 1 : 0) - (input.wasPressed('up') ? 1 : 0);
    if (move !== 0) {
      this.#focus = mod(this.#focus + move, this.#buttons.length);
      this.#onMove();
    }
    let chosen: PauseChoice | null = null;
    this.#buttons.forEach((button, index) => {
      if (button.update(input, index === this.#focus, dt) && this.#armed) chosen = OPTIONS[index]?.choice ?? null;
    });
    if (!input.isDown('confirm')) this.#armed = true;
    if (chosen) return chosen;
    const resumeKey = (input.wasPressed('pause') || input.wasPressed('back')) && !input.wasPressed('confirm');
    return resumeKey ? 'resume' : null;
  }

  render(gfx: Gfx): void {
    const { text, levelText } = this.#kit;
    dimScreen(gfx, 0.625);
    drawWindow(gfx, FRAME, windowThemes.indigo);
    gfx.text('PAUSED', gfx.width / 2, FRAME.y + 10, levelText.bannerCool, { align: 'center' });
    for (const button of this.#buttons) button.render(gfx);
    this.#renderMoves(gfx);
    const resume = this.#kit.device === 'keyboard' ? 'ESC: RESUME' : 'START: RESUME';
    gfx.text(
      resume,
      BUTTON.x + BUTTON.w / 2,
      FRAME.y + FRAME.h - 18,
      { ...text.hud, fill: palette.steel },
      {
        align: 'center',
      },
    );
  }

  /** The character's attack and skills with their keys and rules, from the content. */
  #renderMoves(gfx: Gfx): void {
    const { text, looks, device } = this.#kit;
    const character = getCharacter(this.#characterId);
    const rules = { ...text.body, fill: palette.lilac };
    let y = FRAME.y + 42;
    const keyWidth = drawKeyCap(gfx, COLUMN.x, y, keyCapFor('attack', device), text.label);
    gfx.text(character.attack.toUpperCase(), COLUMN.x + keyWidth + 4, y + 2, text.label);
    y += 17;
    const size = iconSlotSize(
      SLOT_SIZE,
      character.skills.map((skillId) => looks.skills[skillId].icon),
    );
    character.skills.forEach((skillId, index) => {
      const skill = skills[skillId];
      drawIconSlot(gfx, looks.skills[skillId].icon, 0, { x: COLUMN.x, y, size, theme: windowThemes.steel });
      const textX = COLUMN.x + size + 4;
      gfx.text(skill.name, textX, y + 1, text.label);
      const key = keyCapFor(index === 0 ? 'skill1' : 'skill2', device);
      const capWidth = drawKeyCap(gfx, textX, y + 11, key, text.label);
      gfx.text(`${skill.cooldownSeconds}s cooldown`, textX + 4 + capWidth, y + 12, {
        ...rules,
        fill: palette.steel,
      });
      const block = gfx.text(skill.effect, COLUMN.x, y + size + 4, rules, { maxWidth: COLUMN.w });
      y += size + 4 + block.height + 8;
    });
  }
}
