import type { Highlight } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { InputSnapshot } from '@/engine/input/InputSnapshot';
import { easeInCubic, easeOutBack } from '@/engine/motion/easing';
import { blink } from '@/engine/motion/oscillators';
import { segment } from '@/engine/motion/progress';
import type { FxSprites } from '../../../art/fx';
import type { TextStyles } from '../../../fonts';
import type { Action } from '../../../input/bindings';
import { palette } from '../../../palette';
import type { LevelTextStyles } from '../../../ui/hud/styles';
import { TypewriterText } from '../../../ui/TypewriterText';
import { windowThemes } from '../../../ui/theme';
import { drawWindow } from '../../../ui/Window';
import { dimScreen } from './screen';

const FRAME = { x: 24, y: 30, w: 272, h: 182 } as const;
const OPEN_SECONDS = 0.22;
const CLOSE_SECONDS = 0.14;
/** Ignore input this long after opening, so a button mashed mid-jump does not dismiss the card unread. */
const INPUT_GRACE = 0.4;
const TEXT_WIDTH = FRAME.w - 32;

export interface HighlightCardContent {
  readonly highlight: Highlight;
  /** e.g. "LUNA (UTOPIAN LABS)". */
  readonly company: string;
  /** 1-based position of this highlight within the level, and how many there are. */
  readonly number: number;
  readonly total: number;
}

export interface HighlightCardKit {
  readonly text: TextStyles;
  readonly levelText: LevelTextStyles;
  readonly fx: FxSprites;
}

/**
 * The "HIGHLIGHT UNLOCKED" card — the portfolio content of the level. It
 * snaps open, types the description in quickly, shows the headline metric
 * big, and pauses play until any button: the first press finishes the
 * typing, the next closes the card.
 */
export class HighlightCard {
  readonly #content: HighlightCardContent;
  readonly #kit: HighlightCardKit;
  readonly #description: TypewriterText;
  #age = 0;
  #closingAt: number | null = null;

  constructor(content: HighlightCardContent, kit: HighlightCardKit, onType?: (char: string) => void) {
    this.#content = content;
    this.#kit = kit;
    let typed = 0;
    this.#description = new TypewriterText(content.highlight.description, kit.levelText.cardBody, {
      maxWidth: TEXT_WIDTH,
      align: 'center',
      framesPerChar: 1,
      onChar: (char) => {
        if (typed++ % 4 === 0) onType?.(char);
      },
    });
  }

  get closed(): boolean {
    return this.#closingAt !== null && this.#age - this.#closingAt >= CLOSE_SECONDS;
  }

  /** Seconds since the card opened. */
  get age(): number {
    return this.#age;
  }

  /** Same as a button press: finishes the typing, or closes the card once it has been read. */
  dismiss(): void {
    if (this.#closingAt !== null || this.#age < INPUT_GRACE) return;
    if (this.#description.done) this.#closingAt = this.#age;
    else this.#description.skip();
  }

  update(input: InputSnapshot<Action>, dt: number): void {
    this.#age += dt;
    if (this.#age >= OPEN_SECONDS) {
      // Two characters a step: fast enough not to stall the game, slow enough to feel typed.
      this.#description.update();
      this.#description.update();
    }
    if (input.anyPressed) this.dismiss();
  }

  render(gfx: Gfx): void {
    const { text, levelText } = this.#kit;
    dimScreen(gfx, 0.5 * (this.#closingAt === null ? 1 : 1 - this.#closeProgress()));
    const open = segment(this.#age, 0, OPEN_SECONDS, easeOutBack) * (1 - this.#closeProgress());
    const h = Math.max(10, Math.round(FRAME.h * open));
    const y = FRAME.y + Math.round((FRAME.h - h) / 2);
    drawWindow(gfx, { x: FRAME.x, y, w: FRAME.w, h }, windowThemes.indigo);
    if (this.#age < OPEN_SECONDS || this.#closingAt !== null) return;

    const { highlight, company, number, total } = this.#content;
    const cx = FRAME.x + FRAME.w / 2;
    this.#drawRibbon(gfx, cx);
    gfx.sprite(this.#kit.fx.star, 'twinkle', this.#age, FRAME.x + 22, FRAME.y + 28);
    gfx.sprite(this.#kit.fx.star, 'twinkle', this.#age + 0.2, FRAME.x + FRAME.w - 22, FRAME.y + 28);
    gfx.text(highlight.title.toUpperCase(), cx, FRAME.y + 22, text.title, { align: 'center' });
    gfx.text(
      `${company} · ${number}/${total}`,
      cx,
      FRAME.y + 39,
      { ...text.label, fill: palette.lavender },
      {
        align: 'center',
      },
    );
    gfx.fillRect(FRAME.x + 16, FRAME.y + 51, FRAME.w - 32, 1, palette.violet);

    const metric = highlight.metric;
    const paragraphHeight = this.#description.paragraph.height;
    const textY = metric ? FRAME.y + 58 : FRAME.y + 58 + Math.max(0, Math.round((96 - paragraphHeight) / 2));
    this.#description.render(gfx, FRAME.x + 16, textY);

    if (metric && this.#description.done) {
      const figure = metric.from ? `${metric.from}→${metric.to}` : metric.to;
      const boxY = FRAME.y + FRAME.h - 64;
      gfx.fillRect(FRAME.x + 40, boxY, FRAME.w - 80, 38, '#0b0a1f');
      gfx.fillRect(FRAME.x + 41, boxY + 1, FRAME.w - 82, 1, palette.violet);
      gfx.text(figure, cx, boxY + 5, levelText.metric, { align: 'center' });
      gfx.text(metric.label.toUpperCase(), cx, boxY + 26, { ...text.label, fill: palette.cream }, { align: 'center' });
    }
    if (this.#description.done && blink(this.#age, 32 / 60, 16 / 60)) {
      gfx.text('PRESS ANY BUTTON', cx, FRAME.y + FRAME.h - 20, text.prompt, { align: 'center' });
    }
  }

  /** A gold ribbon across the top edge carrying the headline. */
  #drawRibbon(gfx: Gfx, cx: number): void {
    const label = 'HIGHLIGHT UNLOCKED!';
    const style = { ...this.#kit.text.label, fill: '#3a1a04', shadow: undefined };
    const width = gfx.measureText(label, style).width + 20;
    const x = Math.round(cx - width / 2);
    const y = FRAME.y - 6;
    gfx.fillRect(x - 1, y - 1, width + 2, 14, '#1a0804');
    gfx.fillRect(x, y, width, 12, { stops: ['#fff3a0', '#ffc83d', '#f0a820'], bands: 3 });
    gfx.fillRect(x, y + 11, width, 1, '#b86a14');
    gfx.text(label, cx, y + 2, style, { align: 'center' });
  }

  #closeProgress(): number {
    return this.#closingAt === null ? 0 : segment(this.#age - this.#closingAt, 0, CLOSE_SECONDS, easeInCubic);
  }
}
