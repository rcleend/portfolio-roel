import type { CustomerLabels } from '@/content';
import type { Rect } from '@/engine/math/Rect';
import type { LabelPicture, LabelSize } from '../../art/fx/customerLabel';
import type { Customer, CustomerMood } from './Customer';

/**
 * The label under every customer's feet: "Unhappy customer" while they are
 * frustrated, "Happy customer" from the hit that wins them over, popping in
 * with a white flash and a two-pixel hop. This module decides which picture
 * shows, where and whether; `art/fx/customerLabel` paints them.
 */

/** Which label a customer wears. */
export type CustomerLabelKind = keyof CustomerLabels;

export interface LabelFrame {
  readonly picture: LabelPicture;
  /** Whole pixels above the label's resting place. */
  readonly rise: number;
}

/**
 * Walking, shouting, hurt, stunned or calmed, a customer is unhappy until
 * they are won over. The escalated customer goes unlabelled while it drops
 * in from above the screen, so no label falls through the HUD and the
 * ESCALATED! banner: it is named the moment it lands.
 */
export function labelKind(mood: CustomerMood): CustomerLabelKind | null {
  switch (mood.kind) {
    case 'entering':
      return null;
    case 'won':
      return 'happy';
    default:
      return 'unhappy';
  }
}

const UNHAPPY: LabelFrame = { picture: 'unhappy', rise: 0 };
const HAPPY: LabelFrame = { picture: 'happy', rise: 0 };
const HOP: LabelFrame = { picture: 'flash', rise: 2 };
const LANDING: LabelFrame = { picture: 'happy', rise: 1 };
/** The switch, one entry per 60 Hz frame from the winning hit: a white flash hops up two pixels and lands green. */
const SWITCH: readonly LabelFrame[] = [HOP, HOP, HOP, LANDING, LANDING, LANDING];

/** The label `age` seconds into `mood`, or null for none; under reduced motion the happy one simply replaces the other. */
export function labelFrame(mood: CustomerMood, age: number, reducedMotion: boolean): LabelFrame | null {
  const kind = labelKind(mood);
  if (kind === null) return null;
  if (kind === 'unhappy') return UNHAPPY;
  if (reducedMotion) return HAPPY;
  return SWITCH[Math.round(age * 60)] ?? HAPPY;
}

/** Rows of air between a customer's feet and the top of their label. */
export const FEET_GAP = 1;
/** Labels side by side keep at least this many pixels apart, so two labels' letters stand further apart than one label's words. */
export const LABEL_GAP = 6;
/** Rows of labels under the feet: where two would meet side by side, one steps down a row. */
export const ROWS = 2;
/** A label that stepped down moves back up only once its row has this much more room, so it never flickers between rows. */
export const SETTLE = 8;

/**
 * Whether a customer is far enough on the screen spanning `viewWidth` world
 * pixels from `viewX` to wear a label: their middle is. One further out goes
 * without, so a label never waits at the edge for a customer the player
 * cannot see.
 */
export function labelled(centerX: number, viewX: number, viewWidth: number): boolean {
  const x = Math.round(centerX);
  return x >= viewX && x < viewX + viewWidth;
}

/**
 * A label's left edge: centred on the line the sprite above it is mirrored
 * around (an odd width leaves the spare pixel on the right), and slid inward
 * near an edge of the screen so the edge never cuts it, as it would under
 * the escalated customer at the arena wall. A cut label could even say the
 * opposite: "Unhappy customer" losing its first letters at the left edge
 * reads "happy customer".
 */
export function labelLeft(centerX: number, width: number, viewX: number, viewWidth: number): number {
  const centred = Math.round(centerX) - Math.floor(width / 2);
  return Math.min(Math.max(centred, viewX), viewX + viewWidth - width);
}

/** A label's top edge on `row`: row 0 hangs just under the feet, where every customer stands whatever its size or look. */
export function labelTop(feet: number, row: number, height: number): number {
  return Math.round(feet) + FEET_GAP + row * height;
}

