import { TITLE_BACKDROPS } from '@/game/scenes/title/backdrops';
import { TITLE_LOCKUPS } from '@/game/scenes/title/lockups';
import type { TitleVariant } from '@/game/scenes/title/TitleVariant';
import { TITLE_TIMES } from '@/game/scenes/title/titleTimeline';
import { TITLE_DEFAULTS } from '@/game/scenes/title/variants';
import type { Board } from './board';
import type { Subject } from './subject';
import { framesUntil, type Timeline } from './timeline';

/** The intro, the lock and flash, and the settled title through its first glint. */
const TITLE_TIMELINE: Timeline = {
  frames: framesUntil(6),
  loops: false,
  beats: [
    { frame: 0, label: 'hit' },
    { frame: framesUntil(TITLE_TIMES.slideStart), label: 'slide' },
    { frame: framesUntil(TITLE_TIMES.slideEnd), label: 'lock' },
    { frame: framesUntil(TITLE_TIMES.flashStart), label: 'flash' },
    { frame: framesUntil(TITLE_TIMES.settled), label: 'settled' },
  ],
};

/** The title scene: a lockup on a backdrop, each picked from its registry (docs/ARCHITECTURE.md › Title variants). */
export const titleSubject: Subject = {
  id: 'title',
  label: 'Title',
  pickers: [
    { id: 'lockup', label: 'Lockup', choices: TITLE_LOCKUPS, current: TITLE_DEFAULTS.lockup },
    { id: 'backdrop', label: 'Backdrop', choices: TITLE_BACKDROPS, current: TITLE_DEFAULTS.backdrop },
  ],
  timeline: TITLE_TIMELINE,
  show: (picks) => ({
    spec: {
      scene: 'title',
      params: {
        lockup: registered(TITLE_LOCKUPS, picks.lockup) ?? TITLE_DEFAULTS.lockup,
        backdrop: registered(TITLE_BACKDROPS, picks.backdrop) ?? TITLE_DEFAULTS.backdrop,
      },
    },
    looks: {},
  }),
};

export const lockupBoard: Board = {
  id: 'lockups',
  title: 'Title lockup',
  summary: 'Every lockup, on the same backdrop.',
  rows: [{ subject: titleSubject }],
  compares: 'lockup',
  shares: ['backdrop'],
};

export const backdropBoard: Board = {
  id: 'backdrops',
  title: 'Backdrop',
  summary: 'Every backdrop, behind the same lockup.',
  rows: [{ subject: titleSubject }],
  compares: 'backdrop',
  shares: ['lockup'],
};

/** `id` as the registry's own id type, if a variant by that id is registered. */
function registered<V extends TitleVariant>(registry: readonly V[], id: string | undefined): V['id'] | undefined {
  return registry.find((variant) => variant.id === id)?.id;
}
