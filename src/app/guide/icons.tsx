import type { RoomTarget } from '@/room';

/**
 * The room UI's line icons: 24 px, white 2 px strokes with round ends, drawn to sit beside Chewy's soft letters.
 * Original drawings; `currentColor` so a forced-colours theme repaints them.
 */
const PROP_ICONS: Readonly<Record<RoomTarget, string>> = {
  // A CRT monitor on its foot.
  pc: 'M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5zM12 16.5v3M8.5 19.5h7',
  // A disc and its hole.
  radio:
    'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM6.8 10.2a5.6 5.6 0 0 1 3.4-3.4',
  // A rabbit-ear television.
  tv: 'M5.5 8h13a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM8.5 3.5 12 7l3.5-3.5',
};

export function PropIcon({ target }: { readonly target: RoomTarget }) {
  return (
    <svg className="guide-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PROP_ICONS[target]} />
    </svg>
  );
}

/**
 * The click-outside pictogram: a little screen, and a pointer leaving it to click the space beside it. The pointer
 * glides out and clicks, a ring spreads from the click, a few times over (RoomGuide.css), then rests outside.
 */
export function ClickOutsideIcon() {
  return (
    <svg className="click-outside" viewBox="0 0 36 24" aria-hidden="true" focusable="false">
      <path
        className="click-outside__screen"
        d="M3.5 5h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM7 21h6"
      />
      <circle className="click-outside__ring" cx="27.5" cy="10.5" r="5" />
      <path className="click-outside__pointer" d="M27.5 10.5v9.2l2.3-2.2 1.6 3.6 1.7-.8-1.6-3.5 3.2-.2z" />
    </svg>
  );
}
