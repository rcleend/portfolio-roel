import { useEffect, useState } from 'react';
import type { HostView } from '../../hosts/types';
import { browserStorage } from '../../storage/localFlag';
import {
  hintFor,
  hintText,
  loadViewHintProgress,
  recordView,
  saveViewHintProgress,
  type ViewHintKind,
} from './hintProgress';
import './ViewHint.css';

export interface ViewHintProps {
  readonly view: HostView;
  /** False until the game is running in the room, so the hint never covers the loading screen or boot. */
  readonly active: boolean;
  readonly touch: boolean;
}

/** Let the boot logo have the stage before suggesting the visitor look away from it. */
const FIRST_HINT_DELAY_MS = 4500;
/** After a camera flight, wait for it to land. */
const LANDED_HINT_DELAY_MS = 1200;

/**
 * An unobtrusive caption teaching the room's gestures: looking around, looking
 * closer and getting up from the computer. Each line retires for good once the
 * visitor has done what it says.
 */
export function ViewHint({ view, active, touch }: ViewHintProps) {
  const [storage] = useState(browserStorage);
  const [progress, setProgress] = useState(() => loadViewHintProgress(storage));
  const [shown, setShown] = useState<ViewHintKind | null>(null);
  // Keeps the last text while fading out, so the caption does not go blank mid-fade.
  const [lastKind, setLastKind] = useState<ViewHintKind | null>(null);

  useEffect(() => {
    if (!active) return;
    setProgress((current) => {
      const next = recordView(current, view);
      if (next !== current) saveViewHintProgress(storage, next);
      return next;
    });
  }, [active, view, storage]);

  const wanted = active ? hintFor(progress, view, touch) : null;
  useEffect(() => {
    setShown(null);
    if (!wanted) return;
    const timer = window.setTimeout(
      () => {
        setShown(wanted);
        setLastKind(wanted);
      },
      wanted === 'look-around' ? FIRST_HINT_DELAY_MS : LANDED_HINT_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [wanted]);

  return (
    <p
      className={touch ? 'view-hint view-hint--top' : 'view-hint'}
      data-view={view}
      data-visible={shown ? 'true' : 'false'}
      aria-hidden={shown ? undefined : true}
      role="status"
    >
      {lastKind ? (
        <>
          <span className="view-hint__marker" aria-hidden="true">
            ▸
          </span>
          {hintText(lastKind, touch)}
        </>
      ) : null}
    </p>
  );
}
