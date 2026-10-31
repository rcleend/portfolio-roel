import type { Gfx } from '@/engine/gfx/Gfx';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import type { Rect } from '@/engine/math/Rect';
import { palette } from '../../palette';
import type { GameServices } from '../../services';
import { windowThemes } from '../../ui/theme';
import { drawWindow } from '../../ui/Window';
import { InkStamp } from './art/InkStamp';
import { envelopeSheet, padlockSheet } from './art/icons';
import { previewRect } from './layout';
import { formatYears, type MissionSlot, type Slot, stampName, type TeaserSlot } from './missions';
import { drawStagePreview, PREVIEW_FRAMING } from './stagePreview';

/** Neo Geo "shadow" bit: unfocused pictures drop to roughly half brightness. */
const DIM_ALPHA = 0.5;

export interface CardPose {
  readonly focused: boolean;
  /** Vertical offset in pixels (negative lifts the card). */
  readonly lift: number;
  /** Seconds of scene time, for the live preview and idle animations. */
  readonly time: number;
}

/**
 * The inks the postcards' own marks are drawn in. The card faces, the gold
 * tab numbers and the caption stay the same everywhere; these follow the
 * scheme of the screen that shows the cards.
 */
export interface PostcardInks {
  /** The tabs' rim and the locked picture's frame. */
  readonly outline: string;
  /** The folder tabs' face, also the company name lettered on the cream card and its picture's frame. */
  readonly folder: string;
  /** The folder tabs' lit top edge. */
  readonly folderEdge: string;
  /** The locked picture's "classified" paper, top band first. */
  readonly classified: readonly string[];
  /** Its marching hatch. */
  readonly hatch: string;
  /** The padlock's and the envelope's outline. */
  readonly prop: string;
  /** The face of the locked picture's "?" marks. */
  readonly mark: TextStyle;
}

/**
 * Draws the three postcards: two missions with a live stage preview and the
 * locked "YOUR TEAM?" slot. Holds the compiled props and stamps so they are
 * built once per scene rather than per frame.
 */