/** A label as laid out this frame, in world pixels. */
export interface PlacedLabel {
  /** Which of the customers laid out wears it. */
  readonly index: number;
  readonly frame: LabelFrame;
  /** 0 under the feet, 1 a row lower. */
  readonly row: number;
  /** Where it rests on its row, with the camera at rest. */
  readonly left: number;
  readonly top: number;
  /** Whole pixels the pop lifts it above `top`: the frame's `rise`, cut short where a label above leaves less room. */
  readonly lift: number;
  /**
   * Where it is drawn this frame: lifted, and moved with every other label
   * where a shake or the boss bar's bounce would carry one off the screen
   * or into the HUD.
   */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /**
   * Whether it is drawn in front of the foreground, so no post cuts a word
   * out of it. Every label is, except one that meets a character: that one
   * stays behind the characters, so a sprite always stands in front of it.
   */
  readonly front: boolean;
}

/**
 * The screen in the world this frame, in world pixels. A shake moves the
 * street under the HUD and the boss bar bounces as it rises, so the layout
 * reads the screen twice: at rest for the choices a shake must not flip
 * (who wears a label, and on which row), and as drawn, so that neither the
 * screen's edge nor the HUD ever cuts a label.
 */
export interface LabelScreen {
  readonly width: number;
  /** The left edge with the camera at rest. */
  readonly restLeft: number;
  /** The row where the HUD along the bottom begins once settled, with the camera at rest. */
  readonly restBottom: number;
  /** The left edge as drawn, shake included. */
  readonly left: number;
  /**
   * The row labels keep above as drawn, shake included: where the HUD along
   * the bottom settles or where it is this frame (the boss bar bounces up
   * past its place as it rises), whichever is higher.
   */
  readonly bottom: number;
}

/** The player or a customer, as far as a label meeting them goes. */
export interface LabelCharacter {
  readonly feet: number;
  readonly body: Readonly<Rect>;
}

/** Where the player stands: where labels compete for room, the one nearer it wins. */
export interface LabelFocus extends LabelCharacter {
  readonly centerX: number;
}

/** No row: a newcomer had none in the last layout, and a label waiting for room gets none. */
const UNPLACED = -1;

interface Slot {
  /** Held only while laying out, so the layout keeps no customer alive. */
  customer: Customer | null;
  index: number;
  frame: LabelFrame;
  left: number;
  top: number;
  lift: number;
  x: number;
  y: number;
  /** The top of row 0, under the feet. */
  floor: number;
  /** How many rows, from row 0, end above the HUD. */
  rows: number;
  row: number;
  width: number;
  height: number;
  /** The row this customer's label showed on in the last layout, or `UNPLACED` for a newcomer. */
  lastRow: number;
  /** Lays out before a higher tier: 0 unhappy and labelled, 1 unhappy and new, 2 and 3 likewise happy. */
  tier: number;
  /** Squared, from the player, for order within a tier. */
  distance: number;
  front: boolean;
}

/**
 * Decides where every customer's label goes. Each hangs under its own
 * customer's feet; where two would meet side by side (customers closer than
 * a label is wide, which is most of a crowd), the second steps down a row,
 * staying centred under its customer, so labels never run into one line or
 * cover each other. A label finding no row clear of the others and of the
 * HUD along the screen's bottom waits until the crowd parts: a third in the
 * same stretch, or a second while the boss bar or the control hints take
 * the second row's place.
 *
 * The labels shake with the street as one layer, so a shake never moves one
 * against another or flips a row: where it would carry one off the screen or
 * into the HUD, or where the boss bar bounces up past its settled place, all
 * of them are held back together, just far enough.
 *
 * Labels claim room in order of who needs one most: unhappy customers
 * before happy ones (a won-over customer strolling off is no threat), then
 * those whose label is showing (so a newcomer never bumps one), then
 * nearest the player. A label keeps its row while it fits, so labels move
 * only when they have to, even when that leaves an unhappy label a row
 * under a happy one.
 *
 * The layout remembers, weakly, the row each label showed on in the last
 * layout its customer was in. A customer it did not label then (off screen,
 * dropping in, or waiting for room) is a newcomer when it is next laid out.
 * Slots are reused from frame to frame, so once the busiest frame has been
 * seen laying out creates no objects, arrays or strings (the engine may
 * still box the odd decimal number it passes around), and no level
 * outlives itself here.
 */
export class LabelLayout {
  readonly #slots: Slot[] = [];
  readonly #lastRows = new WeakMap<Customer, number>();
  #shown = 0;

