import { type CharacterId, getCharacter } from '@/content';
import { fade, iris } from '@/engine/core/transitions';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import { containsPoint, type Rect } from '@/engine/math/Rect';
import { mod } from '@/engine/math/scalar';
import { easeOutBack } from '@/engine/motion/easing';
import { blink } from '@/engine/motion/oscillators';
import { frames, segment } from '@/engine/motion/progress';
import { palette } from '../../palette';
import type { GameServices } from '../../services';
import { KeyHints } from '../../ui/KeyHints';
import { preloadMousePlay } from '../level/mouse/load';
import type { GameScene, GameStep, LevelSelectParams } from '../params';
import { InkStamp } from './art/InkStamp';
import { BriefingPanel } from './BriefingPanel';
import { drawBackdrop } from './backdrop';
import { blueprintPostcards, blueprintPrompt, MISSION_INK } from './blueprint';
import { cardRect, FOCUS_LIFT, HEADER_Y, KEY_HINTS, previewRect } from './layout';
import { buildSlots, initialFocus, type Slot } from './missions';
import { Postcards } from './Postcards';
import { type RouteStop, RouteStrip } from './RouteStrip';

/** Seconds from confirming a mission to the transition starting: long enough to see the stamp land. */
const DEPLOY_DELAY = 0.5;
const LIFT_SECONDS = frames(10);

interface PointerPress {
  readonly index: number;
  /** A press on an already-focused card activates it; on any other card it only focuses (touch-friendly). */
  readonly wasFocused: boolean;
}

/**
 * Mission select (docs/ART-DIRECTION.md › Mission select): employers as
 * missions on postcards with live stage previews, the career route flown by
 * a small plane, the focused mission's briefing with clickable CONFIRM and
 * BACK keys under it, and a locked third slot that invites the visitor to
 * get in touch.
 */
export class LevelSelectScene implements GameScene<LevelSelectParams> {
  readonly #services: GameServices;
  readonly #postcards: Postcards;
  readonly #route: RouteStrip;
  readonly #deployStamp: InkStamp;
  readonly #keys: KeyHints;
  readonly #styles: { readonly heading: TextStyle; readonly player: TextStyle };
  #characterId: CharacterId = 'hackerman';
  #panel: BriefingPanel | null = null;
  #slots: readonly Slot[] = [];
  #index = 0;
  #time = 0;
  #focusedAt = Number.NEGATIVE_INFINITY;
  #deployingAt: number | null = null;
  #leaving = false;
  #press: PointerPress | null = null;
  /**
   * Buttons activate on release. While a confirm press that started before
   * this screen is still held, its release must not fire the CONTACT button.
   */
  #confirmLatched = true;
  #lastPointer: { x: number; y: number } | null = null;

