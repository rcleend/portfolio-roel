import type { CharacterId } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import { mod } from '@/engine/math/scalar';
import { blink } from '@/engine/motion/oscillators';
import { frames } from '@/engine/motion/progress';
import { palette } from '../../palette';
import type { GameServices } from '../../services';
import { Button } from '../../ui/Button';
import { handCursorSheet } from '../../ui/cursor';
import { Paragraph } from '../../ui/Paragraph';
import { Tooltip } from '../../ui/Tooltip';
import { TypewriterText } from '../../ui/TypewriterText';
import { windowThemes } from '../../ui/theme';
import { drawWindow, windowContent } from '../../ui/Window';
import type { GameStep } from '../params';
import { envelopeSheet } from './art/icons';
import { PANEL } from './layout';
import type { MissionSlot, Slot, TeaserSlot } from './missions';

/** Width of the text column; the right side of the panel belongs to the threat (or the visitor). */
const TEXT_WIDTH = 222;
const COMPLAINT_SECONDS = 2.8;
/** One typewriter tick every few characters: a tick per character would buzz at 60 Hz. */
const TICK_EVERY = 3;

/**
 * The lower half of the mission select: the focused mission's briefing
 * (role, company context, briefing copy, hazards, the threat) or, for the
 * locked slot, the invitation to get in touch.
 */
