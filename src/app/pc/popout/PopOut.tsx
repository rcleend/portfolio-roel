import type { KeyboardEvent, PointerEvent, ReactNode, Ref } from 'react';
import { createPortal } from 'react-dom';
import { ArtSvg } from '../desktop/ArtSvg';
import { trapTab } from '../reader/focus';
import { READER_MARK } from '../reader/marks';
import { CloseGlyph, READER_TITLE } from '../reader/ReaderWindow';
import './PopOut.css';

export interface PopOutProps {
  /** Mounted hidden while the reader starts, so growing out of the glass is instant. */
  readonly shown: boolean;
  readonly titleId: string;
  readonly page: number;
  readonly pageCount: number;
  readonly onClose: () => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  readonly onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  readonly rootRef: Ref<HTMLDivElement>;
  readonly windowRef: Ref<HTMLDivElement>;
  readonly scrimRef: Ref<HTMLDivElement>;
  readonly document: ReactNode;
}

/**
 * The reader on a small picture (phones, short windows): grown out of the
 * glass to fill the viewport, at real CSS px with 44 px touch targets and
 * the résumé in Reflow. No menus, navigation strip, status bar or taskbar.
 */
export function PopOut({
  shown,
  titleId,
  page,
  pageCount,
  onClose,
  onKeyDown,
  onPointerDown,
  rootRef,
  windowRef,
  scrimRef,
  document: content,
}: PopOutProps) {
  return createPortal(
    <div ref={rootRef} className="pc-popout" data-shown={shown} inert={!shown}>
      <div ref={scrimRef} className="pc-popout__scrim" />
      <div
        ref={windowRef}
        className="pc-popout__window"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // A click on the title bar or the toolbar keeps focus in the dialog, where Escape still closes it.
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Tab' && trapTab(event.currentTarget, event.shiftKey)) event.preventDefault();
          else onKeyDown(event);
        }}
        onPointerDown={onPointerDown}
      >
        <div className="pc-popout__title">
          <ArtSvg art={READER_MARK} size={18} />
          <span id={titleId} className="pc-popout__caption">
            {READER_TITLE}
          </span>
          <button type="button" className="pc-popout__close" aria-label="Close the résumé" onClick={onClose}>
            <CloseGlyph size={12} />
          </button>
        </div>
        <div className="pc-popout__toolbar">
          <span className="pc-popout__field">Reflow</span>
          <span className="pc-popout__page">
            Page {pageCount > 0 ? page + 1 : 0} of {pageCount}
          </span>
        </div>
        {content}
      </div>
    </div>,
    document.body,
  );
}
