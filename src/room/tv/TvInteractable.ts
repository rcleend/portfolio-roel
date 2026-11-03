import type { Mesh, Object3D } from 'three';
import type { GameSurface } from '@/engine/core/GameSurface';
import type { PointerKind } from '@/engine/input/InputSnapshot';
import { type Interactable, type InteractionHit, type RoomCursor, roomCursorOf } from '../interaction/Interactable';
import { type NativePoint, type UvRect, uvToNativePixel } from './screenMapping';
import type { TvModel } from './tvModel';

export interface TvInteractableOptions {
  readonly tv: TvModel;
  readonly surface: GameSurface;
  readonly contentRect: UvRect;
  /** True while the camera is settled on the TV and the picture is up. */
  readonly isPlayable: () => boolean;
  /** True while the camera is in (or heading to) the room view. */
  readonly isInRoomView: () => boolean;
  readonly focusTv: () => void;
  /** While true, a touch on the set (bezel, bottom panel) or below its top presses the game too: the title's PRESS TO BEGIN. */
  readonly tapToBegin?: () => boolean;
}

/**
 * The television as an interactable. In the room view it is a button that brings the
 * viewer back to it; in the TV view its glass is the game's pointer surface, translating
 * ray hits into native pixel coordinates.
 */
export class TvInteractable implements Interactable {
  readonly id = 'tv';
  readonly object: Object3D;
  readonly gestureSurface: Mesh;
  private overPicture = false;
  private pressed = false;

  constructor(private readonly options: TvInteractableOptions) {
    this.object = options.tv.root;
    this.gestureSurface = options.tv.screen;
  }

  /**
   * In the room view the TV is a way back to it; at the TV its picture is the game's while it plays, with the
   * game's cursor over a level's play.
   */
  cursor(hit: InteractionHit): RoomCursor {
    if (this.options.isInRoomView()) return 'enter';
    if (!this.options.isPlayable() || !this.pixelAt(hit, false)) return 'idle';
    return roomCursorOf(this.options.surface.cursor);
  }

  activate(): void {
    if (this.options.isInRoomView()) this.options.focusTv();
  }

  pointerDown(hit: InteractionHit, pointerType?: string): boolean {
    if (!this.options.isPlayable()) return false;
    const pixel = this.pixelAt(hit, false);
    // Beside the picture, on the set's bezel or its bottom panel: a finger begins the game all the same.
    if (!pixel) return this.pressToBegin(pointerType);
    const kind = pointerKind(pointerType ?? 'mouse');
    this.options.surface.pointer.move(pixel.x, pixel.y, kind);
    this.options.surface.pointer.down(kind);
    this.overPicture = true;
    this.pressed = true;
    return true;
  }

  /**
   * A finger anywhere off the picture (the set, the cabinet under it, the floor, the room beside it) presses the game
   * while the title waits for a tap: `down()` without a move, `up()` on release. True when it took the gesture.
   */
  pressToBegin(pointerType?: string): boolean {
    if (pointerType === 'mouse' || !this.options.isPlayable() || !this.options.tapToBegin?.()) return false;
    this.options.surface.pointer.down(pointerKind(pointerType ?? 'touch'));
    this.pressed = true;
    return true;
  }

  pointerMove(hit: InteractionHit | null, pointerType = 'mouse'): void {
    if (!this.options.isPlayable()) return;
    const pixel = this.pixelAt(hit, this.pressed);
    if (pixel) {
      this.options.surface.pointer.move(pixel.x, pixel.y, pointerKind(pointerType));
      this.overPicture = true;
    } else if (!this.pressed) {
      this.pointerLeave();
    }
  }

  pointerUp(): void {
    if (!this.pressed) return;
    this.pressed = false;
    this.options.surface.pointer.up();
  }

  pointerLeave(): void {
    if (!this.overPicture || this.pressed) return;
    this.overPicture = false;
    this.options.surface.pointer.leave();
  }

  /** Ends any gesture and hover, e.g. when the camera leaves the TV. */
  release(): void {
    this.pointerUp();
    this.pointerLeave();
  }

  private pixelAt(hit: InteractionHit | null, clamp: boolean): NativePoint | null {
    if (!hit?.uv || hit.object !== this.options.tv.screen) return null;
    return uvToNativePixel(hit.uv.x, hit.uv.y, this.options.contentRect, this.options.surface, clamp);
  }
}

/** The game's name for a DOM pointer's device: a finger or a pen taps, anything else is a mouse. */
function pointerKind(pointerType: string): PointerKind {
  return pointerType === 'touch' || pointerType === 'pen' ? pointerType : 'mouse';
}
