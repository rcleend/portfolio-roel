import { getExperience, getLevel, type LevelInfo, nextLevelTeaser } from '@/content';
import { fade, iris } from '@/engine/core/transitions';
import type { Gfx } from '@/engine/gfx/Gfx';
import { drawParallax } from '@/engine/gfx/Parallax';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { containsPoint, type Rect } from '@/engine/math/Rect';
import { easeInCubic, easeOutBack, easeOutExpo } from '@/engine/motion/easing';
import { shake } from '@/engine/motion/oscillators';
import { segment } from '@/engine/motion/progress';
import { palette } from '../../palette';
import type { GameServices } from '../../services';
import { Button } from '../../ui/Button';
import { handCursorSheet } from '../../ui/cursor';
import { type ControlDevice, controlDevice } from '../../ui/hud/keyLabels';
import { windowThemes } from '../../ui/theme';
import { firstOpenLevel, nextLevel } from '../level-select/missions';
import type { GameScene, GameStep, StageClearParams } from '../params';
import { CareerPanel } from './CareerPanel';
import { type HighlightRow, highlightRows } from './career';
import { Finale } from './Finale';
import { type ClearFocus, type Direction, initialClearFocus, moveFocus } from './focus';
import { HighlightDetail } from './HighlightDetail';
import { CLEAR_ACTION_LABELS, type ClearAction, clearActions } from './outcome';
import { normalizeStageClearParams } from './params';
import { ResultsPanel } from './ResultsPanel';
import { isNewBest, recordLevelResult } from './recordResult';
import { SlamTitle } from './SlamTitle';
import {
  type Cue,
  cuesBetween,
  LETTER_FALL,
  type StageClearTimeline,
  stageClearCues,
  stageClearTimeline,
} from './timeline';

const RESULTS_FRAME: Rect = { x: 6, y: 34, w: 114, h: 170 };
const CAREER_FRAME: Rect = { x: 124, y: 34, w: 190, h: 170 };
const BUTTON = { y: 211, h: 20, w: 112, gap: 6 } as const;
/** Panels slide in from the sides as the big title clears the stage. */
const PANEL_IN_SECONDS = 0.35;
/** The first moments ignore input, so the button that finished the level cannot skip the slam unseen. */
const SKIP_AFTER = 0.3;
const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

interface Option {
  readonly action: ClearAction;
  readonly button: Button;
}

/**
 * Stage clear: a Metal Slug-style "MISSION COMPLETE!" slam, the bonus tally
 * (customers won over, MRR, time), then the career payoff — the role behind
 * the stage and every highlight with its metric, each readable in full.
 * This scene is the single writer of level results into the session.
 */
export class StageClearScene implements GameScene<StageClearParams> {
  readonly #services: GameServices;
  readonly #cursor = SpriteSheet.compile(handCursorSheet, 'ui/hand-cursor');
  readonly #detail: HighlightDetail;
  readonly #title: SlamTitle;
  readonly #results: ResultsPanel;
  #params: StageClearParams | null = null;
  #level: LevelInfo | null = null;
  #career: CareerPanel | null = null;
  #rows: readonly HighlightRow[] = [];
  #timeline: StageClearTimeline = stageClearTimeline(0, 0);
  #cues: readonly Cue[] = [];
  #options: readonly Option[] = [];
  /** The visitor plays with the pointer: no hand on the focused row (CareerPanel). */
  #pointing = false;
  #device: ControlDevice;
  #focus: ClearFocus = { area: 'buttons', index: 0 };
  #finale: Finale | null = null;
  #newRecord = false;
  #time = 0;
  #confirmLatched = false;
  #rowPress: number | null = null;
  #lastPointer: { x: number; y: number } | null = null;
  #leaving = false;

  constructor(services: GameServices) {
    this.#services = services;
    this.#device = controlDevice(null, null, services.settings.touchControls);
    this.#detail = new HighlightDetail(services);
    this.#title = new SlamTitle(['MISSION', 'COMPLETE!'], services.text.title, 2);
    this.#results = new ResultsPanel(services);
  }

