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

const ROW_HEIGHT = 26;

/**
 * Left column of the stage-clear screen: the arcade bonus tally (customers
 * won over, MRR, time) counting up, a NEW RECORD flag, and the hero striking
 * a victory pose next to a customer who leaves happy.
 */
export class ResultsPanel {
  readonly #services: GameServices;
  readonly #styles: { readonly label: TextStyle; readonly value: TextStyle; readonly unit: TextStyle };

  constructor(services: GameServices) {
    this.#services = services;
    const { text } = services;
    this.#styles = {
      label: { ...text.label, fill: palette.lavender },
      value: { ...text.prompt, fill: ['#ffffff', '#fff3a0', '#ffc83d'], bands: 3 },
      unit: { ...text.label, fill: palette.gold },
    };
  }

  render(gfx: Gfx, frame: Rect, time: number, timeline: StageClearTimeline, data: ResultsData): void {
    drawWindow(gfx, frame, windowThemes.indigo);
    const inner = windowContent(frame);
    const left = inner.x + 2;
    const right = inner.x + inner.w - 2;
    const { result } = data;

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
    rows.forEach((row, index) => {
      const y = inner.y + 3 + index * ROW_HEIGHT;
      gfx.text(row.label, left, y, this.#styles.label);
      if (!row.visible) return;
      const value = gfx.text(row.value, right, y + 9, this.#styles.value, { align: 'right' });
      if (row.unit) gfx.text(row.unit, right - value.width - 7, y + 11, this.#styles.unit);
    });

    if (time >= timeline.record) {
      const y = inner.y + 3 + rows.length * ROW_HEIGHT;
      gfx.fillRect(left, y - 3, inner.w - 4, 1, palette.violet);
      gfx.text('BEST', left, y + 1, this.#styles.label);
      gfx.text(formatMrr(data.best), right, y + 1, this.#styles.unit, { align: 'right' });
      if (data.newRecord && blink(time - timeline.record, frames(20), frames(10))) {
        gfx.text('NEW RECORD!', inner.x + inner.w / 2, y + 14, this.#recordStyle(), { align: 'center' });
      }
    }
    this.#renderVictory(gfx, inner, time, data.characterId);
  }

  #recordStyle(): TextStyle {
    return { ...this.#services.text.hud, fill: palette.red, outline: palette.white };
  }

  /** The hero cheers on a little spotlight while a won-over customer, calm and smiling, waves back. */
  #renderVictory(gfx: Gfx, inner: Rect, time: number, characterId: CharacterId): void {
    const { sprites } = this.#services;
    const floor = inner.y + inner.h - 3;
    const heroX = inner.x + 30;
    const customerX = inner.x + inner.w - 26;
    drawSpotlight(gfx, heroX, floor);
    drawSpotlight(gfx, customerX, floor);
    gfx.sprite(sprites.characters[characterId], 'victory', time, heroX, floor);
    gfx.sprite(sprites.unhappyCustomer, 'happy', time, customerX, floor, { flipX: true });
  }
}
