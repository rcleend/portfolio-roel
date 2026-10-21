import { getExperience, getLevel, type LevelInfo } from '@/content';
import { fade, iris } from '@/engine/core/transitions';
import type { Gfx } from '@/engine/gfx/Gfx';
import { drawParallax } from '@/engine/gfx/Parallax';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { layoutText } from '@/engine/gfx/TextStyle';
import { fxSprites } from '../../art/fx';
import type { BubbleText } from '../../entities/complaints/SpeechBubble';
import { IDLE_INTENT } from '../../entities/player/Player';
import type { RenderKit } from '../../entities/RenderKit';
import type { LevelArt } from '../../levels/art/LevelArt';
import type { GameServices } from '../../services';
import { handCursorSheet } from '../../ui/cursor';
import { drawBossBar } from '../../ui/hud/BossBar';
import { drawHud } from '../../ui/hud/Hud';
import { createLevelTextStyles, type LevelTextStyles } from '../../ui/hud/styles';
import { Autopilot } from '../../world/autopilot';
import type { WorldEvent } from '../../world/events';
import { World } from '../../world/World';
import type { GameScene, GameStep, LevelParams } from '../params';
import { type LevelDevOptions, readDevOptions } from './devOptions';
import { Finale } from './finale';
import { HudTracker } from './HudTracker';
import { intentFromInput, walkTowards } from './intent';
import { drawEscalationBanner, drawSlamBanner } from './overlays/banners';
import { drawControlHints } from './overlays/controlHints';
import { HighlightCard } from './overlays/HighlightCard';
import { drawMissionIntro, missionYears } from './overlays/missionIntro';
import { type PauseChoice, PauseMenu } from './overlays/PauseMenu';
import { fadeScreen } from './overlays/screen';
import { drawWorld } from './render/drawWorld';
import { drawSparseForeground } from './render/foreground';
import { drawHitboxes } from './render/hitboxes';
import { drawPlayPlane } from './render/playPlane';
import { drawPitSigns, drawRails } from './render/stageDressing';
import { STAGES } from './stages';

/** The level's flow. The world only advances in `play`, `retained` and `finale`. */
type Phase =
  | { readonly kind: 'play' }
  | { readonly kind: 'card'; readonly card: HighlightCard }
  | { readonly kind: 'paused'; readonly menu: PauseMenu }
  | { readonly kind: 'down'; readonly since: number; readonly heal: boolean }
  | { readonly kind: 'retained'; readonly since: number }
  | { readonly kind: 'finale'; readonly finale: Finale }
  | { readonly kind: 'leaving' };

/** Seconds to fade out (and back in) around a respawn. */
const DOWN_FADE = 0.3;
const DOWN_HOLD = 0.35;
/** "CUSTOMER RETAINED!" holds this long before the walk to the goal. */
const RETAINED_SECONDS = 1.9;
const BUBBLE_TEXT_WIDTH = 76;
/** How long the autopilot "reads" a highlight card before dismissing it. */
const AUTOPILOT_READING = 3;
/** Intro and hints are skipped by pretending the scene has been running this long. */
const SKIPPED_INTRO = 30;

/**
 * A playable mission: a short side-scroller through the employer's city,
 * ending with an escalated customer and a goal moment, then the stage-clear
 * screen. The scene owns flow, sound and overlays; `World` owns the game.
 */
export class LevelScene implements GameScene<LevelParams> {
  readonly #services: GameServices;
  readonly #levelText: LevelTextStyles;
  readonly #cursor: SpriteSheet<'point'>;
  #params: LevelParams | null = null;
  #level: LevelInfo | null = null;
  #art: LevelArt | null = null;
  #world: World | null = null;
  #dev: LevelDevOptions = { hitboxes: false, startAt: null, skipIntro: false, autopilot: false };
  #autopilot: Autopilot | null = null;
  #phase: Phase = { kind: 'play' };
  #time = 0;
  #device: 'keyboard' | 'gamepad' = 'keyboard';
  #arenaAt: number | null = null;
  readonly #hud = new HudTracker();

  constructor(services: GameServices) {
    this.#services = services;
    this.#levelText = createLevelTextStyles(services.text);
    this.#cursor = SpriteSheet.compile(handCursorSheet, 'ui/hand-cursor');
  }