  /** How many labels show, as of the last layout. */
  get shown(): number {
    return this.#shown;
  }

  /**
   * Lays out this frame's labels on `screen` and returns how many show;
   * `label(i)` reads them, the one that needed it most first.
   */
  update(
    customers: readonly Customer[],
    sizes: Readonly<Record<LabelPicture, LabelSize>>,
    focus: LabelFocus,
    screen: LabelScreen,
    time: number,
    reducedMotion: boolean,
  ): number {
    const slots = this.#slots;
    const lastRows = this.#lastRows;
    const { width: viewWidth, restLeft, restBottom } = screen;
    let count = 0;
    for (let index = 0; index < customers.length; index++) {
      const customer = customers[index] as Customer;
      const centerX = customer.centerX;
      const frame = labelled(centerX, restLeft, viewWidth)
        ? labelFrame(customer.mood, customer.moodAge(time), reducedMotion)
        : null;
      if (frame === null) {
        lastRows.delete(customer);
        continue;
      }
      const { width, height } = sizes[frame.picture];
      const feet = customer.feet;
      const lastRow = lastRows.get(customer) ?? UNPLACED;
      const slot = slots[count] ?? grow(slots);
      count++;
      slot.customer = customer;
      slot.index = index;
      slot.frame = frame;
      slot.width = width;
      slot.height = height;
      slot.left = labelLeft(centerX, width, restLeft, viewWidth);
      slot.floor = labelTop(feet, 0, height);
      slot.rows = Math.min(ROWS, Math.floor((restBottom - slot.floor) / height));
      slot.lastRow = lastRow;
      slot.tier = (frame.picture === 'unhappy' ? 0 : 2) + (lastRow === UNPLACED ? 1 : 0);
      const dx = centerX - focus.centerX;
      const dy = feet - focus.feet;
      slot.distance = dx * dx + dy * dy;
    }
    sortByTier(slots, count);

    // Greedy, neediest first: shown slots gather at the front, in that order.
    let shown = 0;
    for (let index = 0; index < count; index++) {
      const slot = slots[index] as Slot;
      const row = freeRow(slots, shown, slot);
      if (row === UNPLACED) continue;
      place(slot, row);
      slots[index] = slots[shown] as Slot;
      slots[shown] = slot;
      shown++;
    }
    for (let index = 0; index < shown; index++) {
      const slot = slots[index] as Slot;
      if (slot.row > 0 && fits(slots, shown, slot, slot.row - 1, LABEL_GAP + SETTLE)) place(slot, slot.row - 1);
    }
    for (let index = 0; index < shown; index++) {
      const slot = slots[index] as Slot;
      slot.lift = headroom(slots, shown, slot, slot.frame.rise);
    }
    hold(slots, shown, screen);
    for (let index = 0; index < shown; index++) {
      const slot = slots[index] as Slot;
      slot.front = !meets(slot, focus) && !meetsAny(slot, customers);
    }

    for (let index = 0; index < count; index++) {
      const slot = slots[index] as Slot;
      const customer = slot.customer as Customer;
      if (index < shown) lastRows.set(customer, slot.row);
      else lastRows.delete(customer);
      slot.customer = null;
    }
    this.#shown = shown;
    return shown;
  }

  label(index: number): PlacedLabel {
    if (index < 0 || index >= this.#shown) {
      throw new RangeError(`label ${index} is not one of the ${this.#shown} shown`);
    }
    return this.#slots[index] as Slot;
  }
}

/** Grows the pool by one slot, only on a frame with more customers than any before it. */
function grow(slots: Slot[]): Slot {
  const slot: Slot = {
    customer: null,
    index: 0,
    frame: UNHAPPY,
    left: 0,
    top: 0,
    lift: 0,
    x: 0,
    y: 0,
    floor: 0,
    rows: 0,
    row: 0,
    width: 0,
    height: 0,
    lastRow: UNPLACED,
    tier: 0,
    distance: 0,
    front: true,
  };
  slots.push(slot);
  return slot;
}

