import { type Character, characters, skills } from '@/content';
import { fade, iris } from '@/engine/core/transitions';
import type { Gfx } from '@/engine/gfx/Gfx';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { IDLE_POINTER, type PointerSnapshot } from '@/engine/input/InputSnapshot';
import type { Rect } from '@/engine/math/Rect';
import { blink } from '@/engine/motion/oscillators';
import { frames } from '@/engine/motion/progress';
import type { GameServices } from '../../services';
import { Button } from '../../ui/Button';
import { handCursorSheet } from '../../ui/cursor';
import { Tooltip } from '../../ui/Tooltip';
import { windowThemes } from '../../ui/theme';
import type { GameScene, GameStep } from '../params';
import { drawArrows } from './arrows';
import { type CardSwitch, CardView, type CharacterPose } from './card/CardView';
import { cardFlashAlpha, LEAVE_AT, nameOffset, stampJolt, stampOpening, switchOffsets } from './choreography';
import { DetailsPanel } from './DetailsPanel';
import { drawHints } from './hints';
import { readSelectEvents } from './intents';
import { CARD, CARD_INNER, cursorAnchor, type HitTarget, hitTest, SELECT_BUTTON, SKILL_ROWS, STAGE } from './layout';
import { lazy } from './lazy';
import { drawReadyStamp } from './readyStamp';
import {
  focusedSkillSlot,
  initialSelectState,
  reduceSelectAll,
  type SelectEffect,
  type SelectState,
} from './selectMachine';
import { placeTooltip } from './tooltipPlacement';

const BACKGROUND = { stops: ['#110e36', '#07061a'], bands: 5, dither: 'bayer2' } as const;
const SCREEN: Rect = { x: 0, y: 0, w: 320, h: 240 };
const TOOLTIP_WIDTH = 140;
/** The pointer's own height, so a tooltip placed above it never hides the arrow tip. */
const POINTER_BOX = 12;

interface SwitchBeat {
  readonly from: number;
  readonly delta: -1 | 1;
  readonly at: number;
}

/**
 * Character select (docs/ART-DIRECTION.md › Character select): a starfield
 * card on the left with the character idling on a glowing pedestal, details
 * and skills on the right, a SELECT button bottom-right. Left/right switches
 * character, up/down moves focus between the card, both skills and SELECT;
 * a focused or hovered skill opens its tooltip. Choosing plays the victory
 * pose, flashes the card, stamps READY! and moves on to the mission select.
 *
 * Decisions live in the pure `selectMachine`; this class turns its effects
 * into sound and animation beats and draws the result.
 */
export class CharacterSelectScene implements GameScene {
  readonly #services: GameServices;
  readonly #card: CardView;
  readonly #details: DetailsPanel;
  readonly #tooltip: Tooltip;
  readonly #select: Button;
  readonly #cursor = lazy(() => SpriteSheet.compile(handCursorSheet, 'ui/hand-cursor'));
  #state: SelectState;
  #time = 0;
  #switch: SwitchBeat | null = null;
  #arrowPressedAt: { left: number | null; right: number | null } = { left: null, right: null };
  #focusedAt = 0;
  #chosenAt: number | null = null;
  #departed = false;
  #pointer: PointerSnapshot = IDLE_POINTER;
  #hover: HitTarget | null = null;

