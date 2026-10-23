import { useId, useMemo } from 'react';
import type { Tile } from '../boards/board';
import { LiveScreen } from './LiveScreen';

interface TileCardProps {
  readonly tile: Tile;
  /** The digit that opens this tile, if it has one. */
  readonly shortcut: number | undefined;
  readonly zoom: number;
  readonly crt: boolean;
  readonly reducedMotion: boolean;
  readonly onOpen: (tile: Tile) => void;
}

/** One variant, live, with its name and line from the registry; anywhere on it opens focus mode. */
export function TileCard({ tile, shortcut, zoom, crt, reducedMotion, onOpen }: TileCardProps) {
  const { subject } = tile.row;
  const show = useMemo(() => subject.show(tile.picks), [subject, tile.picks]);
  const description = useId();
  return (
    <li className="tile" data-tile={tile.key} data-current={tile.current || undefined}>
      <LiveScreen show={show} zoom={zoom} crt={crt} reducedMotion={reducedMotion} layer="board" />
      <div className="tile__caption">
        <h3 className="tile__name">
          <button
            type="button"
            className="tile__open"
            aria-describedby={description}
            aria-keyshortcuts={shortcut === undefined ? undefined : String(shortcut)}
            onClick={() => onOpen(tile)}
          >
            {tile.choice.name}
          </button>
        </h3>
        {tile.current ? <span className="badge">Current</span> : null}
        {shortcut === undefined ? null : (
          <span className="key tile__key" title={`Press ${shortcut} to focus`} aria-hidden="true">
            {shortcut}
          </span>
        )}
        <p id={description} className="tile__description">
          {tile.choice.description}
        </p>
      </div>
    </li>
  );
}
