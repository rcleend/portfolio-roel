import { Box3, type Mesh, Object3D, type Raycaster, Vector3 } from 'three';
import type { Interactable, InteractionHit } from '../interaction/Interactable';
import type { RoomView } from '../viewState';
import type { DeviceTarget, RadioDevice } from './deviceContract';

/** The radio as the interactable needs it (RadioDeckHandle): whether it works, and its device once prepared. */
export interface RadioDeckTargets {
  readonly available: boolean;
  readonly prepared: Pick<
    RadioDevice,
    'pick' | 'pointerDown' | 'pointerMove' | 'pointerUp' | 'activate' | 'hover'
  > | null;
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

/** What a ray met: a part of the device, the radio's body, or its surroundings (the cabinet, the lamp). */
type Target = DeviceTarget | 'body' | 'surroundings';

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
 * surroundings. A radio that cannot work answers nothing anywhere: it is scenery.
 */
export class RadioInteractable implements Interactable {
  readonly id = 'radio';
  readonly object: Object3D;
  readonly #body: Box3;
  /** The cabinet proper: a ray that misses it never tests the mesh. */
  readonly #cabinetBox = new Box3();
  readonly #proxy = new Object3D();
  readonly #targets = new WeakMap<InteractionHit, Target>();
  #owning = false;

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
    const part = views.view === 'radio' ? (deck.prepared?.pick(raycaster) ?? null) : null;
    if (part) return this.#found(part.target, part.hit, part.distance);
    const ray = raycaster.ray;
    const body = ray.intersectBox(this.#body, new Vector3());
    if (body) return this.#found('body', { object: this.#proxy, point: body, uv: null }, body.distanceTo(ray.origin));
    const lamp = ray.intersectBox(LAMP_PROXY, new Vector3());
    const shelf =
      cabinet && ray.intersectsBox(this.#cabinetBox)
        ? raycaster
            .intersectObject(cabinet, false)
            .find((hit) => hit.point.x >= CABINET_X.min && hit.point.x <= CABINET_X.max)
        : undefined;
    const lampDistance = lamp ? lamp.distanceTo(ray.origin) : Infinity;
    if (shelf && shelf.distance < lampDistance) {
      return this.#found('surroundings', { object: shelf.object, point: shelf.point, uv: null }, shelf.distance);
    }
    return lamp ? this.#found('surroundings', { object: this.#proxy, point: lamp, uv: null }, lampDistance) : null;
  }

  cursor(hit: InteractionHit): string {
    const target = this.#targets.get(hit);
    if (this.#options.views.view === 'room') return 'zoom-in';
    if (target === 'surroundings' || target === undefined) return 'zoom-out';
    return target === 'body' || target.kind === 'lid' ? 'default' : 'pointer';
  }

  activate(hit: InteractionHit): void {
    const { views, deck } = this.#options;
    const target = this.#targets.get(hit);
    if (views.view === 'room') views.request('radio');
    else if (views.view !== 'radio' || target === undefined || target === 'body') return;
    else if (target === 'surroundings') views.request('room');
    // The lid, like the body: the visitor is using the radio.
    else if (target.kind !== 'lid') deck.prepared?.activate(target);
  }

  pointerDown(hit: InteractionHit): boolean {
    const target = this.#targets.get(hit);
    if (this.#options.views.view !== 'radio' || typeof target !== 'object') return false;
    this.#owning = this.#options.deck.prepared?.pointerDown(target) ?? false;
    return this.#owning;
  }

  pointerMove(hit: InteractionHit | null): void {
    const { views, deck } = this.#options;
    const target = hit ? this.#targets.get(hit) : undefined;
    // Reaching for the radio in the room: get it ready (and its sharper skin) before the click.
    if (views.view === 'room' && target !== undefined) deck.prefetch('intent');
    if (views.view !== 'radio') return;
    const part = typeof target === 'object' ? target : null;
    if (this.#owning) deck.prepared?.pointerMove(part);
    else deck.prepared?.hover(part);
  }

  pointerUp(): void {
    if (!this.#owning) return;
    this.#owning = false;
    this.#options.deck.prepared?.pointerUp();
  }

  pointerLeave(): void {
    if (!this.#owning && this.#options.views.view === 'radio') this.#options.deck.prepared?.hover(null);
  }

  #found(target: Target, hit: InteractionHit, distance: number) {
    this.#targets.set(hit, target);
    return { hit, distance };
  }
}
