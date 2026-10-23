import { pixelPath } from '../pixel/pixelPath';
import './SoundToggle.css';

const SPEAKER = pixelPath([
  '......#.......',
  '.....##.......',
  '....###.......',
  '...####.......',
  '#######.......',
  '#######.......',
  '#######.......',
  '#######.......',
  '...####.......',
  '....###.......',
  '.....##.......',
  '......#.......',
]);

const WAVES = pixelPath([
  '..............',
  '..........#...',
  '...........#..',
  '........#...#.',
  '.........#..#.',
  '.........#..#.',
  '.........#..#.',
  '.........#..#.',
  '........#...#.',
  '...........#..',
  '..........#...',
  '..............',
]);

const CROSS = pixelPath([
  '..............',
  '..............',
  '..............',
  '........#...#.',
  '.........#.#..',
  '..........#...',
  '.........#.#..',
  '........#...#.',
  '..............',
  '..............',
  '..............',
  '..............',
]);

export interface SoundToggleProps {
  readonly muted: boolean;
  onToggle(): void;
}

/**
 * Pixel speaker in the top-right corner. A real toggle button (`aria-pressed`
 * = muted) reachable with Tab; a mouse click does not take focus from the
 * game, so play continues with the keyboard right after.
 */
export function SoundToggle({ muted, onToggle }: SoundToggleProps) {
  return (
    <button
      type="button"
      className="sound-toggle"
      aria-label="Mute sound"
      aria-pressed={muted}
      title={muted ? 'Sound off' : 'Sound on'}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onToggle}
    >
      <svg viewBox="0 0 14 12" shapeRendering="crispEdges" aria-hidden="true">
        <path className="sound-toggle__shadow" d={SPEAKER} transform="translate(1 1)" />
        <path className="sound-toggle__shadow" d={muted ? CROSS : WAVES} transform="translate(1 1)" />
        <path className="sound-toggle__speaker" d={SPEAKER} />
        <path className={muted ? 'sound-toggle__cross' : 'sound-toggle__waves'} d={muted ? CROSS : WAVES} />
      </svg>
    </button>
  );
}
