import type { Object3D } from 'three';
import type { Interactable, RoomCursor } from '../interaction/Interactable';
import type { ViewController } from '../ViewController';

/**
 * The computer (CRT, glass, keyboard, mouse) and the desk it stands on, as click targets. Both
 * fly to the computer from the room view; seated at the computer, the computer itself is being
 * used (clicks do nothing) while the desk and everything else get up again. From the TV view
 * they keep the TV's "click outside to look around" gesture.
 */
export class PcInteractable implements Interactable {
  constructor(
    readonly id: 'pc' | 'desk',
    /** Ray-cast target: the device root, or the desk group with its chair and clutter. */
    readonly object: Object3D,
    private readonly views: Pick<ViewController, 'view' | 'request'>,
  ) {}

  cursor(): RoomCursor {
    const { view } = this.views;
    if (view === 'room') return 'enter';
    // Seated at the computer, its own parts are in use; everything else gets up again.
    return view === 'pc' && this.id === 'pc' ? 'idle' : 'leave';
  }

  activate(): void {
    const { view } = this.views;
    if (view === 'room') this.views.request('pc');
    else if (view === 'tv' || this.id === 'desk') this.views.request('room');
  }
}
