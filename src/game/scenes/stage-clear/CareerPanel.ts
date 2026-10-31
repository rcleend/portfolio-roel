import type { Experience } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import type { Rect } from '@/engine/math/Rect';
import { easeOutExpo } from '@/engine/motion/easing';
import { frames, segment } from '@/engine/motion/progress';
import { palette } from '../../palette';
import type { GameServices } from '../../services';
import { handCursorSheet } from '../../ui/cursor';
import type { ControlDevice } from '../../ui/hud/keyLabels';
import { Paragraph } from '../../ui/Paragraph';
import { drawPrompt } from '../../ui/prompt';
import { windowThemes } from '../../ui/theme';
import { drawWindow, windowContent } from '../../ui/Window';
import { formatYears } from '../level-select/missions';
import { formatMetric, type HighlightRow } from './career';
import type { StageClearTimeline } from './timeline';

const ROW_HEIGHT = 13;
const ROWS_TOP = 39;
const ROW_INDENT = 13;
const REVEAL_SECONDS = frames(8);
const FLASH_SECONDS = frames(4);

export interface CareerView {
  readonly time: number;
  readonly timeline: StageClearTimeline;
  /** Index of the focused highlight row, or `null` when focus is elsewhere. */
  readonly focusedRow: number | null;
  /** The focused row shows the hand (the keys drive the panel, not the pointer). */
  readonly hand: boolean;
  /** What the prompt names its keys after (the touch pad's buttons on a touch screen). */
  readonly device: ControlDevice;
}

/**
 * Right column of the stage-clear screen — the career payoff. The role,
 * company and dates this stage stands for, every highlight as a row (lit with
 * its metric once collected, a dim "???" until then) and the stack.
 */
export class CareerPanel {
  readonly #experience: Experience;
  readonly #rows: readonly HighlightRow[];
  readonly #frame: Rect;
  readonly #stack: Paragraph;
  readonly #cursor = SpriteSheet.compile(handCursorSheet, 'ui/hand-cursor');
  readonly #styles: Readonly<
    Record<'role' | 'company' | 'heading' | 'count' | 'title' | 'metric' | 'dim' | 'hint', TextStyle>
  >;

  constructor(services: GameServices, experience: Experience, rows: readonly HighlightRow[], frame: Rect) {
    this.#experience = experience;
    this.#rows = rows;
    this.#frame = frame;
    const { text } = services;
    this.#styles = {
      role: { ...text.label, fill: palette.gold },
      company: { ...text.body, fill: palette.white },
      heading: { ...text.label, fill: palette.lavender },
      count: { ...text.label, fill: palette.gold },
      title: { ...text.label, fill: palette.white },
      metric: { ...text.body, fill: palette.gold },
      dim: { ...text.body, fill: palette.steel },
      hint: { ...text.hud, fill: palette.steel },
    };
    const inner = windowContent(frame);
    this.#stack = new Paragraph(
      experience.stack.join(' · '),
      { ...text.body, fill: palette.lavender },
      {
        maxWidth: inner.w - 4,
      },
    );
  }

  /** Hit area of highlight row `index`, for pointer focus and clicks. */
  rowRect(index: number): Rect {
    const inner = windowContent(this.#frame);
    return { x: inner.x, y: inner.y + ROWS_TOP + index * ROW_HEIGHT - 2, w: inner.w, h: ROW_HEIGHT };
  }

  render(gfx: Gfx, offsetX: number, view: CareerView): void {
    const frame = { ...this.#frame, x: this.#frame.x + offsetX };
    drawWindow(gfx, frame, windowThemes.indigo);
    const inner = windowContent(frame);
    const x = inner.x + 2;
    const experience = this.#experience;
    gfx.text(experience.role.toUpperCase(), x, inner.y + 1, this.#styles.role);
    gfx.text(`${experience.company} · ${formatYears(experience)}`, x, inner.y + 12, this.#styles.company);
    divider(gfx, x, inner.y + 24, inner.w - 4);

    const unlocked = this.#rows.filter((row) => row.unlocked).length;
    gfx.text('HIGHLIGHTS', x, inner.y + 27, this.#styles.heading);
    gfx.text(`${unlocked}/${this.#rows.length}`, inner.x + inner.w - 2, inner.y + 27, this.#styles.count, {
      align: 'right',
    });
    this.#rows.forEach((row, index) => {
      this.#renderRow(gfx, row, index, offsetX, view);
    });

    if (view.time < view.timeline.stack) return;
    const stackY = inner.y + ROWS_TOP + Math.max(this.#rows.length, 3) * ROW_HEIGHT + 3;
    divider(gfx, x, stackY, inner.w - 4);
    gfx.text('STACK', x, stackY + 4, this.#styles.heading);
    this.#stack.render(gfx, x, stackY + 15);
    if (view.time >= view.timeline.settled) {
      const prompt =
        view.focusedRow === null
          ? { action: 'up' as const, label: 'READ HIGHLIGHTS' }
          : { action: 'confirm' as const, label: 'READ HIGHLIGHT' };
      drawPrompt(gfx, x, inner.y + inner.h - 9, this.#styles.hint, { ...prompt, device: view.device });
    }
  }

  #renderRow(gfx: Gfx, row: HighlightRow, index: number, offsetX: number, view: CareerView): void {
    const revealAt = view.timeline.row(index);
    if (view.time < revealAt) return;
    const base = this.rowRect(index);
    const slide = Math.round((1 - segment(view.time, revealAt, revealAt + REVEAL_SECONDS, easeOutExpo)) * 16);
    const rect = { ...base, x: base.x + offsetX };
    const x = rect.x + ROW_INDENT + slide;
    const y = rect.y + 2;

    const focused = view.focusedRow === index;
    if (focused) {
      gfx.fillRect(rect.x, rect.y, rect.w, rect.h - 1, palette.violet);
      if (view.hand) gfx.sprite(this.#cursor, 'point', view.time, rect.x + 11, y + 4);
    }
    const flashing = row.fresh && view.time - revealAt < FLASH_SECONDS;
    if (flashing) gfx.fillRect(rect.x, rect.y, rect.w, rect.h - 1, palette.white);

    if (!row.unlocked) {
      const mark = gfx.text('???', x, y, { ...this.#styles.title, fill: palette.steel });
      gfx.text('— replay to unlock', x + mark.width + 5, y, this.#styles.dim);
      return;
    }
    if (!focused) gfx.text('★', rect.x + 3, y, this.#styles.metric);
    gfx.text(row.highlight.title, x, y, this.#styles.title);
    const { metric } = row.highlight;
    if (metric) gfx.text(formatMetric(metric), rect.x + rect.w - 2, y, this.#styles.metric, { align: 'right' });
  }
}

function divider(gfx: Gfx, x: number, y: number, w: number): void {
  gfx.fillRect(x, y, w, 1, palette.ink);
  gfx.fillRect(x, y + 1, w, 1, palette.violet);
}
