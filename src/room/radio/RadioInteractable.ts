import { Box3, type Mesh, Object3D, type Raycaster, Vector3 } from 'three';
import type { Interactable, InteractionHit, RoomCursor } from '../interaction/Interactable';
import type { RoomView } from '../viewState';

/** The radio view's half of the target: the device's parts under the pointer (RadioParts, in the radio's chunk). */
export type RadioPartsTarget = Required<Omit<Interactable, 'id' | 'object' | 'gestureSurface'>>;

/** The radio as the interactable needs it (RadioDoorHandle): whether it works, and its parts once loaded. */
export interface RadioDeckTargets {
  readonly available: boolean;
  readonly parts: RadioPartsTarget | null;
  prefetch(reason: 'intent'): void;
}

export interface RadioInteractableOptions {
  /** The radio's root: the interactable's object. */
  readonly root: Object3D;
  readonly bodyBounds: Box3;
  /** The cabinet mesh, merged with the floor books and the mains cable: only hits in `CABINET_X` count. */
  readonly cabinet: Mesh | null;
  readonly views: { readonly view: RoomView; request(view: RoomView): void };
  readonly deck: RadioDeckTargets;
}

/** The lava lamp, glass and base, as a click target. */
export const LAMP_PROXY = new Box3(new Vector3(0.42, 0.88, -2.04), new Vector3(0.56, 1.39, -1.9));
/** The cabinet proper inside `04_Drawer_surfaces`, which also holds the floor books (x < 0.30) and the cable (x > 1.40). */
export const CABINET_X = { min: 0.3, max: 1.4 } as const;

/**
 * The radio, its cabinet and the lava lamp as one click target (docs/ROOM.md › The CD player):
 *
 * | View | Floating disc | Disc in the well | Keys | Radio body | Cabinet, lamp |
 * | --- | --- | --- | --- | --- | --- |
 * | tv, pc | — | — | — | nothing (the room's miss) | nothing |
 * | room | — | — | — | zoom-in, flies to the radio; hover prefetches | same |
 * | radio | pointer: hover attends, press picks | pointer: ▷II | pointer: pressed while held | default, nothing | zoom-out, the room |
 *
 * At the radio the device's parts win over the body (a proxy box 3 mm bigger than it), which wins over the
 * surroundings. The parts are the radio's lazy chunk's (RadioParts): this half, the room's first load, is the body and
 * the surroundings, and any hit it did not make is theirs. A radio that cannot work answers nothing anywhere.
 */
export class RadioInteractable implements Interactable {
  readonly id = 'radio';
  readonly object: Object3D;
  readonly #body: Box3;
  /** The cabinet proper: a ray that misses it never tests the mesh. */
  readonly #cabinetBox = new Box3();
  readonly #proxy = new Object3D();
  /** This half's hits, the body's (true) and the surroundings' (false). */
  readonly #hits = new WeakMap<InteractionHit, boolean>();

  readonly #options: RadioInteractableOptions;

  constructor(options: RadioInteractableOptions) {
    this.#options = options;
    this.object = options.root;
    this.#body = options.bodyBounds.clone().expandByScalar(0.003);
    if (options.cabinet) this.#cabinetBox.setFromObject(options.cabinet);
    this.#cabinetBox.min.x = Math.max(this.#cabinetBox.min.x, CABINET_X.min);
    this.#cabinetBox.max.x = Math.min(this.#cabinetBox.max.x, CABINET_X.max);
  }

  intersect(raycaster: Raycaster): { readonly hit: InteractionHit; readonly distance: number } | null {
    const { views, deck, cabinet } = this.#options;
    if (!deck.available || views.view === 'tv' || views.view === 'pc') return null;
    const part = views.view === 'radio' ? (this.#parts?.intersect(raycaster) ?? null) : null;
    if (part) return part;
    const ray = raycaster.ray;
    const body = ray.intersectBox(this.#body, new Vector3());
    if (body) return this.#found(true, { object: this.#proxy, point: body, uv: null }, body.distanceTo(ray.origin));
    const lamp = ray.intersectBox(LAMP_PROXY, new Vector3());
    const shelf =
      cabinet && ray.intersectsBox(this.#cabinetBox)
        ? raycaster
            .intersectObject(cabinet, false)
            .find((hit) => hit.point.x >= CABINET_X.min && hit.point.x <= CABINET_X.max)
        : undefined;
    const lampDistance = lamp ? lamp.distanceTo(ray.origin) : Infinity;
    if (shelf && shelf.distance < lampDistance) {
      return this.#found(false, { object: shelf.object, point: shelf.point, uv: null }, shelf.distance);
    }
    return lamp ? this.#found(false, { object: this.#proxy, point: lamp, uv: null }, lampDistance) : null;
  }

  cursor(hit: InteractionHit): RoomCursor {
    if (this.#options.views.view === 'room') return 'enter';
    const body = this.#hits.get(hit);
    return body === undefined ? (this.#parts?.cursor(hit) ?? 'idle') : body ? 'idle' : 'leave';
  }

  activate(hit: InteractionHit): void {
    const { views } = this.#options;
    const body = this.#hits.get(hit);
    if (views.view === 'room') views.request('radio');
    else if (views.view !== 'radio' || body) return;
    else if (body === false) views.request('room');
    else this.#parts?.activate(hit);
  }

  pointerDown(hit: InteractionHit, pointerType: string): boolean {
    if (this.#options.views.view !== 'radio' || this.#hits.has(hit)) return false;
    return this.#parts?.pointerDown(hit, pointerType) ?? false;
  }

  pointerMove(hit: InteractionHit | null): void {
    const { views, deck } = this.#options;
    // Reaching for the radio in the room: get it ready (and its sharper skin) before the click.
    if (views.view === 'room' && hit) deck.prefetch('intent');
    if (views.view === 'radio') this.#parts?.pointerMove(hit && !this.#hits.has(hit) ? hit : null);
  }

  pointerUp(cancelled: boolean): void {
    this.#parts?.pointerUp(cancelled);
  }

  pointerLeave(): void {
    if (this.#options.views.view === 'radio') this.#parts?.pointerLeave();
  }

  get #parts(): RadioPartsTarget | null {
    return this.#options.deck.parts;
  }

  #found(body: boolean, hit: InteractionHit, distance: number) {
    this.#hits.set(hit, body);
    return { hit, distance };
  }
}
