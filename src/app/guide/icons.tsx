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
