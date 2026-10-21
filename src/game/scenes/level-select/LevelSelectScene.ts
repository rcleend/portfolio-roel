import { getExperience, type LevelInfo, levels } from '@/content';
import { fade, pixelDissolve } from '@/engine/core/transitions';
import type { Gfx } from '@/engine/gfx/Gfx';
import { mod } from '@/engine/math/scalar';
import { blink } from '@/engine/motion/oscillators';
import { frames } from '@/engine/motion/progress';
import { palette } from '../../palette';
import type { GameServices } from '../../services';
import { Paragraph } from '../../ui/Paragraph';
import { windowThemes } from '../../ui/theme';
import { drawWindow, windowContent } from '../../ui/Window';
import type { GameScene, GameStep, LevelSelectParams } from '../params';
import { drawStubBanner } from '../StubBanner';

/**
 * STUB — replaced by the mission-select crew (postcards with live parallax,
 * route line, locked "YOUR TEAM?" slot; docs/ART-DIRECTION.md › Mission select).
 */
export class LevelSelectScene implements GameScene<LevelSelectParams> {
  readonly #services: GameServices;
  #index = 0;
  #time = 0;
  #briefing: Paragraph | null = null;
  #leaving = false;

  constructor(services: GameServices) {
    this.#services = services;
  }

  enter(params: LevelSelectParams): void {
    this.#index = Math.max(
      0,
      levels.findIndex((level) => level.id === params.focus),
    );
    this.#layout();
    this.#services.audio.playMusic('mission-select');
  }

  exit(): void {}

  update(step: GameStep): void {
    this.#time += step.dt;
    if (this.#leaving) return;
    const { input } = step;
    const delta =
      (input.wasPressed('right') || input.wasPressed('down') ? 1 : 0) -
      (input.wasPressed('left') || input.wasPressed('up') ? 1 : 0);
    if (delta !== 0) {
      this.#index = mod(this.#index + delta, levels.length);
      this.#layout();
      this.#services.audio.playSfx('menu-move');
    }
    if (input.wasPressed('confirm')) {
      this.#leaving = true;
      this.#services.audio.playSfx('menu-confirm');
      const characterId = this.#services.session.state.characterId ?? 'hackerman';
      this.#services.director.goTo('level', { levelId: this.#level.id, characterId }, pixelDissolve());
    } else if (input.wasPressed('back')) {
      this.#leaving = true;
      this.#services.audio.playSfx('menu-back');
      this.#services.director.goTo('characterSelect', undefined, fade());
    }
  }

  render(gfx: Gfx): void {
    const { text } = this.#services;
    gfx.fillRect(0, 0, gfx.width, gfx.height, { stops: ['#10204a', palette.ink], bands: 5, dither: 'bayer2' });
    gfx.text('SELECT MISSION', gfx.width / 2, 14, text.prompt, { align: 'center' });

    levels.forEach((level, i) => {
      const frame = { x: 16 + i * 148, y: 38, w: 140, h: 56 };
      const selected = i === this.#index;
      drawWindow(gfx, frame, selected ? windowThemes.indigo : windowThemes.steel);
      const inner = windowContent(frame);
      gfx.text(level.mission, inner.x + 2, inner.y + 2, {
        ...text.label,
        fill: selected ? palette.gold : palette.steel,
      });
      gfx.text(getExperience(level.experienceId).company.toUpperCase(), inner.x + 2, inner.y + 14, text.label);
      gfx.text(`${level.city}`, inner.x + 2, inner.y + 26, { ...text.body, fill: palette.lavender });
      if (selected && blink(this.#time, frames(24), frames(8)))
        gfx.rect(frame.x - 2, frame.y - 2, frame.w + 4, frame.h + 4, palette.gold);
    });

    const panel = { x: 16, y: 102, w: 288, h: 124 };
    drawWindow(gfx, panel, windowThemes.steel, { title: 'BRIEFING', titleStyle: text.label });
    const inner = windowContent(panel);
    const experience = getExperience(this.#level.experienceId);
    gfx.text(experience.role, inner.x + 2, inner.y + 6, { ...text.body, fill: palette.white });
    this.#briefing?.render(gfx, inner.x + 2, inner.y + 20);
    gfx.text(`HAZARDS: ${this.#level.hazards.join(' · ').toUpperCase()}`, inner.x + 2, inner.y + 82, {
      ...text.label,
      fill: palette.orange,
    });
    gfx.text('THREAT: UNHAPPY CUSTOMERS', inner.x + 2, inner.y + 94, { ...text.label, fill: palette.red });
    drawStubBanner(gfx, this.#services, 'MISSION SELECT');
  }

  get #level(): LevelInfo {
    return levels[this.#index] as LevelInfo;
  }

  #layout(): void {
    this.#briefing = new Paragraph(this.#level.briefing, this.#services.text.body, { maxWidth: 270 });
  }
}
