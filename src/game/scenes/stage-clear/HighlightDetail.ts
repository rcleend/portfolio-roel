import type { Gfx } from '@/engine/gfx/Gfx';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import type { Rect } from '@/engine/math/Rect';
import { palette } from '../../palette';
import type { GameServices } from '../../services';
import type { ControlDevice } from '../../ui/hud/keyLabels';
import { Paragraph } from '../../ui/Paragraph';
import { drawPrompt } from '../../ui/prompt';
import { WINDOW_BORDER, windowThemes } from '../../ui/theme';
import { drawWindow } from '../../ui/Window';
import { describeMetric, type HighlightRow } from './career';

const WIDTH = 236;
const PADDING = WINDOW_BORDER + 6;
/** Size of the window on each frame of the pop-in: grow, overshoot 1 px, settle. */
const POP_IN = [0.35, 0.75, 1, 1] as const;

interface Content {
  readonly title: string;
  readonly metric: string | null;
  readonly body: Paragraph;
}

/**
 * The full story behind a highlight row, in a cream paper window over the
 * dimmed results: title, metric with its label, and the résumé sentence. This
 * is the portfolio content itself, so it is set in the most legible style
 * (navy on cream) at a comfortable measure.
 */
export class HighlightDetail {
  readonly #services: GameServices;
  readonly #styles: Readonly<Record<'title' | 'metric' | 'body' | 'hint', TextStyle>>;
  #content: Content | null = null;
  #frame = 0;

  constructor(services: GameServices) {
    this.#services = services;
    const { text } = services;
    this.#styles = {
      title: { ...text.label, fill: palette.navy, shadow: undefined },
      metric: { ...text.caption, fill: '#b2361c' },
      body: { ...text.caption, lineSpacing: 2 },
      hint: { ...text.label, fill: '#a8955e', shadow: undefined },
    };
  }

  get open(): boolean {
    return this.#content !== null;
  }

  show(row: HighlightRow, missionLabel: string): void {
    const width = WIDTH - PADDING * 2;
    if (row.unlocked) {
      const { highlight } = row;
      this.#content = {
        title: highlight.title,
        metric: highlight.metric ? describeMetric(highlight.metric) : null,
        body: new Paragraph(highlight.description, this.#styles.body, { maxWidth: width }),
      };
    } else {
      this.#content = {
        title: '???',
        metric: null,
        body: new Paragraph(
          `This highlight is still hidden. Replay ${missionLabel} and break every ? block to unlock it.`,
          this.#styles.body,
          { maxWidth: width },
        ),
      };
    }
    this.#frame = 0;
    this.#services.audio.playSfx('menu-confirm');
  }

  close(): void {
    this.#content = null;
    this.#services.audio.playSfx('menu-back');
  }

  update(): void {
    if (this.#content) this.#frame++;
  }

  render(gfx: Gfx, device: ControlDevice): void {
    const content = this.#content;
    if (!content) return;
    gfx.withAlpha(0.6, () => gfx.fillRect(0, 0, gfx.width, gfx.height, palette.ink));
    const frame = this.#frameRect(gfx, content);
    const step = Math.min(this.#frame, POP_IN.length - 1);
    const scale = POP_IN[step] ?? 1;
    const grow = step === 2 ? 1 : 0;
    const w = Math.round(frame.w * scale) + grow * 2;
    const h = Math.round(frame.h * scale) + grow * 2;
    drawWindow(
      gfx,
      { x: frame.x + Math.round((frame.w - w) / 2), y: frame.y + Math.round((frame.h - h) / 2), w, h },
      windowThemes.cream,
    );
    if (step < POP_IN.length - 1) return;

    const x = frame.x + PADDING;
    let y = frame.y + PADDING;
    gfx.text(content.title, x, y, this.#styles.title);
    y += 12;
    if (content.metric) {
      gfx.text(content.metric, x, y, this.#styles.metric);
      y += 12;
    }
    gfx.fillRect(x, y, frame.w - PADDING * 2, 1, '#e6d7a0');
    y += 5;
    content.body.render(gfx, x, y);
    const prompt = { action: 'confirm', label: 'CLOSE', device } as const;
    drawPrompt(gfx, frame.x + frame.w - PADDING, frame.y + frame.h - PADDING - 7, this.#styles.hint, prompt, 'right');
  }

  #frameRect(gfx: Gfx, content: Content): Rect {
    const h = PADDING * 2 + 12 + (content.metric ? 12 : 0) + 5 + content.body.height + 14;
    return { x: Math.round((gfx.width - WIDTH) / 2), y: Math.round((gfx.height - h) / 2), w: WIDTH, h };
  }
}
