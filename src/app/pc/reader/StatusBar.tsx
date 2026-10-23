import { ArtSvg } from '../desktop/ArtSvg';
import type { Art } from '../desktop/art';
import {
  CONTINUOUS_GLYPH,
  FACING_GLYPH,
  FIRST_PAGE_GLYPH,
  LAST_PAGE_GLYPH,
  NEXT_PAGE_GLYPH,
  PREVIOUS_PAGE_GLYPH,
  SINGLE_PAGE_GLYPH,
} from './glyphs';

export interface StatusBarProps {
  /** 0-based page in view. */
  readonly page: number;
  readonly pageCount: number;
  readonly onGoTo: (page: number) => void;
}

/** The reader's status bar: the paper size, page navigation and (decorative) page-layout buttons. */
export function StatusBar({ page, pageCount, onGoTo }: StatusBarProps) {
  const last = Math.max(0, pageCount - 1);
  return (
    <div className="pc-status">
      <span className="pc-status__size" aria-hidden="true">
        8.27 × 11.69 in
      </span>
      <div className="pc-status__pages">
        <PageButton glyph={FIRST_PAGE_GLYPH} label="First page" disabled={page <= 0} onClick={() => onGoTo(0)} />
        <PageButton
          glyph={PREVIOUS_PAGE_GLYPH}
          label="Previous page"
          disabled={page <= 0}
          onClick={() => onGoTo(page - 1)}
        />
        <span className="pc-status__field">
          {pageCount > 0 ? page + 1 : 0} of {pageCount}
        </span>
        <PageButton
          glyph={NEXT_PAGE_GLYPH}
          label="Next page"
          disabled={page >= last}
          onClick={() => onGoTo(page + 1)}
        />
        <PageButton glyph={LAST_PAGE_GLYPH} label="Last page" disabled={page >= last} onClick={() => onGoTo(last)} />
      </div>
      <span className="pc-status__layouts" aria-hidden="true">
        <ArtSvg art={SINGLE_PAGE_GLYPH} size={16} />
        <ArtSvg art={CONTINUOUS_GLYPH} size={16} />
        <ArtSvg art={FACING_GLYPH} size={16} />
      </span>
    </div>
  );
}

/**
 * `aria-disabled` rather than `disabled`: a button that disables itself (Next on reaching the last page) keeps
 * focus instead of dropping it out of the dialog.
 */
function PageButton({
  glyph,
  label,
  disabled,
  onClick,
}: {
  readonly glyph: Art;
  readonly label: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="pc-tool pc-tool--small"
      aria-label={label}
      title={label}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
    >
      <ArtSvg art={glyph} size={16} />
    </button>
  );
}
