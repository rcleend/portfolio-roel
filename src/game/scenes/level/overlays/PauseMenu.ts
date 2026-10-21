import { type CharacterId, getCharacter, skills } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import type { InputSnapshot } from '@/engine/input/InputSnapshot';
import { mod } from '@/engine/math/scalar';
import type { Sprites } from '../../../art';
import type { TextStyles } from '../../../fonts';
import type { Action } from '../../../input/bindings';
import { palette } from '../../../palette';
import { Button } from '../../../ui/Button';
import { drawKeyCap } from '../../../ui/hud/KeyCap';
import { keyCapFor } from '../../../ui/hud/keyLabels';
import type { LevelTextStyles } from '../../../ui/hud/styles';
import { windowThemes } from '../../../ui/theme';
import { drawWindow } from '../../../ui/Window';
import { dimScreen } from './screen';

export type PauseChoice = 'resume' | 'restart' | 'missionSelect';

const OPTIONS: readonly { readonly choice: PauseChoice; readonly label: string }[] = [
  { choice: 'resume', label: 'RESUME' },
  { choice: 'restart', label: 'RESTART' },
  { choice: 'missionSelect', label: 'MISSION SELECT' },
];

const FRAME = { x: 20, y: 36, w: 280, h: 178 } as const;
const BUTTON = { x: 34, y: 92, w: 104, h: 22, gap: 8 } as const;
const COLUMN = { x: 152, w: 134 } as const;

export interface PauseMenuKit {
  readonly text: TextStyles;
  readonly levelText: LevelTextStyles;
  readonly sprites: Sprites;
  readonly cursor: SpriteSheet<'point'>;
  readonly device: 'keyboard' | 'gamepad';
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
          theme: index === 0 ? windowThemes.indigo : windowThemes.steel,
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
    gfx.text('PAUSED', gfx.width / 2, FRAME.y + 12, levelText.bannerCool, { align: 'center' });
    for (const button of this.#buttons) button.render(gfx);
    this.#renderMoves(gfx);
    gfx.text(
      'ESC / START: RESUME',
      BUTTON.x + BUTTON.w / 2,
      FRAME.y + FRAME.h - 16,
      { ...text.hud, fill: palette.steel },
      {
        align: 'center',
      },
    );
  }

  /** The character's attack and skills with their keys and rules, from the content. */
  #renderMoves(gfx: Gfx): void {
    const { text, sprites, device } = this.#kit;
    const character = getCharacter(this.#characterId);
    let y = FRAME.y + 46;
    gfx.text('ATTACK', COLUMN.x, y, { ...text.label, fill: palette.lavender });
    drawKeyCap(gfx, COLUMN.x + COLUMN.w - 11, y - 2, keyCapFor('attack', device), text.label);
    y += 12;
    gfx.text(character.attack, COLUMN.x, y, { ...text.body, fill: palette.white });
    y += 16;
    character.skills.forEach((skillId, index) => {
      const skill = skills[skillId];
      drawWindow(gfx, { x: COLUMN.x, y, w: 22, h: 22 }, windowThemes.steel);
      gfx.sprite(sprites.skillIcons[skillId], 'idle', 0, COLUMN.x + 3, y + 3);
      gfx.text(skill.name, COLUMN.x + 26, y + 1, text.label);
      drawKeyCap(gfx, COLUMN.x + 26, y + 11, keyCapFor(index === 0 ? 'skill1' : 'skill2', device), text.label);
      gfx.text(`${skill.cooldownSeconds}s`, COLUMN.x + 40, y + 13, { ...text.hud, fill: palette.steel });
      const block = gfx.text(
        skill.effect,
        COLUMN.x,
        y + 25,
        { ...text.body, fill: palette.lilac },
        { maxWidth: COLUMN.w },
      );
      y += 25 + block.height + 7;
    });
  }
}
