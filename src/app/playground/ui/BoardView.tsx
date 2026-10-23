import { type CSSProperties, useId, useMemo, useState } from 'react';
import { type Board, boardRows, sharedPickers, type Tile } from '../boards/board';
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

/**
 * A board's title and shared pickers over its rows of live tiles. Every row
 * gets the same columns, so the same choice (a look, say) lines up from row
 * to row.
 */
export function BoardView({ board, shared, shortcuts, zoom, crt, reducedMotion, onShare, onOpen }: BoardViewProps) {
  const rows = useMemo(() => boardRows(board, shared), [board, shared]);
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const widest = Math.max(1, ...rows.map((row) => row.tiles.length));
  const layout = gridLayout(useElementSize(body).width, widest, zoom);
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
      <div ref={setBody} className="board__rows">
        {rows.map(({ row, tiles }) => (
          <div key={row.subject.id} className="board__row">
            {row.group ? <p className="board__group">{row.group}</p> : null}
            {row.title ? <p className="board__row-title">{row.title}</p> : null}
            <ol className="board__grid" style={gridStyle}>
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
          </div>
        ))}
      </div>
    </section>
  );
}