  enter(raw: StageClearParams): void {
    const params = normalizeStageClearParams(raw);
    this.#params = params;
    const { session, audio } = this.#services;
    const level = getLevel(params.levelId);
    this.#level = level;
    this.#newRecord = isNewBest(session.state, level.id, params.result.score);
    const state = session.update((current) => recordLevelResult(current, level.id, params.result));

    const experience = getExperience(level.experienceId);
    this.#rows = highlightRows(experience, state.highlights[level.id] ?? [], params.result.highlights);
    this.#timeline = stageClearTimeline(this.#title.letterCount, this.#rows.length);
    this.#cues = stageClearCues(this.#timeline, {
      letters: this.#title.letterCount,
      collected: this.#rows.map((row) => row.fresh),
      newRecord: this.#newRecord,
    });
    this.#career = new CareerPanel(this.#services, experience, this.#rows, CAREER_FRAME);
    this.#options = this.#createOptions(clearActions(state, level.id));
    this.#focus = initialClearFocus(this.#rows.map((row) => row.unlocked));
    audio.playMusic('stage-clear', { loop: false });
  }

  exit(): void {}

  update(step: GameStep): void {
    this.#process(step);
    // Cleared only after the step is handled, so the release of a latched press can never activate a button.
    if (!step.input.isDown('confirm')) this.#confirmLatched = false;
  }

  #process(step: GameStep): void {
    const previous = this.#time;
    this.#time += step.dt;
    const { input } = step;
    this.#pointing = input.pointing;
    this.#device = controlDevice(this.#device, input.lastDevice, this.#services.settings.touchControls);
    if (this.#leaving) return;

    if (this.#time < this.#timeline.settled) {
      if (
        previous >= SKIP_AFTER &&
        (input.wasPressed('confirm') || input.wasPressed('back') || input.pointer.pressed)
      ) {
        // Skip to the settled screen silently: replaying every tick at once would be a burst of noise.
        this.#time = this.#timeline.settled;
        this.#confirmLatched = input.isDown('confirm');
        return;
      }
      for (const cue of cuesBetween(this.#cues, previous, this.#time)) this.#services.audio.playSfx(cue.sfx);
      return;
    }

    if (this.#finale) {
      this.#updateFinale(step);
      return;
    }
    if (this.#detail.open) {
      this.#detail.update();
      if (input.wasPressed('confirm') || input.wasPressed('back') || input.pointer.pressed) this.#detail.close();
      return;
    }
    this.#updateMenu(step);
  }

  render(gfx: Gfx): void {
    const params = this.#params;
    const level = this.#level;
    if (!params || !level) return;
    const t = this.#time;
    const timeline = this.#timeline;
    const jolt = this.#services.settings.reducedMotion ? { x: 0, y: 0 } : shake(t, timeline.slamEnd, 0.15, 3);

    gfx.withOffset(jolt.x, jolt.y, () => {
      this.#renderBackdrop(gfx, level);
      const exit = segment(t, timeline.collapse, timeline.collapse + 0.25, easeInCubic);
      if (exit >= 1) return;
      const timing = { letterStart: timeline.letterStart, fall: LETTER_FALL };
      this.#title.render(gfx, gfx.width / 2, 72 - Math.round(exit * 140), t, timing);
    });
    if (t < timeline.collapse) return;

    this.#renderHeader(gfx, level);
    const slide = 1 - segment(t, timeline.collapse, timeline.collapse + PANEL_IN_SECONDS, easeOutExpo);
    gfx.withOffset(-Math.round(slide * 130), 0, () => {
      this.#results.render(gfx, RESULTS_FRAME, t, timeline, {
        result: params.result,
        newRecord: this.#newRecord,
        best: this.#services.session.state.bestScore[level.id] ?? params.result.score,
        characterId: params.characterId,
      });
    });
    this.#career?.render(gfx, Math.round(slide * 200), {
      time: t,
      timeline,
      device: this.#device,
      focusedRow: t >= timeline.settled && this.#focus.area === 'rows' ? this.#focus.index : null,
      hand: !this.#pointing,
    });
    if (t >= timeline.settled) for (const { button } of this.#options) button.render(gfx);
    this.#detail.render(gfx, this.#device);
    this.#finale?.render(gfx);
  }

  #updateMenu(step: GameStep): void {
    const { input } = step;
    for (const direction of DIRECTIONS) {
      if (!input.wasPressed(direction)) continue;
      const next = moveFocus(this.#focus, direction, { rows: this.#rows.length, buttons: this.#options.length });
      this.#setFocus(next);
    }
    this.#updateRowPointer(step);

    if (this.#focus.area === 'rows' && input.wasPressed('confirm')) {
      this.#openDetail(this.#focus.index);
      return;
    }
    for (const [index, { action, button }] of this.#options.entries()) {
      const focused = this.#focus.area === 'buttons' && this.#focus.index === index && !this.#confirmLatched;
      if (button.update(input, focused, step.dt)) {
        this.#act(action);
        return;
      }
    }
    if (input.wasPressed('back')) this.#act('missionSelect');
  }

  /** Hovering a row focuses it; pressing and releasing on the same row opens it. */
  #updateRowPointer(step: GameStep): void {
    const { pointer } = step.input;
    const career = this.#career;
    if (!career) return;
    const hovered = pointer.over
      ? this.#rows.findIndex((_, index) => containsPoint(career.rowRect(index), pointer.x, pointer.y))
      : -1;
    step.input.clickable(hovered >= 0);
    const moved = this.#lastPointer?.x !== pointer.x || this.#lastPointer?.y !== pointer.y;
    this.#lastPointer = pointer.over ? { x: pointer.x, y: pointer.y } : null;
    if (hovered >= 0 && moved) this.#setFocus({ area: 'rows', index: hovered });
    const overButton = this.#options.findIndex(({ button }) =>
      containsPoint(button.options.bounds, pointer.x, pointer.y),
    );
    if (pointer.over && overButton >= 0 && moved) this.#setFocus({ area: 'buttons', index: overButton });

    if (pointer.pressed) this.#rowPress = hovered >= 0 ? hovered : null;
    if (pointer.released) {
      if (this.#rowPress !== null && this.#rowPress === hovered) this.#openDetail(hovered);
      this.#rowPress = null;
    }
  }

  #setFocus(next: ClearFocus): void {
    if (next.area === this.#focus.area && next.index === this.#focus.index) return;
    this.#focus = next;
    this.#services.audio.playSfx('menu-move');
  }

  #openDetail(index: number): void {
    const row = this.#rows[index];
    if (row && this.#level) this.#detail.show(row, this.#level.mission);
  }

  #updateFinale(step: GameStep): void {
    const action = this.#finale?.update(step);
    if (action === 'close') {
      this.#finale = null;
      this.#services.audio.playSfx('menu-back');
    } else if (action === 'contact') {
      this.#services.audio.playSfx('menu-confirm');
      this.#services.openLink(nextLevelTeaser.cta.href);
    } else if (action === 'missionSelect') this.#act('missionSelect');
  }

  #act(action: ClearAction): void {
    const params = this.#params;
    const level = this.#level;
    if (!params || !level) return;
    const { director, audio, session } = this.#services;
    if (action === 'finale') {
      audio.playSfx('menu-confirm');
      this.#finale = new Finale(this.#services, params.characterId);
      return;
    }
    this.#leaving = true;
    if (action === 'next') {
      const next = nextLevel(level.id);
      if (!next) return;
      audio.playSfx('menu-confirm');
      const transition = this.#services.settings.reducedMotion ? fade() : iris({ duration: 0.8 });
      director.goTo('level', { levelId: next.id, characterId: params.characterId }, transition);
      return;
    }
    audio.playSfx('menu-back');
    director.goTo('levelSelect', { focus: firstOpenLevel(session.state) ?? level.id }, fade());
  }

  #createOptions(actions: readonly ClearAction[]): Option[] {
    const { text } = this.#services;
    const total = actions.length * BUTTON.w + (actions.length - 1) * BUTTON.gap;
    const left = Math.round((320 - total) / 2);
    return actions.map((action, index) => ({
      action,
      button: new Button({
        label: CLEAR_ACTION_LABELS[action],
        bounds: { x: left + index * (BUTTON.w + BUTTON.gap), y: BUTTON.y, w: BUTTON.w, h: BUTTON.h },
        theme: index === 0 ? windowThemes.indigo : windowThemes.steel,
        style: { ...text.label, fill: index === 0 ? palette.gold : palette.white },
        cursor: this.#cursor,
      }),
    }));
  }

  /** The stage itself, held still behind the results and dimmed in flat steps (the Neo Geo shadow bit). */
  #renderBackdrop(gfx: Gfx, level: LevelInfo): void {
    drawParallax(gfx, this.#services.levelArt.get(level.id).background, 0);
    const dim =
      this.#time < this.#timeline.collapse
        ? 0.35
        : 0.35 + 0.15 * Math.min(3, Math.floor((this.#time - this.#timeline.collapse) / 0.05));
    gfx.withAlpha(dim, () => gfx.fillRect(0, 0, gfx.width, gfx.height, palette.ink));
  }

  #renderHeader(gfx: Gfx, level: LevelInfo): void {
    const { text } = this.#services;
    const drop = segment(this.#time, this.#timeline.collapse + 0.1, this.#timeline.collapse + 0.4, easeOutBack);
    const y = Math.round(-20 + drop * 25);
    gfx.text('MISSION COMPLETE!', gfx.width / 2, y, text.title, { align: 'center' });
    const subtitle = { ...text.label, fill: palette.cream };
    gfx.text(`${level.mission} · ${level.city}`, gfx.width / 2, y + 16, subtitle, { align: 'center' });
  }
}
