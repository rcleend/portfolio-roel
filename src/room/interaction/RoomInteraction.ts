import { type Camera, type Intersection, type Mesh, Raycaster, Vector2 } from 'three';
import { meshesOf } from '../assets/modelQueries';
import { type IdleTask, type IdleWork, QUIET } from '../stage/IdleWork';
import type { Interactable, InteractionHit } from './Interactable';
import { pickedMesh, pickMeshes, pickMeshesInSteps } from './pickMeshes';

export interface RoomInteractionOptions {
  readonly canvas: HTMLCanvasElement;
  readonly camera: Camera;
  /** A click or tap that hit no interactable. */
  readonly onMiss: () => void;
  /** Cursor when the pointer is over nothing interactive. */
  readonly idleCursor: () => string;
  /** Pointer position in NDC for the camera parallax, or null when it leaves or is a touch. */
  readonly onPointer?: (ndc: Vector2 | null) => void;
  /** While false (e.g. during a camera flight) clicks and gestures are ignored. */
  readonly isEnabled: () => boolean;
  /**
   * Where large meshes are cut into pick chunks, off the room's first frame; until a cut is done
   * its interactable's rays test the whole meshes. Without it they are cut as they are registered.
   */
  readonly background?: Pick<IdleWork, 'add'>;
  /**
   * While true, a press on the room leaves keyboard focus where it is instead of moving it to the
   * stage (no compatibility mouse events, so no focus change). The click itself still happens.
   */
  readonly keepsFocus?: () => boolean;
  /** The interactable under the pointer changed (null: none, or the pointer left). */
  readonly onHover?: (interactable: Interactable | null) => void;
}

/** An interactable and the meshes its rays test. */
interface Registered {
  readonly interactable: Interactable;
  meshes: Mesh[];
}

/** Further than this (CSS px) between press and release, and it was a drag, not a click. */
const CLICK_SLOP = 6;

/**
 * Turns DOM pointer events on the stage canvas into hits on registered interactables:
 * hover cursors, clicks/taps, and full gestures for interactables that want them.
 */
export class RoomInteraction {
  /** Each interactable with the meshes its rays test (large ones cut into chunks once, see pickMeshes). */
  private readonly interactables = new Map<string, Registered>();
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private hovered: Interactable | null = null;
  /** A mouse rests over the canvas (at `ndc`): what lies under it is picked again when the view changes. */
  private over = false;
  private gesture: { pointerId: number; owner: Interactable | null; x: number; y: number } | null = null;

