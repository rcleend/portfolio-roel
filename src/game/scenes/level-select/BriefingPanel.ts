import type { CharacterId } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import { blink } from '@/engine/motion/oscillators';
import { frames } from '@/engine/motion/progress';
import { palette } from '../../palette';
import type { GameServices } from '../../services';
import { Button } from '../../ui/Button';
import { handCursorSheet } from '../../ui/cursor';
import { Paragraph } from '../../ui/Paragraph';
import { TypewriterText } from '../../ui/TypewriterText';
import { windowThemes } from '../../ui/theme';
import { drawWindow, windowContent } from '../../ui/Window';
import type { GameStep } from '../params';
import { envelopeSheet } from './art/icons';
import { PANEL } from './layout';
import type { MissionSlot, Slot, TeaserSlot } from './missions';

/** Text starts this far inside the panel's content area, on every side. */
const PADDING = 2;
/** A mission's briefing spans the whole panel. */
const TEXT_WIDTH = windowContent(PANEL).w - PADDING * 2;
/** The teaser keeps the panel's right side for the visitor's hero and its question mark. */
const TEASER_TEXT_WIDTH = 222;
/** One typewriter tick every few characters: a tick per character would buzz at 60 Hz. */
const TICK_EVERY = 3;

/**
 * The lower half of the mission select: the focused mission's briefing
 * (role, company context, briefing copy and the target) or, for the locked
 * slot, the invitation to get in touch.
 */
export class BriefingPanel {
  readonly #services: GameServices;
  readonly #characterId: CharacterId;
  readonly #cursor = SpriteSheet.compile(handCursorSheet, 'ui/hand-cursor');
  readonly #envelope = SpriteSheet.compile(envelopeSheet, 'mission-select/envelope');
  readonly #contact: Button;
  readonly #styles: {
    readonly heading: TextStyle;
    readonly context: TextStyle;
    readonly copy: TextStyle;
    readonly target: TextStyle;
    readonly targetValue: TextStyle;
  };
  #slot: Slot | null = null;
  #briefing: TypewriterText | null = null;
  #teaserBody: Paragraph | null = null;
  #time = 0;

  constructor(services: GameServices, characterId: CharacterId) {
    this.#services = services;
    this.#characterId = characterId;
    const { text } = services;
    this.#styles = {
      heading: { ...text.label, fill: palette.gold },
      context: { ...text.body, fill: palette.lavender },
      copy: { ...text.body, fill: palette.white },
      target: { ...text.label, fill: palette.green },
      targetValue: { ...text.label, fill: palette.white },
    };
    const inner = windowContent(PANEL);
    this.#contact = new Button({
      label: 'CONTACT',
      bounds: { x: inner.x + 12, y: inner.y + 56, w: 88, h: 20 },
      theme: windowThemes.indigo,
      style: { ...text.label, fill: palette.gold },
      cursor: this.#cursor,
    });
  }

  /** Switches to `slot`; the briefing types out afresh each time, like a new transmission. */
  show(slot: Slot): void {
    if (slot === this.#slot) return;
    this.#slot = slot;
    this.#briefing = null;
    this.#teaserBody = null;
    if (slot.kind === 'mission') {
      let typed = 0;
      this.#briefing = new TypewriterText(slot.level.briefing, this.#styles.copy, {
        maxWidth: TEXT_WIDTH,
        framesPerChar: 1,
        onChar: () => {
          if (typed++ % TICK_EVERY === 0) this.#services.audio.playSfx('typewriter');
        },
      });
    } else {
      this.#teaserBody = new Paragraph(slot.teaser.body, this.#styles.copy, { maxWidth: TEASER_TEXT_WIDTH });
    }
  }

  /**
   * Advances one step; returns true when the visitor asks to get in touch.
   * `keyboard` gates confirm-key activation of the CONTACT button (pointer clicks always work).
   */
  update(step: GameStep, input: { readonly enabled: boolean; readonly keyboard: boolean }): boolean {
    this.#time += step.dt;
    this.#briefing?.update();
    if (this.#slot?.kind !== 'teaser' || !input.enabled) return false;
    return this.#contact.update(step.input, input.keyboard, step.dt);
  }

  /** Finishes the type-out at once, e.g. when the player is already deploying. */
  skipTyping(): void {
    this.#briefing?.skip();
  }

  render(gfx: Gfx): void {
    const slot = this.#slot;
    drawWindow(gfx, PANEL, windowThemes.steel);
    if (slot?.kind === 'mission') this.#renderMission(gfx, slot);
    else if (slot?.kind === 'teaser') this.#renderTeaser(gfx, slot);
  }

  #renderMission(gfx: Gfx, slot: MissionSlot): void {
    const inner = windowContent(PANEL);
    const x = inner.x + PADDING;
    let y = inner.y + PADDING;
    gfx.text(slot.experience.role.toUpperCase(), x, y, this.#styles.heading);
    y += 11;
    gfx.text(slot.experience.context, x, y, this.#styles.context);
    y += 12;
    gfx.fillRect(x, y, TEXT_WIDTH, 1, palette.steelDark);
    gfx.fillRect(x, y + 1, TEXT_WIDTH, 1, palette.steel);
    y += 5;
    this.#briefing?.render(gfx, x, y);
    // The target closes the panel, as far above its bottom as the role heading sits below its top.
    y = inner.y + inner.h - PADDING - this.#styles.target.font.cellHeight;
    const target = gfx.text('TARGET', x, y, this.#styles.target);
    gfx.text(slot.level.target, x + target.width + 6, y, this.#styles.targetValue);
  }

  #renderTeaser(gfx: Gfx, slot: TeaserSlot): void {
    const inner = windowContent(PANEL);
    const x = inner.x + PADDING;
    let y = inner.y + PADDING;
    gfx.text(`${slot.label} · ${slot.teaser.title}`, x, y, this.#styles.heading);
    y += 11;
    gfx.text('STATUS: OPEN POSITION', x, y, this.#styles.context);
    y += 12;
    gfx.fillRect(x, y, TEASER_TEXT_WIDTH, 1, palette.steelDark);
    gfx.fillRect(x, y + 1, TEASER_TEXT_WIDTH, 1, palette.steel);
    y += 5;
    this.#teaserBody?.render(gfx, x, y);

    this.#contact.render(gfx);
    const bounds = this.#contact.options.bounds;
    const addressX = bounds.x + bounds.w + 8;
    gfx.sprite(this.#envelope, 'idle', this.#time, addressX, bounds.y + 5);
    gfx.text(slot.teaser.cta.label, addressX + 15, bounds.y + 6, this.#styles.copy);

    const hero = this.#services.looks.characters[this.#characterId].sheet;
    const feetY = inner.y + inner.h - 2;
    gfx.sprite(hero, 'idle', this.#time, inner.x + inner.w - 26, feetY, { flipX: true });
    if (blink(this.#time, frames(32), frames(16))) {
      gfx.text('?', inner.x + inner.w - 40, feetY - hero.height - 12, this.#services.text.prompt);
    }
  }
}
