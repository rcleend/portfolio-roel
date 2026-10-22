import type { CharacterId, SkillId } from '@/content';
import { getCharacter } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import { blink } from '@/engine/motion/oscillators';
import type { FxSprites } from '../../art/fx';
import type { Looks } from '../../art/looks/Looks';
import type { TextStyles } from '../../fonts';
import { formatEuros } from '../../world/scoring';
import { windowThemes } from '../theme';
import { drawWindow } from '../Window';
import { drawCooldownSweep } from './cooldownSweep';
import { drawKeyCap } from './KeyCap';
import type { KeyCapLabel } from './keyLabels';
import type { LevelTextStyles } from './styles';

export interface HudSkillSlot {
  readonly skillId: SkillId;
  /** 0 just used → 1 ready. */
  readonly charge: number;
  readonly remaining: number;
  /** Seconds since it last became ready, for a "ready" glint; Infinity if it never cooled down. */
  readonly readyFor: number;
  readonly key: KeyCapLabel;
}

export interface HudState {
  readonly characterId: CharacterId;
  readonly hearts: number;
  readonly maxHearts: number;
  readonly slots: readonly HudSkillSlot[];
  readonly score: number;
  readonly highlights: { readonly collected: number; readonly total: number };
  readonly time: number;
  /** Seconds since the last heart was lost, for a flashing heart; Infinity if none. */
  readonly hurtFor: number;
  /** Seconds since the score last rose, for a pulse; Infinity if never. */
  readonly scoredFor: number;
}

export interface HudKit {
  readonly looks: Looks;
  readonly fx: FxSprites;
  readonly text: TextStyles;
  readonly levelText: LevelTextStyles;
}

const TOP = 3;
const PORTRAIT = { x: 4, y: TOP, size: 26 } as const;
const SLOT_SIZE = 22;

/**
 * The Metal Slug-style HUD across the top: portrait, name and hearts on the
 * left, the two skills with cooldown sweeps and key hints next to them, MRR
 * as big orange numerals and highlights collected on the right. No panel
 * behind it — outlined elements over the stage, like the arcade original.
 */
export function drawHud(gfx: Gfx, kit: HudKit, state: HudState): void {
  drawPortrait(gfx, kit, state.characterId);
  drawNameAndHearts(gfx, kit, state);
  for (const [index, slot] of state.slots.entries())
    drawSkillSlot(gfx, kit, slot, 96 + index * (SLOT_SIZE + 5), state.time);
  drawScore(gfx, kit, state);
  drawHighlights(gfx, kit, state);
}

function drawPortrait(gfx: Gfx, kit: HudKit, characterId: CharacterId): void {
  const { x, y, size } = PORTRAIT;
  drawWindow(gfx, { x, y, w: size, h: size }, windowThemes.steel);
  // Frame the head and shoulders of the idle sprite inside the bevel.
  gfx.withClip(x + 3, y + 3, size - 6, size - 6, () => {
    gfx.fillRect(x + 3, y + 3, size - 6, size - 6, { stops: ['#3a3f57', '#181a28'], bands: 3 });
    gfx.sprite(kit.looks.characters[characterId].sheet, 'idle', 0, x + size / 2, y + size + 13);
  });
}

function drawNameAndHearts(gfx: Gfx, kit: HudKit, state: HudState): void {
  const x = PORTRAIT.x + PORTRAIT.size + 4;
  gfx.text(getCharacter(state.characterId).name, x, TOP, kit.levelText.hudLabel);
  const sheet = kit.fx.heart;
  for (let i = 0; i < state.maxHearts; i++) {
    const full = i < state.hearts;
    // The heart just lost blinks a few times before going hollow.
    const losing = i === state.hearts && state.hurtFor < 0.6 && blink(state.hurtFor, 3 / 60, 3 / 60);
    gfx.sprite(sheet, full || losing ? 'full' : 'empty', 0, x - 1 + i * 10, TOP + 11);
  }
}

function drawSkillSlot(gfx: Gfx, kit: HudKit, slot: HudSkillSlot, x: number, time: number): void {
  const y = TOP;
  const glint = slot.readyFor < 0.3 && blink(slot.readyFor, 2 / 60, 2 / 60);
  drawWindow(gfx, { x, y, w: SLOT_SIZE, h: SLOT_SIZE }, glint ? windowThemes.cream : windowThemes.steel);
  const iconX = x + 3;
  const iconY = y + 3;
  gfx.sprite(kit.looks.skills[slot.skillId].icon, 'idle', slot.charge >= 1 ? time : 0, iconX, iconY);
  drawCooldownSweep(gfx, iconX, iconY, 16, slot.charge, '#0b0a1f');
  if (slot.charge < 1) {
    gfx.text(String(Math.ceil(slot.remaining)), x + SLOT_SIZE / 2, y + 7, kit.levelText.score, { align: 'center' });
  }
  drawKeyCap(gfx, x + SLOT_SIZE - 8, y + SLOT_SIZE - 6, slot.key, kit.text.label);
}

function drawScore(gfx: Gfx, kit: HudKit, state: HudState): void {
  const x = 212;
  gfx.text('MRR', x, TOP, { ...kit.text.hud, fill: '#ffc83d' }, { align: 'center' });
  const pulse = state.scoredFor < 0.25 && blink(state.scoredFor, 2 / 60, 2 / 60);
  const style = pulse ? { ...kit.levelText.score, fill: '#ffffff' } : kit.levelText.score;
  gfx.text(formatEuros(state.score), x, TOP + 11, style, { align: 'center' });
}

function drawHighlights(gfx: Gfx, kit: HudKit, state: HudState): void {
  const right = gfx.width - 5;
  const label = `${state.highlights.collected}/${state.highlights.total}`;
  const width = gfx.measureText(label, kit.levelText.score).width;
  gfx.text(label, right, TOP + 11, kit.levelText.score, { align: 'right' });
  drawMiniBlock(gfx, right - width - 13, TOP + 9, state.highlights.collected === state.highlights.total);
  gfx.text('HIGHLIGHTS', right, TOP, { ...kit.text.hud, fill: '#ffc83d' }, { align: 'right' });
}

/** A 10 × 10 "?" block, gold until every highlight is found, then a used block with a star. */
function drawMiniBlock(gfx: Gfx, x: number, y: number, complete: boolean): void {
  gfx.fillRect(x, y, 10, 10, '#2a1408');
  gfx.fillRect(x + 1, y + 1, 8, 8, complete ? '#b86a14' : '#ffc838');
  gfx.fillRect(x + 1, y + 1, 8, 1, complete ? '#dcb68c' : '#fff4b0');
  const ink = complete ? '#fff4b0' : '#6e3410';
  if (complete) {
    gfx.fillRect(x + 4, y + 2, 2, 6, ink);
    gfx.fillRect(x + 2, y + 4, 6, 2, ink);
    return;
  }
  gfx.fillRect(x + 3, y + 2, 4, 1, ink);
  gfx.fillRect(x + 6, y + 3, 1, 2, ink);
  gfx.fillRect(x + 4, y + 5, 2, 1, ink);
  gfx.fillRect(x + 4, y + 7, 2, 1, ink);
}