  enter(params: LevelParams): void {
    const services = this.#services;
    const level = getLevel(params.levelId);
    const stage = STAGES[params.levelId];
    const art = services.levelArt.get(params.levelId);
    this.#params = params;
    this.#level = level;
    this.#art = art;
    this.#dev = readDevOptions(params);
    const world = new World({
      stage,
      props: art.props,
      characterId: params.characterId,
      highlightIds: getExperience(level.experienceId).highlights.map((highlight) => highlight.id),
      complaints: level.complaints,
      layoutBubble: (text) => this.#layoutBubble(text),
      rng: services.rng.fork(),
      reducedMotion: services.settings.reducedMotion,
      screen: { width: 320, height: 240 },
    });
    if (this.#dev.startAt !== null) world.skipTo(this.#dev.startAt);
    if (this.#dev.skipIntro) this.#time = SKIPPED_INTRO;
    if (this.#dev.autopilot) this.#autopilot = new Autopilot();
    this.#world = world;
    services.audio.playMusic(stage.theme.music);
  }

  exit(): void {
    this.#services.audio.stopMusic({ fadeOutMs: 200 });
  }

  update(step: GameStep): void {
    const world = this.#world;
    if (!world) return;
    const { dt, input } = step;
    this.#time += dt;
    if (input.lastDevice === 'gamepad') this.#device = 'gamepad';
    else if (input.lastDevice === 'keyboard') this.#device = 'keyboard';

    const phase = this.#phase;
    switch (phase.kind) {
      case 'play':
        if (input.wasPressed('pause')) {
          this.#pause();
          return;
        }
        world.step(this.#autopilot?.intent(world) ?? intentFromInput(input), dt);
        this.#handle(world.drainEvents());
        break;
      case 'card':
        phase.card.update(input, dt);
        if (this.#autopilot && phase.card.age > AUTOPILOT_READING) phase.card.dismiss();
        if (phase.card.closed) this.#phase = { kind: 'play' };
        break;
      case 'paused': {
        const choice = phase.menu.update(input, dt);
        if (choice) this.#choose(choice);
        break;
      }
      case 'down': {
        const elapsed = this.#time - phase.since;
        if (elapsed >= DOWN_FADE && elapsed - dt < DOWN_FADE) world.respawn(phase.heal);
        if (elapsed >= DOWN_FADE * 2 + DOWN_HOLD) this.#phase = { kind: 'play' };
        break;
      }
      case 'retained':
        world.step(IDLE_INTENT, dt);
        this.#handle(world.drainEvents());
        if (this.#time - phase.since >= RETAINED_SECONDS) this.#phase = { kind: 'finale', finale: new Finale(world) };
        break;
      case 'finale':
        this.#updateFinale(phase.finale, dt);
        break;
      case 'leaving':
        world.step(IDLE_INTENT, dt);
        world.drainEvents();
        break;
    }
    this.#hud.update(world, this.#time, dt);
  }

  render(gfx: Gfx): void {
    const world = this.#world;
    const art = this.#art;
    const level = this.#level;
    if (!world || !art || !level) return;
    const kit = this.#kit(world, art);
    const view = world.camera.view;
    const { stage } = world;

    drawParallax(gfx, art.background, view.x, 0, this.#time);
    gfx.withOffset(-view.x, -view.y, () => {
      drawPlayPlane(gfx, stage.layout, art.tileset, view.x);
      drawPitSigns(gfx, stage.layout, stage.theme.pit, this.#services.text.label, view.x);
      for (const mover of world.movers) drawRails(gfx, mover, stage.layout, stage.theme.mover);
      drawWorld(gfx, world, kit);
      if (this.#dev.hitboxes) drawHitboxes(gfx, world);
    });
    drawSparseForeground(gfx, art.foreground, view.x, stage.theme.foreground, world.arenaX);
    const flash = world.flashColor;
    if (flash) gfx.fillRect(0, 0, gfx.width, gfx.height, flash);

    drawHud(gfx, kit, this.#hud.hud(world, this.#time, this.#device));
    const bossBar = this.#hud.bossBar(world, this.#time);
    const celebrating = this.#phase.kind === 'finale' || this.#phase.kind === 'leaving';
    if (bossBar && !celebrating) drawBossBar(gfx, this.#services.text, bossBar);
    this.#renderOverlays(gfx, world, level);
  }

  // ── Flow ─────────────────────────────────────────────────────────────────

  #handle(events: readonly WorldEvent[]): void {
    const { audio } = this.#services;
    for (const event of events) {
      switch (event.kind) {
        case 'sfx':
          audio.playSfx(event.id);
          break;
        case 'highlight':
          this.#openCard(event.highlightId);
          break;
        case 'customerWon':
          this.#hud.scored(this.#time);
          break;
        case 'playerDown':
          this.#phase = { kind: 'down', since: this.#time, heal: event.reason === 'hearts' };
          break;
        case 'arenaEntered':
          this.#arenaAt = this.#time;
          audio.playMusic('boss');
          break;
        case 'bossLanded':
          this.#hud.bossArrived(this.#time);
          break;
        case 'bossRetained':
          this.#phase = { kind: 'retained', since: this.#time };
          audio.stopMusic({ fadeOutMs: 400 });
          audio.playSfx('flash');
          break;
        case 'checkpoint':
        case 'skillCast':
          break;
      }
    }
  }

  #openCard(highlightId: string): void {
    const level = this.#level;
    if (!level) return;
    const experience = getExperience(level.experienceId);
    const index = experience.highlights.findIndex((highlight) => highlight.id === highlightId);
    const highlight = experience.highlights[index];
    if (!highlight) return;
    const { audio, text } = this.#services;
    audio.playSfx('achievement');
    const card = new HighlightCard(
      { highlight, company: experience.company.toUpperCase(), number: index + 1, total: experience.highlights.length },
      { text, levelText: this.#levelText, fx: fxSprites() },
      () => audio.playSfx('typewriter'),
    );
    this.#phase = { kind: 'card', card };
  }

  #pause(): void {
    const params = this.#params;
    if (!params) return;
    const { audio, text, sprites } = this.#services;
    audio.playSfx('pause');
    const menu = new PauseMenu(
      { text, levelText: this.#levelText, sprites, cursor: this.#cursor, device: this.#device },
      params.characterId,
      () => audio.playSfx('menu-move'),
    );
    this.#phase = { kind: 'paused', menu };
  }

  #choose(choice: PauseChoice): void {
    const params = this.#params;
    if (!params) return;
    const { audio, director } = this.#services;
    if (choice === 'resume') {
      audio.playSfx('menu-back');
      this.#phase = { kind: 'play' };
      return;
    }
    audio.playSfx('menu-confirm');
    this.#phase = { kind: 'leaving' };
    if (choice === 'restart')
      director.goTo('level', { levelId: params.levelId, characterId: params.characterId }, fade());
    else director.goTo('levelSelect', { focus: params.levelId }, fade());
  }

  #updateFinale(finale: Finale, dt: number): void {
    const world = this.#world;
    const params = this.#params;
    if (!world || !params) return;
    const arrived = finale.arrived || Math.abs(world.goalX - world.player.centerX) < 3;
    if (arrived && !finale.arrived) {
      finale.arrive(this.#time);
      this.#services.audio.playSfx('stage-clear');
    }
    world.step(arrived ? IDLE_INTENT : walkTowards(world.player.centerX, world.goalX), dt);
    this.#handle(world.drainEvents());
    if (!finale.update(this.#time)) return;
    this.#phase = { kind: 'leaving' };
    const view = world.camera.view;
    this.#services.director.goTo(
      'stageClear',
      { levelId: params.levelId, characterId: params.characterId, result: world.result() },
      iris({
        x: Math.round(world.player.centerX - view.x),
        y: Math.round(world.player.feet - 18 - view.y),
        duration: 1,
      }),
    );
  }

  // ── HUD and overlays ─────────────────────────────────────────────────────

  #renderOverlays(gfx: Gfx, world: World, level: LevelInfo): void {
    const { text } = this.#services;
    const experience = getExperience(level.experienceId);
    drawMissionIntro(gfx, this.#levelText, text, level, missionYears(experience.start, experience.end), this.#time);
    // Hints would only add noise under a dimmed card or menu.
    const modal = this.#phase.kind === 'card' || this.#phase.kind === 'paused';
    if (!modal) drawControlHints(gfx, text, this.#device, this.#time);
    if (this.#arenaAt !== null) {
      drawEscalationBanner(gfx, this.#levelText, text, world.stage.theme.bossPlan, this.#time - this.#arenaAt);
    }

    const phase = this.#phase;
    switch (phase.kind) {
      case 'card':
        phase.card.render(gfx);
        break;
      case 'paused':
        phase.menu.render(gfx);
        break;
      case 'down':
        this.#renderDown(gfx, phase.since, phase.heal);
        break;
      case 'retained':
        drawSlamBanner(gfx, ['CUSTOMER', 'RETAINED!'], this.#levelText.banner, this.#time - phase.since);
        break;
      case 'finale':
        phase.finale.render(gfx, this.#levelText, this.#time);
        break;
      case 'play':
      case 'leaving':
        break;
    }
  }

  #renderDown(gfx: Gfx, since: number, heal: boolean): void {
    const elapsed = this.#time - since;
    const coverage =
      elapsed < DOWN_FADE
        ? elapsed / DOWN_FADE
        : elapsed < DOWN_FADE + DOWN_HOLD
          ? 1
          : 1 - (elapsed - DOWN_FADE - DOWN_HOLD) / DOWN_FADE;
    fadeScreen(gfx, coverage);
    if (heal && elapsed >= DOWN_FADE && elapsed < DOWN_FADE + DOWN_HOLD) {
      gfx.text('TRY AGAIN!', gfx.width / 2, 100, this.#levelText.bannerCool, { align: 'center' });
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  #kit(world: World, art: LevelArt): RenderKit {
    const { sprites, text, fonts, settings } = this.#services;
    return {
      time: world.time,
      sprites,
      fx: fxSprites(),
      text,
      fonts,
      levelText: this.#levelText,
      art,
      reducedMotion: settings.reducedMotion,
    };
  }

  #layoutBubble(text: string): BubbleText {
    const block = layoutText(this.#levelText.bubble, text, { maxWidth: BUBBLE_TEXT_WIDTH });
    return { lines: block.lines, width: block.width, height: block.height, lineHeight: block.lineHeight };
  }
}
