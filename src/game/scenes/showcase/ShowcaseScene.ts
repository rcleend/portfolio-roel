import type { Gfx } from '@/engine/gfx/Gfx';
import { layoutText } from '@/engine/gfx/TextStyle';
import type { BubbleText } from '../../entities/complaints/SpeechBubble';
import type { LevelArt } from '../../levels/art/LevelArt';
import type { GameServices } from '../../services';
import { drawHud } from '../../ui/hud/Hud';
import { createLevelTextStyles, type LevelTextStyles } from '../../ui/hud/styles';
import { HudTracker } from '../level/HudTracker';
import { drawStage } from '../level/render/drawStage';
import { levelRenderKit } from '../level/render/renderKit';
import type { GameScene, GameStep, ShowcaseParams } from '../params';
import { DEMO_SEED } from './demos';
import { resolveShowcase } from './params';
import { ShowcaseRun } from './ShowcaseRun';

/** Bubble text wraps at the level's width, so complaints read the same as in play. */
const BUBBLE_TEXT_WIDTH = 76;

/**
 * Development-only showcase (`?scene=showcase`): one looping, deterministic
 * demo on a real stage, drawn exactly as play draws it — the hero's moves,
 * one skill, or the customer's moods. Pair it with `?looks=` to see any look
 * in the game, e.g.
 *
 *   ?scene=showcase&params={"demo":"skill","skill":"power-chord"}&looks={"skills":{"power-chord":"arcade"}}
 *
 * Silent: it is for looking at, side by side.
 */
export class ShowcaseScene implements GameScene<ShowcaseParams | undefined> {
  readonly #services: GameServices;
  readonly #levelText: LevelTextStyles;
  #run: ShowcaseRun | null = null;
  #art: LevelArt | null = null;
  #hud = new HudTracker();

  constructor(services: GameServices) {
    this.#services = services;
    this.#levelText = createLevelTextStyles(services.text);
  }

  enter(params: ShowcaseParams | undefined): void {
    const { demo, hero, levelId } = resolveShowcase(params);
    const art = this.#services.levelArt.get(levelId);
    this.#art = art;
    this.#run = new ShowcaseRun({
      levelId,
      hero,
      demo,
      props: art.props,
      layoutBubble: (text) => this.#layoutBubble(text),
      seed: DEMO_SEED,
      reducedMotion: this.#services.settings.reducedMotion,
    });
  }

  exit(): void {}

  update(step: GameStep): void {
    const run = this.#run;
    if (!run) return;
    const events = run.advance();
    if (run.step === 0) this.#hud = new HudTracker();
    for (const event of events) if (event.kind === 'customerWon') this.#hud.scored(run.time);
    this.#hud.update(run.world, run.time, step.dt);
  }

  render(gfx: Gfx): void {
    const run = this.#run;
    const art = this.#art;
    if (!run || !art) return;
    const kit = levelRenderKit(this.#services, this.#levelText, run.world, art);
    drawStage(gfx, run.world, kit, run.time);
    drawHud(gfx, kit, this.#hud.hud(run.world, run.time, 'keyboard'));
  }

  #layoutBubble(text: string): BubbleText {
    const block = layoutText(this.#levelText.bubble, text, { maxWidth: BUBBLE_TEXT_WIDTH });
    return { lines: block.lines, width: block.width, height: block.height, lineHeight: block.lineHeight };
  }
}