/** A stable insertion sort of the first `count` slots by tier, then distance: a handful of customers, and no comparator to allocate. */
function sortByTier(slots: Slot[], count: number): void {
  for (let index = 1; index < count; index++) {
    const slot = slots[index] as Slot;
    let at = index;
    for (; at > 0 && before(slot, slots[at - 1] as Slot); at--) slots[at] = slots[at - 1] as Slot;
    slots[at] = slot;
  }
}

function before(a: Slot, b: Slot): boolean {
  return a.tier !== b.tier ? a.tier < b.tier : a.distance < b.distance;
}

function place(slot: Slot, row: number): void {
  slot.row = row;
  slot.top = slot.floor + row * slot.height;
}

/** The row a label takes among the first `shown`: last frame's while it fits, else the highest with room, else none. */
function freeRow(slots: readonly Slot[], shown: number, slot: Slot): number {
  const { lastRow } = slot;
  if (lastRow !== UNPLACED && lastRow < slot.rows && fits(slots, shown, slot, lastRow, LABEL_GAP)) return lastRow;
  for (let row = 0; row < slot.rows; row++) if (fits(slots, shown, slot, row, LABEL_GAP)) return row;
  return UNPLACED;
}

/** Whether `slot` on `row` keeps `gap` pixels to the side of every other of the first `shown`; rows may abut. */
function fits(slots: readonly Slot[], shown: number, slot: Slot, row: number, gap: number): boolean {
  const top = slot.floor + row * slot.height;
  for (let index = 0; index < shown; index++) {
    const other = slots[index] as Slot;
    if (other === slot) continue;
    const beside = slot.left < other.left + other.width + gap && other.left < slot.left + slot.width + gap;
    const level = top < other.top + other.height && other.top < top + slot.height;
    if (beside && level) return false;
  }
  return true;
}

/**
 * How far, up to `rise`, `slot` may be lifted before it would reach the rows
 * of one of the first `shown` labels above it and within `LABEL_GAP` side by
 * side, as no two labels stand on their rows.
 */
function headroom(slots: readonly Slot[], shown: number, slot: Slot, rise: number): number {
  let room = rise;
  for (let index = 0; room > 0 && index < shown; index++) {
    const other = slots[index] as Slot;
    const above = other.top + other.height <= slot.top;
    const beside = slot.left < other.left + other.width + LABEL_GAP && other.left < slot.left + slot.width + LABEL_GAP;
    if (other !== slot && above && beside) room = Math.min(room, slot.top - other.top - other.height);
  }
  return room;
}

/**
 * Places the first `shown` labels where they are drawn: lifted, and moved
 * together as far as `screen` as drawn needs to hold them all on it and
 * above its HUD. Every one fits the screen at rest, so they never move
 * further than the shake and the bar's bounce.
 */
function hold(slots: readonly Slot[], shown: number, screen: LabelScreen): void {
  let leftmost = Number.POSITIVE_INFINITY;
  let rightmost = Number.NEGATIVE_INFINITY;
  let lowest = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < shown; index++) {
    const slot = slots[index] as Slot;
    leftmost = Math.min(leftmost, slot.left);
    rightmost = Math.max(rightmost, slot.left + slot.width);
    lowest = Math.max(lowest, slot.top - slot.lift + slot.height);
  }
  const dx = Math.max(0, screen.left - leftmost) + Math.min(0, screen.left + screen.width - rightmost);
  const dy = Math.min(0, screen.bottom - lowest);
  for (let index = 0; index < shown; index++) {
    const slot = slots[index] as Slot;
    slot.x = slot.left + dx;
    slot.y = slot.top - slot.lift + dy;
  }
}

/**
 * Whether `slot` as drawn meets `character`'s sprite: the rows above their
 * feet, and their hitbox widened by half on either side, which holds every
 * look's art (the regular customer's 18 px on its 14 px hitbox, the
 * escalated one's about 40 px on 26).
 */
function meets(slot: Slot, character: LabelCharacter): boolean {
  const { x, y, w } = character.body;
  const reach = w / 2;
  const beside = slot.x < x + w + reach && x - reach < slot.x + slot.width;
  return beside && slot.y < character.feet && y < slot.y + slot.height;
}

function meetsAny(slot: Slot, customers: readonly Customer[]): boolean {
  for (let index = 0; index < customers.length; index++) if (meets(slot, customers[index] as Customer)) return true;
  return false;
}
