import type { Raycaster } from 'three';
import type { InteractionHit } from '../interaction/Interactable';
import type { DeviceTarget, RadioDevice } from './deviceContract';
import type { RadioPartsTarget } from './RadioInteractable';

/** The device as the parts need it, once prepared. */
export type PartsDevice = Pick<
  RadioDevice,
  'pick' | 'pointerDown' | 'pointerMove' | 'pointerUp' | 'activate' | 'hover'
>;

/**
 * The radio view's half of the radio's click target (RadioInteractable has the body and the surroundings, in the
 * room's first load): the device's parts under the pointer. A floating disc attends on hover and is picked on press,
 * the disc in the well and the keys answer with a pointer, and the lid is used like the body (nothing).
 */
export class RadioParts implements RadioPartsTarget {
  readonly #targets = new WeakMap<InteractionHit, DeviceTarget>();
  #owning = false;
  readonly #device: () => PartsDevice | null;

  constructor(device: () => PartsDevice | null) {
    this.#device = device;
  }

  intersect(raycaster: Raycaster): { readonly hit: InteractionHit; readonly distance: number } | null {
    const part = this.#device()?.pick(raycaster);
    if (!part) return null;
    this.#targets.set(part.hit, part.target);
    return { hit: part.hit, distance: part.distance };
  }

  cursor(hit: InteractionHit): string {
    const target = this.#targets.get(hit);
    return target === undefined || target.kind === 'lid' ? 'default' : 'pointer';
  }

  activate(hit: InteractionHit): void {
    const target = this.#targets.get(hit);
    if (target && target.kind !== 'lid') this.#device()?.activate(target);
  }

  pointerDown(hit: InteractionHit, pointerType: string): boolean {
    const target = this.#targets.get(hit);
    this.#owning = target !== undefined && (this.#device()?.pointerDown(target, pointerType) ?? false);
    return this.#owning;
  }

  pointerMove(hit: InteractionHit | null): void {
    const part = (hit && this.#targets.get(hit)) ?? null;
    if (this.#owning) this.#device()?.pointerMove(part);
    else this.#device()?.hover(part);
  }

  pointerUp(cancelled: boolean): void {
    if (!this.#owning) return;
    this.#owning = false;
    this.#device()?.pointerUp(cancelled);
  }

  pointerLeave(): void {
    if (!this.#owning) this.#device()?.hover(null);
  }
}
