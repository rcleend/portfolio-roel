import { useEffect, useRef, useState } from 'react';
import type { LitProp, PropSpotlight, RoomTarget } from '@/room';
import { PROP_NAMES } from './propNames';

/**
 * The word over the prop in the light (docs/ART-DIRECTION.md › The room's UI): it pops up off the prop's top as the
 * prop bounces, and rides it there. The room says where on every frame the prop moves; this writes the position
 * straight to the element, so a bounce never re-renders React. Decoration only: the menu and the stage say the same
 * to screen readers.
 */
export function PropLabel({ spotlight }: { readonly spotlight: PropSpotlight }) {
  const plate = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<RoomTarget | null>(spotlight.lit?.target ?? null);
  // The last word stays while the label fades out.
  const [word, setWord] = useState<RoomTarget | null>(target);
  if (target !== null && target !== word) setWord(target);

  useEffect(() => {
    const place = (lit: LitProp | null): void => {
      const element = plate.current;
      if (lit && element) element.style.transform = `translate3d(${Math.round(lit.x)}px, ${Math.round(lit.y)}px, 0)`;
    };
    place(spotlight.lit);
    return spotlight.onChange((lit) => {
      place(lit);
      setTarget(lit?.target ?? null);
    });
  }, [spotlight]);

  return (
    <div ref={plate} className="prop-label" aria-hidden="true" data-shown={target !== null}>
      {/* Keyed by the prop, so the next prop's word pops in afresh. */}
      <span key={word} className="prop-label__word">
        {word ? PROP_NAMES[word] : null}
      </span>
    </div>
  );
}
