import { type CSSProperties, useId, useMemo, useState } from 'react';
import { type Board, boardTiles, sharedPickers, type Tile } from '../boards/board';
import type { Picks } from '../boards/subject';
import { useElementSize } from '../layout/useElementSize';
import { gridLayout, TILE_GAP, TILE_PADDING } from '../layout/zoom';
import type { TileZoom } from '../state/playgroundState';
import { PickerControl } from './PickerControl';
import { TileCard } from './TileCard';

interface BoardViewProps {
  readonly board: Board;
  /** The picks every tile of this board shares. */
  readonly shared: Picks;
  /** The digit that opens each numbered tile, by tile key. */
  readonly shortcuts: ReadonlyMap<string, number>;
  readonly zoom: TileZoom;
  readonly crt: boolean;
  readonly reducedMotion: boolean;
  readonly onShare: (board: Board, picker: string, choice: string) => void;
  readonly onOpen: (tile: Tile) => void;
}

/** A board's title and shared pickers over its grid of live tiles. */
export function BoardView({ board, shared, shortcuts, zoom, crt, reducedMotion, onShare, onOpen }: BoardViewProps) {
  const tiles = useMemo(() => boardTiles(board, shared), [board, shared]);
  const [grid, setGrid] = useState<HTMLOListElement | null>(null);
  const layout = gridLayout(useElementSize(grid).width, tiles.length, zoom);
  const heading = useId();
  const gridStyle = {
    gridTemplateColumns: `repeat(${layout.columns}, ${layout.tileWidth}px)`,
    gap: TILE_GAP,
    '--tile-padding': `${TILE_PADDING}px`,
  } as CSSProperties;
  return (
    <section className="board" id={board.id} aria-labelledby={heading} data-board={board.id}>
      <header className="board__header">
        <div className="board__heading">
          <h2 id={heading} className="board__title">
            {board.title}
          </h2>
          <p className="board__summary">{board.summary}</p>
        </div>
        {sharedPickers(board).map((picker) => (
          <PickerControl
            key={picker.id}
            picker={picker}
            value={shared[picker.id] ?? picker.current}
            onChange={(choice) => onShare(board, picker.id, choice)}
          />
        ))}
      </header>
      <ol ref={setGrid} className="board__grid" style={gridStyle}>
        {tiles.map((tile) => (
          <TileCard
            key={tile.key}
            tile={tile}
            shortcut={shortcuts.get(tile.key)}
            zoom={layout.zoom}
            crt={crt}
            reducedMotion={reducedMotion}
            onOpen={onOpen}
          />
        ))}
      </ol>
    </section>
  );
}
