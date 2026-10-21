import { getExperience, getLevel } from '@/content';
import { fade } from '@/engine/core/transitions';
import type { Gfx } from '@/engine/gfx/Gfx';
import { blink } from '@/engine/motion/oscillators';
import { frames } from '@/engine/motion/progress';
import { palette } from '../../palette';
import type { GameServices } from '../../services';
import { windowThemes } from '../../ui/theme';
import { drawWindow, windowContent } from '../../ui/Window';
import type { GameScene, GameStep, StageClearParams } from '../params';
import { drawStubBanner } from '../StubBanner';

/**
 * STUB — replaced by the gameplay crew's results screen, which lists every
 * collected highlight with its metric. Records completion in the session.
 */
export class StageClearScene implements GameScene<StageClearParams> {
  readonly #services: GameServices;
  #params: StageClearParams | null = null;
  #time = 0;
  #leaving = false;

  constructor(services: GameServices) {
    this.#services = services;
  }

  enter(params: StageClearParams): void {
    this.#params = params;
    const { levelId, result } = params;
    this.#services.audio.playMusic('stage-clear', { loop: false });
    this.#services.session.update((state) => ({
      ...state,
      completed: state.completed.includes(levelId) ? state.completed : [...state.completed, levelId],
      highlights: {
        ...state.highlights,
        [levelId]: [...new Set([...(state.highlights[levelId] ?? []), ...result.highlights])],
      },
      bestScore: { ...state.bestScore, [levelId]: Math.max(state.bestScore[levelId] ?? 0, result.score) },
    }));
  }

  exit(): void {}

  update(step: GameStep): void {
    this.#time += step.dt;
    const params = this.#params;
    if (!params || this.#leaving || this.#time < 0.5) return;
    if (step.input.wasPressed('confirm') || step.input.wasPressed('back')) {
      this.#leaving = true;
      this.#services.director.goTo('levelSelect', { focus: params.levelId }, fade());
    }
  }

  render(gfx: Gfx): void {
    const params = this.#params;
    if (!params) return;
    const { text } = this.#services;
    const level = getLevel(params.levelId);
    gfx.fillRect(0, 0, gfx.width, gfx.height, { stops: [palette.indigo, palette.ink], bands: 5, dither: 'bayer2' });
    gfx.text('STAGE CLEAR!', gfx.width / 2, 20, text.title, { align: 'center' });
    gfx.text(
      `${level.mission} · ${level.city}`,
      gfx.width / 2,
      38,
      { ...text.label, fill: palette.cream },
      { align: 'center' },
    );

    const panel = { x: 32, y: 56, w: 256, h: 150 };
    drawWindow(gfx, panel, windowThemes.indigo);
    const inner = windowContent(panel);
    const { result } = params;
    const rows: [string, string][] = [
      ['SCORE', result.score.toString().padStart(7, '0')],
      ['CUSTOMERS WON', String(result.customersWon)],
      ['TIME', `${Math.floor(result.timeSeconds / 60)}:${String(result.timeSeconds % 60).padStart(2, '0')}`],
    ];
    rows.forEach(([label, value], i) => {
      gfx.text(label, inner.x + 4, inner.y + 4 + i * 12, text.label);
      gfx.text(
        value,
        inner.x + inner.w - 4,
        inner.y + 4 + i * 12,
        { ...text.label, fill: palette.gold },
        { align: 'right' },
      );
    });
    gfx.text('HIGHLIGHTS', inner.x + 4, inner.y + 46, { ...text.label, fill: palette.lavender });
    getExperience(level.experienceId).highlights.forEach((highlight, i) => {
      const collected = result.highlights.includes(highlight.id);
      const line = `${collected ? '★' : '·'} ${highlight.title}${highlight.metric ? ` — ${highlight.metric.to}` : ''}`;
      gfx.text(line, inner.x + 8, inner.y + 58 + i * 11, {
        ...text.body,
        fill: collected ? palette.white : palette.steel,
      });
    });
    if (this.#time > 0.5 && blink(this.#time, frames(32), frames(16))) {
      gfx.text('PRESS CONFIRM', gfx.width / 2, 216, text.prompt, { align: 'center' });
    }
    drawStubBanner(gfx, this.#services, 'STAGE CLEAR');
  }
}
