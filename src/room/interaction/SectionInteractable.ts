import type { Object3D } from 'three';
import type { ViewController } from '../ViewController';
import type { RoomSection } from '../viewState';
import type { Interactable } from './Interactable';

/** A section's real meshes act as its target; no large invisible hit planes. */
export class SectionInteractable implements Interactable {
  constructor(
    readonly id: string,
    readonly object: Object3D,
    private readonly section: RoomSection,
    private readonly views: Pick<ViewController, 'view' | 'request'>,
  ) {}

  cursor(): string {
    return this.views.view === this.section || this.views.view === 'tv' ? 'zoom-out' : 'zoom-in';
  }

  activate(): void {
    // Preserve the TV's existing outside-click gesture before exploring individual props.
    const next = this.views.view === this.section || this.views.view === 'tv' ? 'room' : this.section;
    this.views.request(next);
  }
}