export class BriefingPanel {
  readonly #services: GameServices;
  readonly #characterId: CharacterId;
  readonly #cursor = SpriteSheet.compile(handCursorSheet, 'ui/hand-cursor');
  readonly #envelope = SpriteSheet.compile(envelopeSheet, 'mission-select/envelope');
  readonly #complaint: Tooltip;
  readonly #contact: Button;
  readonly #styles: {
    readonly heading: TextStyle;
    readonly context: TextStyle;
    readonly copy: TextStyle;
    readonly hazard: TextStyle;
    readonly threat: TextStyle;
    readonly hint: TextStyle;
  };
  #slot: Slot | null = null;
  #briefing: TypewriterText | null = null;
  #teaserBody: Paragraph | null = null;
  #shownAt = 0;
  #time = 0;

  constructor(services: GameServices, characterId: CharacterId) {
    this.#services = services;
    this.#characterId = characterId;
    const { text } = services;
    this.#styles = {
      heading: { ...text.label, fill: palette.gold },
      context: { ...text.body, fill: palette.lavender },
      copy: { ...text.body, fill: palette.white },
      hazard: { ...text.label, fill: palette.orange },
      threat: { ...text.label, fill: palette.red },
      hint: { ...text.hud, fill: palette.steel },
    };
    this.#complaint = new Tooltip({ maxWidth: 74, theme: windowThemes.cream, style: text.tooltip });
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
    this.#shownAt = this.#time;
    this.#complaint.hide();
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
      this.#teaserBody = new Paragraph(slot.teaser.body, this.#styles.copy, { maxWidth: TEXT_WIDTH });
    }
  }

  /** Advances one step; returns true when the visitor asks to get in touch. */
  update(step: GameStep, inputEnabled: boolean): boolean {
    this.#time += step.dt;
    this.#briefing?.update();
    const slot = this.#slot;
    if (slot?.kind === 'mission') this.#updateComplaint(slot);
    else this.#complaint.hide();
    this.#complaint.update();
    if (slot?.kind !== 'teaser' || !inputEnabled) return false;
    return this.#contact.update(step.input, true, step.dt);
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

  #updateComplaint(slot: MissionSlot): void {
    // Let the briefing land before the customer starts shouting over it.
    const since = this.#time - this.#shownAt - 1.2;
    if (since < 0) return;
    const { complaints } = slot.level;
    const index = Math.floor(since / COMPLAINT_SECONDS);
    const phase = since - index * COMPLAINT_SECONDS;
    const line = complaints[mod(index, complaints.length)];
    if (line && phase < COMPLAINT_SECONDS - 0.5) this.#complaint.show(line);
    else this.#complaint.hide();
  }

  #renderMission(gfx: Gfx, slot: MissionSlot): void {
    const inner = windowContent(PANEL);
    const x = inner.x + 2;
    let y = inner.y + 2;
    gfx.text(slot.experience.role.toUpperCase(), x, y, this.#styles.heading);
    y += 11;
    gfx.text(slot.experience.context, x, y, this.#styles.context);
    y += 12;
    gfx.fillRect(x, y, TEXT_WIDTH, 1, palette.steelDark);
    gfx.fillRect(x, y + 1, TEXT_WIDTH, 1, palette.steel);
    y += 5;
    this.#briefing?.render(gfx, x, y);
    y = inner.y + 70;
    const hazards = gfx.text('HAZARDS', x, y, this.#styles.hazard);
    gfx.text(slot.level.hazards.join(' · '), x + hazards.width + 6, y, this.#styles.copy);
    y += 11;
    const threat = gfx.text('THREAT', x, y, this.#styles.threat);
    gfx.text('UNHAPPY CUSTOMERS', x + threat.width + 6, y, { ...this.#styles.threat, fill: palette.white });

    const customerX = inner.x + inner.w - 24;
    const feetY = inner.y + inner.h - 1;
    const shouting = this.#complaint.visible;
    gfx.sprite(this.#services.sprites.unhappyCustomer, shouting ? 'shout' : 'walk', this.#time, customerX, feetY, {
      flipX: true,
    });
    if (shouting) {
      const bubble = this.#complaint.size;
      const bottom = feetY - 44;
      this.#complaint.render(gfx, inner.x + inner.w - bubble.w, bottom - bubble.h);
      drawBubbleTail(gfx, customerX - 4, bottom - 4);
    }
    this.#renderHint(gfx, 'CONFIRM: DEPLOY   BACK: CHANGE HERO');
  }

  #renderHint(gfx: Gfx, hint: string): void {
    const inner = windowContent(PANEL);
    gfx.text(hint, inner.x + 2, inner.y + inner.h - 9, this.#styles.hint);
  }

  #renderTeaser(gfx: Gfx, slot: TeaserSlot): void {
    const inner = windowContent(PANEL);
    const x = inner.x + 2;
    let y = inner.y + 2;
    gfx.text(`${slot.teaser.mission} · ${slot.teaser.title}`, x, y, this.#styles.heading);
    y += 11;
    gfx.text('STATUS: OPEN POSITION', x, y, this.#styles.context);
    y += 12;
    gfx.fillRect(x, y, TEXT_WIDTH, 1, palette.steelDark);
    gfx.fillRect(x, y + 1, TEXT_WIDTH, 1, palette.steel);
    y += 5;
    this.#teaserBody?.render(gfx, x, y);

    this.#contact.render(gfx);
    const bounds = this.#contact.options.bounds;
    const addressX = bounds.x + bounds.w + 8;
    gfx.sprite(this.#envelope, 'idle', this.#time, addressX, bounds.y + 5);
    gfx.text(slot.teaser.cta.label, addressX + 15, bounds.y + 6, this.#styles.copy);

    this.#renderHint(gfx, 'CONFIRM: GET IN TOUCH   BACK: CHANGE HERO');
    const hero = this.#services.sprites.characters[this.#characterId];
    gfx.sprite(hero, 'idle', this.#time, inner.x + inner.w - 26, inner.y + inner.h - 2, { flipX: true });
    if (blink(this.#time, frames(32), frames(16))) {
      gfx.text('?', inner.x + inner.w - 40, inner.y + inner.h - 54, this.#services.text.prompt);
    }
  }
}

/** The speech-bubble pointer: a cream wedge with an ink outline, aimed down-right at the speaker. */
function drawBubbleTail(gfx: Gfx, x: number, y: number): void {
  // The first rows paint over the bubble's bottom border so the wedge reads as part of the bubble.
  const rows = ['WWWWWWW', 'WWWWWWW', 'oWWWWWo', 'oWWWWWo', '.oWWWo.', '..oWo..', '...o...'];
  rows.forEach((row, dy) => {
    [...row].forEach((key, dx) => {
      if (key === 'o') gfx.pixel(x + dx, y + dy, windowThemes.cream.outline);
      else if (key === 'W') gfx.pixel(x + dx, y + dy, '#f1e6bd');
    });
  });
}