  constructor(services: GameServices) {
    this.#services = services;
    this.#postcards = new Postcards(services, blueprintPostcards(services.text.prompt));
    this.#route = new RouteStrip({ ...services.text.label, fill: MISSION_INK.route });
    this.#deployStamp = new InkStamp(
      'DEPLOY!',
      { ...services.text.label, fill: palette.red },
      { paper: palette.white },
    );
    this.#keys = new KeyHints({ ...KEY_HINTS, style: services.text.label, touch: services.settings.touchControls });
    this.#styles = {
      heading: blueprintPrompt(services.text.prompt),
      player: { ...services.text.hud, fill: MISSION_INK.secondary, outline: MISSION_INK.outline },
    };
  }

  /** `params` may be missing when the scene is opened from the dev harness without any. */
  enter(params?: LevelSelectParams): void {
    const { session } = this.#services;
    this.#characterId = session.state.characterId ?? 'hackerman';
    this.#slots = buildSlots(session.state);
    this.#panel = new BriefingPanel(this.#services, this.#characterId);
    this.#focus(initialFocus(this.#slots, params?.focus), false);
    this.#services.audio.playMusic('mission-select');
    // A mission is a confirm away: fetch the level's mouse play now, off the first load.
    preloadMousePlay();
  }

  exit(): void {}

  update(step: GameStep): void {
    this.#time += step.dt;
    const inputEnabled = !this.#leaving && this.#deployingAt === null;
    const keyboard = !this.#confirmLatched;
    if (!step.input.isDown('confirm')) this.#confirmLatched = false;
    if (this.#panel?.update(step, { enabled: inputEnabled, keyboard })) this.#contact();
    if (this.#deployingAt !== null && this.#time - this.#deployingAt >= DEPLOY_DELAY && !this.#leaving) {
      this.#launch();
    }
    const clicked = this.#keys.update(step.input);
    if (!inputEnabled) return;

    const { input } = step;
    const delta =
      (input.wasPressed('right') || input.wasPressed('down') ? 1 : 0) -
      (input.wasPressed('left') || input.wasPressed('up') ? 1 : 0);
    if (delta !== 0) this.#focus(mod(this.#index + delta, this.#slots.length));
    this.#updatePointer(step);

    // A click on CONFIRM does what the focused slot does: deploy, or get in touch from the teaser. The
    // teaser's confirm key belongs to its CONTACT button instead (it activates on release, like every button).
    if (clicked === 'confirm') this.#activate();
    else if (input.wasPressed('confirm') && this.#slot.kind === 'mission') this.#deploy();
    else if (clicked === 'back' || input.wasPressed('back')) this.#leave();
  }

  render(gfx: Gfx): void {
    drawBackdrop(gfx);
    this.#renderHeader(gfx);
    this.#renderFocusFrame(gfx);
    this.#slots.forEach((slot, index) => {
      this.#postcards.draw(gfx, slot, cardRect(index), {
        focused: index === this.#index,
        lift: this.#lift(index),
        time: this.#time,
      });
    });
    this.#renderDeploy(gfx);
    this.#route.render(gfx, this.#routeStops(), this.#time);
    this.#panel?.render(gfx);
    this.#keys.render(gfx);
  }

  get #slot(): Slot {
    const slot = this.#slots[this.#index];
    if (!slot) throw new Error('Mission select has no slots');
    return slot;
  }

  #focus(index: number, withSound = true): void {
    if (index === this.#index && this.#focusedAt > Number.NEGATIVE_INFINITY) return;
    this.#index = index;
    this.#focusedAt = this.#time;
    this.#panel?.show(this.#slot);
    if (withSound) this.#services.audio.playSfx('menu-move');
  }

  #updatePointer(step: GameStep): void {
    const { pointer } = step.input;
    const hovered = pointer.over
      ? this.#slots.findIndex((_, i) => containsPoint(hitRect(i), pointer.x, pointer.y))
      : -1;
    if (pointer.pressed && hovered >= 0) this.#press = { index: hovered, wasFocused: hovered === this.#index };

    const moved = this.#lastPointer?.x !== pointer.x || this.#lastPointer?.y !== pointer.y;
    this.#lastPointer = pointer.over ? { x: pointer.x, y: pointer.y } : null;
    if (hovered >= 0 && (moved || pointer.pressed)) this.#focus(hovered);

    if (pointer.released) {
      const press = this.#press;
      this.#press = null;
      if (press?.wasFocused && press.index === hovered) this.#activate();
    }
    if (!pointer.down && !pointer.released) this.#press = null;
  }

  #activate(): void {
    if (this.#slot.kind === 'mission') this.#deploy();
    else this.#contact();
  }

  #deploy(): void {
    this.#deployingAt = this.#time;
    this.#panel?.skipTyping();
    this.#services.audio.playSfx('menu-confirm');
  }

  #launch(): void {
    const slot = this.#slot;
    if (slot.kind !== 'mission') return;
    this.#leaving = true;
    const card = cardRect(this.#index);
    const transition = this.#services.settings.reducedMotion
      ? fade({ duration: 0.4 })
      : iris({ x: card.x + card.w / 2, y: card.y + card.h / 2, duration: 0.7 });
    this.#services.director.goTo('level', { levelId: slot.level.id, characterId: this.#characterId }, transition);
  }

  #leave(): void {
    this.#leaving = true;
    this.#services.audio.playSfx('menu-back');
    this.#services.director.goTo('characterSelect', undefined, fade());
  }

  #contact(): void {
    if (this.#slot.kind !== 'teaser') return;
    this.#services.audio.playSfx('menu-confirm');
    this.#services.openLink(this.#slot.teaser.cta.href);
  }

  /** The focused card pops up with a little overshoot; the others rest in the row. */
  #lift(index: number): number {
    if (index !== this.#index) return 0;
    return -Math.round(FOCUS_LIFT * segment(this.#time, this.#focusedAt, this.#focusedAt + LIFT_SECONDS, easeOutBack));
  }

  #renderHeader(gfx: Gfx): void {
    gfx.text('MISSION SELECT', 8, HEADER_Y, this.#styles.heading);
    const player = getCharacter(this.#characterId).name;
    gfx.text(`1P ${player}`, gfx.width - 8, HEADER_Y + 2, this.#styles.player, { align: 'right' });
  }

  #renderFocusFrame(gfx: Gfx): void {
    if (this.#deployingAt !== null || !blink(this.#time - this.#focusedAt, frames(24), frames(8))) return;
    const card = cardRect(this.#index);
    const y = card.y + this.#lift(this.#index);
    gfx.rect(card.x - 2, y - 2, card.w + 4, card.h + 4, palette.gold);
  }

  /** Confirming flashes the postcard and slams a DEPLOY! stamp onto it before the iris closes. */
  #renderDeploy(gfx: Gfx): void {
    if (this.#deployingAt === null) return;
    const elapsed = this.#time - this.#deployingAt;
    const picture = previewRect({ ...cardRect(this.#index), y: cardRect(this.#index).y + this.#lift(this.#index) });
    if (elapsed < frames(3) && !this.#services.settings.reducedMotion) {
      gfx.fillRect(picture.x, picture.y, picture.w, picture.h, palette.white);
    }
    const scale = elapsed < frames(4) ? 2 : 1;
    this.#deployStamp.draw(gfx, picture.x + picture.w / 2, picture.y + picture.h / 2, { scale });
  }

  #routeStops(): RouteStop[] {
    return this.#slots.map((slot, index) => {
      const card = cardRect(index);
      const x = card.x + Math.floor(card.w / 2);
      return slot.kind === 'teaser'
        ? { x, reached: false, open: true }
        : { x, reached: slot.progress.cleared, open: false };
    });
  }
}

/** The clickable area of a postcard, including its mission tab and the lift. */
function hitRect(index: number): Rect {
  const card = cardRect(index);
  return { x: card.x, y: card.y - 8, w: card.w, h: card.h + 8 };
}
