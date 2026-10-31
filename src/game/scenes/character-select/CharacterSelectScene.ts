import { type Character, characters } from '@/content';
import { fade, iris } from '@/engine/core/transitions';
import type { Gfx } from '@/engine/gfx/Gfx';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { blink } from '@/engine/motion/oscillators';
import { frames } from '@/engine/motion/progress';
import { figureHeight, skillIcons } from '../../art/looks/Looks';
import type { GameServices } from '../../services';
import { handCursorSheet } from '../../ui/cursor';
import { iconSlotSize } from '../../ui/iconSlot';
import { KeyHints } from '../../ui/KeyHints';
import type { GameScene, GameStep } from '../params';
import { drawArrows } from './arrows';
import { drawBackdrop } from './backdrop';
import { type CardSwitch, CardView, type CharacterPose } from './card/CardView';
import { cardFlashAlpha, LEAVE_AT, nameOffset, stampJolt, stampOpening, switchOffsets } from './choreography';
import { DetailsPanel } from './DetailsPanel';
import { drawHints } from './hints';
import { readSelectEvents } from './intents';
import {
  CARD,
  CARD_INNER,
  CURSOR_ANCHOR,
  HINTS_Y,
  type HitTarget,
  KEY_HINTS,
  type SelectLayout,
  SKILL_SLOT_SIZE,
  STAGE,
  selectLayout,
} from './layout';
import { lazy } from './lazy';
import { drawReadyStamp } from './readyStamp';
import { initialSelectState, reduceSelectAll, type SelectEffect, type SelectState } from './selectMachine';

interface SwitchBeat {
  readonly from: number;
  readonly delta: -1 | 1;
  readonly at: number;
}

/**
 * Character select (docs/ART-DIRECTION.md › Character select): a starfield
 * card on the left with the character idling on a glowing pedestal, details
 * and skills on the right, and a control legend along the bottom whose
 * CONFIRM and BACK keys can be clicked. Left/right (or the arrows) switches
 * character; the skills are shown, icon and name, and react to nothing.
 * Choosing plays the victory pose, flashes the card, stamps READY! and moves
 * on to the mission select.
 *
 * Decisions live in the pure `selectMachine`; this class turns its effects
 * into sound and animation beats and draws the result.
 */
export class CharacterSelectScene implements GameScene {
  readonly #services: GameServices;
  readonly #layout: SelectLayout;
  readonly #card: CardView;
  readonly #details: DetailsPanel;
  readonly #keys: KeyHints;
  readonly #cursor = lazy(() => SpriteSheet.compile(handCursorSheet, 'ui/hand-cursor'));
  #state: SelectState;
  #time = 0;
  #switch: SwitchBeat | null = null;
  #arrowPressedAt: { left: number | null; right: number | null } = { left: null, right: null };
  #chosenAt: number | null = null;
  #departed = false;
  /** The visitor plays with the pointer: the hand that shows where the keys are stays away. */
  #pointing = false;
  #hover: HitTarget | null = null;

  constructor(services: GameServices) {
    this.#services = services;
    this.#layout = selectLayout(iconSlotSize(SKILL_SLOT_SIZE, skillIcons(services.looks)));
    this.#card = new CardView(services.looks, services.rng.fork());
    this.#details = new DetailsPanel(services.text, services.looks, this.#layout);
    this.#keys = new KeyHints({ ...KEY_HINTS, style: services.text.label, touch: services.settings.touchControls });
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

    const { hitTest } = this.#layout;
    const events = readSelectEvents(input, hitTest);
    const clicked = this.#keys.update(input);
    if (clicked) events.push({ type: clicked });
    const result = reduceSelectAll(this.#state, events);
    this.#state = result.state;
    for (const effect of result.effects) this.#apply(effect);

    this.#pointing = input.pointing;
    this.#hover = input.pointer.over ? hitTest(input.pointer.x, input.pointer.y) : null;

    if (this.#chosenAt !== null && !this.#departed && this.#time - this.#chosenAt >= LEAVE_AT) this.#depart();
  }

  render(gfx: Gfx): void {
    const { text } = this.#services;
    drawBackdrop(gfx);

    const chosenFor = this.#chosenAt === null ? null : this.#time - this.#chosenAt;
    // Reduced motion keeps the beat (pose, stamp) but drops the big bright flash and the jolt.
    const calm = chosenFor === null || this.#services.settings.reducedMotion;
    const flash = calm ? 0 : cardFlashAlpha(chosenFor);
    this.#card.render(gfx, {
      characterId: this.#character.id,
      time: this.#time,
      pose: this.#pose(chosenFor),
      switching: this.#switching(),
      flash,
      frameLook: flash >= 1 ? 'flash' : 'rest',
      jolt: calm ? 0 : stampJolt(chosenFor),
    });
    if (chosenFor === null) this.#renderArrows(gfx);

    const sinceSwitch = this.#switch ? this.#time - this.#switch.at : Number.POSITIVE_INFINITY;
    this.#details.render(gfx, {
      character: this.#character,
      time: this.#time,
      nameOffset: this.#switch ? nameOffset(sinceSwitch, this.#switch.delta) : 0,
    });
    drawHints(gfx, CARD.x, HINTS_Y, text.label);
    this.#keys.render(gfx);

    this.#renderCursor(gfx);
    if (chosenFor !== null) {
      const opening = stampOpening(chosenFor);
      if (opening !== null) drawReadyStamp(gfx, opening, text.prompt);
    }
  }

  get #character(): Character {
    const character = characters[this.#state.index];
    // The state machine wraps the index into the roster, so this only fires if the roster is empty.
    if (!character) throw new Error(`No character at index ${this.#state.index}`);
    return character;
  }

  #apply(effect: SelectEffect): void {
    const { audio, session, director } = this.#services;
    switch (effect.type) {
      case 'switched':
        this.#switch = { from: effect.from, delta: effect.delta, at: this.#time };
        this.#arrowPressedAt[effect.delta < 0 ? 'left' : 'right'] = this.#time;
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
    // The iris closes on the middle of the hero, however tall the look draws them.
    const tall = figureHeight(this.#services.looks.characters[this.#character.id].sheet, 'idle');
    const transition = this.#services.settings.reducedMotion
      ? fade()
      : iris({ x: STAGE.x, y: STAGE.y - Math.round(tall / 2), duration: 0.6 });
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
    // The hand shows where the keys are: while the visitor plays with the pointer it stays away.
    if (this.#pointing) return;
    const chosen = this.#chosenAt !== null;
    // The classic on/off blink beside the class heading, held solid once a character is chosen.
    if (!chosen && !blink(this.#time, frames(30), frames(10))) return;
    gfx.sprite(this.#cursor(), 'point', chosen ? 0 : this.#time, CURSOR_ANCHOR.x, CURSOR_ANCHOR.y);
  }
}