  constructor(private readonly options: RoomInteractionOptions) {
    const { canvas } = options;
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerCancel);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
  }

  register(interactable: Interactable): () => void {
    if (this.interactables.has(interactable.id))
      throw new Error(`Interactable "${interactable.id}" is already registered`);
    const { background } = this.options;
    // A custom ray test owns its own targets: nothing to collect, nothing to cut.
    const custom = interactable.intersect !== undefined;
    const registered: Registered = {
      interactable,
      meshes: custom ? [] : background ? meshesOf(interactable.object) : pickMeshes(interactable.object),
    };
    this.interactables.set(interactable.id, registered);
    const cancelCut = custom
      ? undefined
      : background?.add(
          (function* (): IdleTask {
            // Picking matters in the room view, where nothing plays: no unit goes between the game's frames.
            const steps = pickMeshesInSteps(interactable.object);
            for (;;) {
              yield QUIET;
              const step = steps.next();
              if (step.done) {
                registered.meshes = step.value;
                return;
              }
            }
          })(),
        );
    return () => {
      cancelCut?.();
      if (this.hovered === interactable) this.setHovered(null);
      this.interactables.delete(interactable.id);
    };
  }

  /** Re-evaluates the hover and the cursor, e.g. after the view changed under a resting pointer. */
  refreshCursor(): void {
    const found = this.over ? this.pick() : null;
    this.setHovered(found?.interactable ?? null, true);
    this.options.canvas.style.cursor = found ? found.interactable.cursor(found.hit) : this.options.idleCursor();
  }

  dispose(): void {
    const { canvas } = this.options;
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerCancel);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.interactables.clear();
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.setNdc(event);
    this.over = event.pointerType === 'mouse';
    this.options.onPointer?.(event.pointerType === 'mouse' ? this.ndc.clone() : null);
    const owner = this.gesture?.pointerId === event.pointerId ? this.gesture.owner : null;
    if (owner) {
      owner.pointerMove?.(this.hitOn(owner));
      return;
    }
    const found = this.pick();
    this.setHovered(found?.interactable ?? null);
    if (found) {
      found.interactable.pointerMove?.(found.hit);
      this.options.canvas.style.cursor = found.interactable.cursor(found.hit);
    } else {
      this.options.canvas.style.cursor = this.options.idleCursor();
    }
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.options.keepsFocus?.()) event.preventDefault();
    if (!event.isPrimary || event.button !== 0 || !this.options.isEnabled()) return;
    this.setNdc(event);
    const found = this.pick();
    let owner: Interactable | null = null;
    if (found?.interactable.pointerDown?.(found.hit, event.pointerType)) {
      owner = found.interactable;
      this.options.canvas.setPointerCapture(event.pointerId);
    }
    this.gesture = { pointerId: event.pointerId, owner, x: event.clientX, y: event.clientY };
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    this.gesture = null;
    if (gesture.owner) {
      gesture.owner.pointerUp?.(false);
      if (this.options.canvas.hasPointerCapture(event.pointerId)) {
        this.options.canvas.releasePointerCapture(event.pointerId);
      }
      return;
    }
    const travelled = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
    if (travelled > CLICK_SLOP || !this.options.isEnabled()) return;
    this.setNdc(event);
    const found = this.pick();
    if (found) found.interactable.activate(found.hit);
    else this.options.onMiss();
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.gesture?.pointerId !== event.pointerId) return;
    this.gesture.owner?.pointerUp?.(true);
    this.gesture = null;
  };

  private readonly onPointerLeave = (): void => {
    this.over = false;
    this.options.onPointer?.(null);
    if (!this.gesture?.owner) this.setHovered(null);
  };

  /** `again`: say it even when it is the prop already hovered, for a listener that may have let go of it. */
  private setHovered(next: Interactable | null, again = false): void {
    if (next === this.hovered && !again) return;
    if (next !== this.hovered) this.hovered?.pointerLeave?.();
    this.hovered = next;
    this.options.onHover?.(next);
  }

  private setNdc(event: PointerEvent): void {
    const rect = this.options.canvas.getBoundingClientRect();
    this.ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  private pick(): { interactable: Interactable; hit: InteractionHit } | null {
    this.raycaster.setFromCamera(this.ndc, this.options.camera);
    let best: { interactable: Interactable; hit: InteractionHit; distance: number } | null = null;
    for (const registered of this.interactables.values()) {
      const found = this.cast(registered);
      if (found && (!best || found.distance < best.distance))
        best = { interactable: registered.interactable, ...found };
    }
    return best;
  }

  private hitOn(interactable: Interactable): InteractionHit | null {
    this.raycaster.setFromCamera(this.ndc, this.options.camera);
    const surface = interactable.gestureSurface;
    if (surface) {
      const intersection = this.raycaster.intersectObject(surface, true)[0];
      return intersection ? toHit(intersection) : null;
    }
    const registered = this.interactables.get(interactable.id);
    return registered ? (this.cast(registered)?.hit ?? null) : null;
  }

  /** The nearest hit of the current ray on one interactable: its own ray test, or its meshes. */
  private cast({ interactable, meshes }: Registered): { hit: InteractionHit; distance: number } | null {
    if (interactable.intersect) return interactable.intersect(this.raycaster);
    const intersection = this.raycaster.intersectObjects(meshes, false)[0];
    return intersection ? { hit: toHit(intersection), distance: intersection.distance } : null;
  }
}

function toHit(intersection: Intersection): InteractionHit {
  return { object: pickedMesh(intersection.object), point: intersection.point, uv: intersection.uv ?? null };
}
