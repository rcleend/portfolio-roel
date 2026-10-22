import type { CharacterId } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import type { Rect } from '@/engine/math/Rect';
import { blink } from '@/engine/motion/oscillators';
import { frames } from '@/engine/motion/progress';
import { palette } from '../../palette';
import type { GameServices } from '../../services';
import { windowThemes } from '../../ui/theme';
import { drawWindow, windowContent } from '../../ui/Window';
import type { LevelResult } from '../params';
import { drawSpotlight } from './spotlight';
import { countUp, formatClock, formatMrr } from './tally';
import type { StageClearTimeline } from './timeline';

export interface ResultsData {
  readonly result: LevelResult;
  readonly newRecord: boolean;
  /** Best MRR on this mission across every run, this one included. */
  readonly best: number;
  readonly characterId: CharacterId;
}

/** Tally rows sit this far apart, closing up to `MIN_ROW_HEIGHT` when a look's taller victory pair needs the room. */
const ROW_HEIGHT = 26;
/** A value's arcade digits end just above the next row's label. */
const MIN_ROW_HEIGHT = 22;
/** The BEST line and the NEW RECORD flag under the rows. */
const RECORD_SPACE = 23;

/**
 * Left column of the stage-clear screen: the arcade bonus tally (customers
 * won over, MRR, time) counting up, a NEW RECORD flag, and the hero striking
 * a victory pose next to a customer who leaves happy.
 */
export class ResultsPanel {
  readonly #services: GameServices;
  readonly #styles: { readonly label: TextStyle; readonly value: TextStyle; readonly unit: TextStyle };
  readonly #record: { readonly lit: TextStyle; readonly dim: TextStyle };

  constructor(services: GameServices) {
    this.#services = services;
    const { text } = services;
    this.#styles = {
      label: { ...text.label, fill: palette.lavender },
      value: { ...text.prompt, fill: ['#ffffff', '#fff3a0', '#ffc83d'], bands: 3 },
      unit: { ...text.label, fill: palette.gold },
    };
    this.#record = { lit: { ...text.hud, fill: palette.gold }, dim: { ...text.hud, fill: palette.red } };
  }

  render(gfx: Gfx, frame: Rect, time: number, timeline: StageClearTimeline, data: ResultsData): void {
    drawWindow(gfx, frame, windowThemes.indigo);
    const inner = windowContent(frame);
    const left = inner.x + 2;
    const right = inner.x + inner.w - 2;
    const { result } = data;
    const top = inner.y + 3;

    const rows: readonly { label: string; value: string; visible: boolean; unit?: string }[] = [
      {
        label: 'CUSTOMERS WON',
        value: String(countUp(result.customersWon, time, timeline.customers.start, timeline.customers.duration)),
        visible: time >= timeline.customers.start,
      },
      {
        label: 'MRR',
        // The arcade face has no "$": the sign is set in the label face, the digits stay chunky.
        value: formatMrr(countUp(result.score, time, timeline.mrr.start, timeline.mrr.duration)).slice(1),
        unit: '$',
        visible: time >= timeline.mrr.start,
      },
      { label: 'TIME', value: formatClock(result.timeSeconds), visible: time >= timeline.time },
    ];
    const rowHeight = this.#rowHeight(inner, data.characterId, rows.length);
    rows.forEach((row, index) => {
      const y = top + index * rowHeight;
      gfx.text(row.label, left, y, this.#styles.label);
      if (!row.visible) return;
      const value = gfx.text(row.value, right, y + 9, this.#styles.value, { align: 'right' });
      if (row.unit) gfx.text(row.unit, right - value.width - 7, y + 11, this.#styles.unit);
    });

    if (time >= timeline.record) {
      const y = top + rows.length * rowHeight;
      gfx.fillRect(left, y - 3, inner.w - 4, 1, palette.violet);
      gfx.text('BEST', left, y + 1, this.#styles.label);
      gfx.text(formatMrr(data.best), right, y + 1, this.#styles.unit, { align: 'right' });
      if (data.newRecord) {
        // Flickers between two colours rather than blinking off, so the record never disappears from the tally.
        const lit = blink(time - timeline.record, frames(8), frames(8));
        gfx.text('NEW RECORD!', inner.x + inner.w / 2, y + 14, lit ? this.#record.lit : this.#record.dim, {
          align: 'center',
        });
      }
    }
    this.#renderVictory(gfx, inner, time, data.characterId);
  }

  /** The tally's row spacing: as roomy as classic, unless the victory pair below stands taller. */
  #rowHeight(inner: Rect, characterId: CharacterId, rows: number): number {
    const { looks } = this.#services;
    const pairHeight = Math.max(looks.characters[characterId].sheet.height, looks.customer.sheet.height);
    const room = victoryFloor(inner) - pairHeight - (inner.y + 3) - RECORD_SPACE;
    return Math.max(MIN_ROW_HEIGHT, Math.min(ROW_HEIGHT, Math.floor(room / rows)));
  }

  /** The hero cheers on a little spotlight while a won-over customer, calm and smiling, waves back. */
  #renderVictory(gfx: Gfx, inner: Rect, time: number, characterId: CharacterId): void {
    const { looks } = this.#services;
    const floor = victoryFloor(inner);
    const heroX = inner.x + 30;
    const customerX = inner.x + inner.w - 26;
    drawSpotlight(gfx, heroX, floor);
    drawSpotlight(gfx, customerX, floor);
    gfx.sprite(looks.characters[characterId].sheet, 'victory', time, heroX, floor);
    gfx.sprite(looks.customer.sheet, 'happy', time, customerX, floor, { flipX: true });
  }
}

/** Where the victory pair stands, just above the panel's bottom edge. */
function victoryFloor(inner: Rect): number {
  return inner.y + inner.h - 3;
}