export class Postcards {
  readonly #services: GameServices;
  readonly #inks: PostcardInks;
  readonly #padlock: SpriteSheet<'idle'>;
  readonly #envelope: SpriteSheet<'idle'>;
  readonly #cleared: InkStamp;
  readonly #styles: {
    readonly tab: TextStyle;
    readonly company: TextStyle;
    readonly caption: TextStyle;
    readonly badge: TextStyle;
  };

  constructor(services: GameServices, inks: PostcardInks) {
    this.#services = services;
    this.#inks = inks;
    this.#padlock = SpriteSheet.compile(padlockSheet(inks.prop), 'mission-select/padlock');
    this.#envelope = SpriteSheet.compile(envelopeSheet(inks.prop), 'mission-select/envelope');
    const { text } = services;
    this.#cleared = new InkStamp('CLEARED', { ...text.label, fill: palette.red }, { paper: '#fff6dc' });
    this.#styles = {
      tab: { ...text.label, fill: palette.gold },
      company: { ...text.label, fill: inks.folder, shadow: undefined },
      caption: { ...text.caption, fill: '#5b4a2a' },
      badge: { ...text.body, fill: palette.gold },
    };
  }

  draw(gfx: Gfx, slot: Slot, frame: Rect, pose: CardPose): void {
    const card = { ...frame, y: frame.y + pose.lift };
    if (slot.kind === 'mission') this.#drawMission(gfx, slot, card, pose);
    else this.#drawTeaser(gfx, slot, card, pose);
  }

  #drawMission(gfx: Gfx, slot: MissionSlot, card: Rect, pose: CardPose): void {
    drawWindow(gfx, card, windowThemes.cream);
    this.#drawTab(gfx, card, slot.label);
    const picture = previewRect(card);
    gfx.rect(picture.x - 1, picture.y - 1, picture.w + 2, picture.h + 2, this.#inks.folder);
    const art = this.#services.levelArt.get(slot.level.id);
    drawStagePreview(gfx, art, picture, PREVIEW_FRAMING[slot.level.id], pose.time);
    if (slot.progress.cleared) {
      this.#cleared.draw(gfx, picture.x + picture.w / 2, picture.y + picture.h / 2);
    }
    if (!pose.focused)
      gfx.withAlpha(DIM_ALPHA, () => gfx.fillRect(picture.x, picture.y, picture.w, picture.h, palette.ink));

    const captionY = picture.y + picture.h + 4;
    const right = picture.x + picture.w;
    gfx.text(stampName(slot.experience.company), picture.x, captionY, this.#styles.company);
    gfx.text(formatYears(slot.experience), right, captionY + 1, this.#styles.caption, { align: 'right' });
    gfx.text(slot.level.city, picture.x, captionY + 11, this.#styles.caption);
    if (slot.progress.cleared) {
      const tally = `★ ${slot.progress.collected}/${slot.progress.total}`;
      const width = gfx.measureText(tally, this.#styles.badge).width + 8;
      const chipX = picture.x + picture.w - width;
      const chipY = picture.y + picture.h - 11;
      drawTabShape(gfx, this.#inks, chipX, chipY, width, 11);
      gfx.text(tally, chipX + 4, chipY + 1, this.#styles.badge);
    }
  }

  #drawTab(gfx: Gfx, card: Rect, label: string): void {
    const width = gfx.measureText(label, this.#styles.tab).width + 9;
    const y = card.y - 7;
    drawTabShape(gfx, this.#inks, card.x + 6, y, width);
    gfx.text(label, card.x + 10, y + 2, this.#styles.tab);
  }

  #drawTeaser(gfx: Gfx, slot: TeaserSlot, card: Rect, pose: CardPose): void {
    const { text } = this.#services;
    drawWindow(gfx, card, windowThemes.steel);
    this.#drawTab(gfx, card, slot.label);
    const picture = previewRect(card);
    const inks = this.#inks;
    gfx.rect(picture.x - 1, picture.y - 1, picture.w + 2, picture.h + 2, inks.outline);
    drawClassified(gfx, inks, picture, pose.focused ? pose.time : 0);
    const lock = this.#padlock;
    gfx.sprite(lock, 'idle', 0, picture.x + Math.floor((picture.w - lock.width) / 2), picture.y + 10);
    gfx.text('?', picture.x + 16, picture.y + 18, inks.mark);
    gfx.text('?', picture.x + picture.w - 24, picture.y + 18, inks.mark);
    if (!pose.focused)
      gfx.withAlpha(DIM_ALPHA, () => gfx.fillRect(picture.x, picture.y, picture.w, picture.h, palette.ink));

    const captionY = picture.y + picture.h + 4;
    gfx.text(slot.teaser.title, picture.x, captionY, { ...text.label, fill: palette.white });
    gfx.text('CONTACT', picture.x, captionY + 11, { ...text.body, fill: palette.gold });
    const iconX = picture.x + gfx.measureText('CONTACT', text.body).width + 4;
    gfx.sprite(this.#envelope, 'idle', pose.focused ? pose.time : 0, iconX, captionY + 10);
  }
}

/** Company number on a folder tab clipped over the postcard's top edge, like a label on a file folder. */
function drawTabShape(gfx: Gfx, inks: PostcardInks, x: number, y: number, w: number, h = 12): void {
  gfx.fillRect(x, y, w, h, inks.outline);
  gfx.fillRect(x + 1, y + 1, w - 2, h - 2, inks.folder);
  gfx.fillRect(x + 1, y + 1, w - 2, 1, inks.folderEdge);
}

/** Diagonal "classified" hatching that slowly marches while the slot is focused. */
function drawClassified(gfx: Gfx, inks: PostcardInks, area: Rect, time: number): void {
  gfx.fillRect(area.x, area.y, area.w, area.h, { stops: inks.classified, bands: 3 });
  const shift = Math.floor(time * 8) % 8;
  gfx.withClip(area.x, area.y, area.w, area.h, () => {
    for (let offset = -area.h; offset < area.w; offset += 8) {
      const x0 = area.x + offset + shift;
      gfx.line(x0, area.y + area.h - 1, x0 + area.h - 1, area.y, inks.hatch);
    }
  });
}