  constructor(services: GameServices) {
    this.#services = services;
    this.#card = new CardView(services.sprites.characters, services.rng.fork());
    this.#details = new DetailsPanel(services.text, services.sprites.skillIcons);
    this.#tooltip = new Tooltip({ maxWidth: TOOLTIP_WIDTH, theme: windowThemes.cream, style: services.text.tooltip });
    this.#select = new Button({
      label: 'SELECT',
      bounds: SELECT_BUTTON,
      theme: windowThemes.indigo,
      style: services.text.label,
    });
    this.#state = initialSelectState(characters.length);
  }

  enter(): void {
    const saved = this.#services.session.state.characterId;
    const index = characters.findIndex((character) => character.id === saved);
    this.#state = initialSelectState(characters.length, Math.max(0, index));
    this.#services.audio.playMusic('select');
  }

  exit(): void {}

  update(step: GameStep): void {
    this.#time += step.dt;
    const { input } = step;

    const events = readSelectEvents(input, this.#pointer, hitTest);
    if (this.#select.update(input, this.#state.focus === 'select', step.dt)) events.push({ type: 'activate' });
    const result = reduceSelectAll(this.#state, events);
    this.#state = result.state;
    for (const effect of result.effects) this.#apply(effect);

    this.#pointer = input.pointer;
    this.#hover = input.pointer.over ? hitTest(input.pointer.x, input.pointer.y) : null;
    this.#updateTooltip();

    if (this.#chosenAt !== null && !this.#departed && this.#time - this.#chosenAt >= LEAVE_AT) this.#depart();
  }

  render(gfx: Gfx): void {
    const { text } = this.#services;
    gfx.fillRect(0, 0, gfx.width, gfx.height, BACKGROUND);

    const chosenFor = this.#chosenAt === null ? null : this.#time - this.#chosenAt;
    const reducedMotion = this.#services.settings.reducedMotion;
    this.#card.render(gfx, {
      characterId: this.#character.id,
      time: this.#time,
      pose: this.#pose(chosenFor),
      switching: this.#switching(),
      flash: chosenFor === null ? 0 : cardFlashAlpha(chosenFor),
      frameLook: chosenFor !== null && cardFlashAlpha(chosenFor) >= 1 ? 'flash' : 'rest',
      jolt: chosenFor === null || reducedMotion ? 0 : stampJolt(chosenFor),
    });
    if (chosenFor === null) this.#renderArrows(gfx);

    const sinceSwitch = this.#switch ? this.#time - this.#switch.at : Number.POSITIVE_INFINITY;
    this.#details.render(gfx, {
      character: this.#character,
      time: this.#time,
      nameOffset: this.#switch ? nameOffset(sinceSwitch, this.#switch.delta) : 0,
      litSkill: focusedSkillSlot(this.#state.focus),
    });
    this.#select.render(gfx);
    drawHints(gfx, CARD.x, CARD.y + CARD.h + 10, text.label);

    this.#renderCursor(gfx);
    if (chosenFor !== null) {
      const opening = stampOpening(chosenFor);
      if (opening !== null) drawReadyStamp(gfx, opening, text.prompt);
    }
    this.#renderTooltip(gfx);
  }

  get #character(): Character {
    return characters[this.#state.index] ?? (characters[0] as Character);
  }

  #apply(effect: SelectEffect): void {
    const { audio, session, director } = this.#services;
    switch (effect.type) {
      case 'switched':
        this.#switch = { from: effect.from, delta: effect.delta, at: this.#time };
        this.#arrowPressedAt[effect.delta < 0 ? 'left' : 'right'] = this.#time;
        audio.playSfx('menu-move');
        return;
      case 'focused':
        this.#focusedAt = this.#time;
        audio.playSfx('menu-move');
        return;
      case 'chosen': {
        const character = characters[effect.index];
        if (!character) return;
        this.#chosenAt = this.#time;
        audio.playSfx('menu-confirm');
        session.update((state) => ({ ...state, characterId: character.id }));
        return;
      }
      case 'left':
        audio.playSfx('menu-back');
        director.goTo('title', undefined, fade());
        return;
    }
  }

  #depart(): void {
    this.#departed = true;
    const transition = this.#services.settings.reducedMotion
      ? fade()
      : iris({ x: STAGE.x, y: STAGE.y - 20, duration: 0.6 });
    this.#services.director.goTo('levelSelect', {}, transition);
  }

  #pose(chosenFor: number | null): CharacterPose {
    if (chosenFor !== null) {
      // A three-frame white silhouette is the arcade "selected!" hit before the victory pose.
      return { animation: 'victory', time: chosenFor, flash: chosenFor < frames(3) ? '#ffffff' : undefined };
    }
    return { animation: 'idle', time: this.#switch ? this.#time - this.#switch.at : this.#time };
  }

  #switching(): CardSwitch | undefined {
    const beat = this.#switch;
    if (!beat) return undefined;
    const offsets = switchOffsets(this.#time - beat.at, beat.delta, CARD_INNER.w);
    const from = characters[beat.from];
    if (offsets.done || !from) return undefined;
    return { from: from.id, incoming: offsets.incoming, outgoing: offsets.outgoing };
  }

  #renderArrows(gfx: Gfx): void {
    const ago = (at: number | null): number | null => (at === null ? null : this.#time - at);
    drawArrows(
      gfx,
      this.#time,
      { pressedAgo: ago(this.#arrowPressedAt.left), hovered: this.#hover === 'arrowLeft' },
      { pressedAgo: ago(this.#arrowPressedAt.right), hovered: this.#hover === 'arrowRight' },
    );
  }

  #renderCursor(gfx: Gfx): void {
    const chosen = this.#chosenAt !== null;
    // Solid right after it moves so the eye can follow it, then the classic on/off blink.
    if (!chosen && !blink(this.#time - this.#focusedAt, frames(30), frames(10))) return;
    const anchor = cursorAnchor(this.#state.focus);
    gfx.sprite(this.#cursor(), 'point', chosen ? 0 : this.#time, anchor.x, anchor.y);
  }

  #updateTooltip(): void {
    // Advance before `show`, so a freshly opened tooltip renders its first pop-in frame rather than skipping it.
    this.#tooltip.update();
    const slot = focusedSkillSlot(this.#state.focus);
    const { focusSource, phase } = this.#state;
    const visible =
      slot !== null && phase === 'browsing' && (focusSource === 'nav' || this.#hover === this.#state.focus);
    if (visible) {
      const skillId = this.#character.skills[slot];
      this.#tooltip.show(skills[skillId].tooltip);
    } else {
      this.#tooltip.hide();
    }
  }

  #renderTooltip(gfx: Gfx): void {
    const slot = focusedSkillSlot(this.#state.focus);
    if (!this.#tooltip.visible || slot === null) return;
    const followPointer = this.#state.focusSource === 'pointer' && this.#pointer.over;
    const anchor: Rect = followPointer
      ? { x: this.#pointer.x - 6, y: this.#pointer.y, w: 1, h: POINTER_BOX }
      : SKILL_ROWS[slot];
    const position = placeTooltip(anchor, this.#tooltip.size, SCREEN);
    this.#tooltip.render(gfx, position.x, position.y);
  }
}
