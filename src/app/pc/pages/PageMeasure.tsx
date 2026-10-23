import { useLayoutEffect, useRef } from 'react';
import { keepsWithNext, type ResumeBlock } from '../../resume/outline';
import { PAGE_HEIGHT } from '../reader/zoom';
import { paginate } from './paginate';
import { ResumeBlockView } from './ResumePages';

/** The A4 page's margins; blocks fill what is left. */
export const PAGE_MARGIN_TOP = 64;
export const PAGE_MARGIN_BOTTOM = 64;
export const PAGE_CONTENT_HEIGHT = PAGE_HEIGHT - PAGE_MARGIN_TOP - PAGE_MARGIN_BOTTOM;

export interface PageMeasureProps {
  readonly blocks: readonly ResumeBlock[];
  readonly onPaginated: (pages: number[][]) => void;
}

/**
 * Typesets every block once, out of sight, in an A4-wide column with the
 * page's own styles, and paginates by the measured heights: real font
 * metrics, so the pages fit on whatever system fonts the visitor has.
 */
export function PageMeasure({ blocks, onPaginated }: PageMeasureProps) {
  const column = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = column.current;
    if (!element) return;
    // Exact sub-pixel heights (offsetHeight rounds), undoing whatever scale the screen is shown at.
    const scale = element.getBoundingClientRect().width / element.offsetWidth || 1;
    const heights = Array.from(element.children, (child) => child.getBoundingClientRect().height / scale);
    onPaginated(
      paginate(
        blocks.map((block, index) => ({ height: heights[index] ?? 0, keepWithNext: keepsWithNext(block) })),
        PAGE_CONTENT_HEIGHT,
      ),
    );
  }, [blocks, onPaginated]);
  return (
    <div className="pc-doc pc-doc--a4 pc-measure" aria-hidden="true" inert>
      <div ref={column} className="pc-measure__column">
        {blocks.map((block) => (
          <ResumeBlockView key={block.key} block={block} />
        ))}
      </div>
    </div>
  );
}
