import type { CSSProperties, KeyboardEvent, ReactNode, Ref } from 'react';
import { ArtSvg } from '../desktop/ArtSvg';
import { trapTab } from './focus';
import { READER_MARK } from './marks';
import './ReaderWindow.css';

export const READER_TITLE = 'Roel Leenders CV.pdf - Document Reader';

export interface ReaderWindowProps {
  /** `dialog`: the reader itself. `ghost`: its in-glass silhouette while a pop-out reader holds the document. */
  readonly variant: 'dialog' | 'ghost';
  /** Hidden (but laid out) while it mounts behind the splash. */
  readonly shown: boolean;
  readonly titleId: string;
  /** The close button's hit area, in layout px: 44 CSS px whatever the screen's scale. */
  readonly closeHitSize: number;
  readonly onClose: () => void;
  readonly windowRef: Ref<HTMLDivElement>;
  readonly toolbar: ReactNode;
  readonly document: ReactNode;
  readonly status: ReactNode;
}

/** The close button's white ×: two 2 px bars. */
export function CloseGlyph({ size }: { readonly size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 9 9" aria-hidden="true" focusable="false">
      <path d="M1 1l7 7M8 1L1 8" stroke="#fff" strokeWidth="2" />
    </svg>
  );
}

const MENUS = ['File', 'Edit', 'View', 'Document', 'Tools', 'Window', 'Help'];

/**
 * "Document Reader 7.0", maximised above the taskbar: title bar, menus,
 * toolbar, navigation strip, the document pane and the status bar. A modal
 * dialog for assistive tech; Tab cycles inside it.
 */
export function ReaderWindow({
  variant,
  shown,
  titleId,
  closeHitSize,
  onClose,
  windowRef,
  toolbar,
  document,
  status,
}: ReaderWindowProps) {
  const dialog = variant === 'dialog';
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Tab' && trapTab(event.currentTarget, event.shiftKey)) event.preventDefault();
  };
  // The ghost is a picture of a window, not a second dialog.
  const semantics = dialog
    ? ({ role: 'dialog', 'aria-modal': true, 'aria-labelledby': titleId, onKeyDown } as const)
    : ({ 'aria-hidden': true } as const);
  return (
    <div ref={windowRef} className="pc-reader" data-shown={shown} inert={!dialog || !shown} {...semantics}>
      <div className="pc-reader__title">
        <ArtSvg className="pc-reader__mark" art={READER_MARK} size={16} />
        <span id={dialog ? titleId : undefined} className="pc-reader__caption">
          {READER_TITLE}
        </span>
        <span className="pc-caption pc-caption--minimise" aria-hidden="true" />
        <span className="pc-caption pc-caption--restore" aria-hidden="true" />
        <button
          type="button"
          className="pc-caption pc-caption--close"
          aria-label="Close the résumé"
          style={{ '--pc-hit': `${closeHitSize}px` } as CSSProperties}
          onClick={onClose}
        >
          <CloseGlyph size={9} />
        </button>
      </div>
      <div className="pc-reader__menus" aria-hidden="true">
        {MENUS.map((menu) => (
          <span key={menu}>{menu}</span>
        ))}
      </div>
      {toolbar}
      <div className="pc-reader__body">
        <div className="pc-reader__strip" aria-hidden="true">
          <span>Bookmarks</span>
          <span>Pages</span>
        </div>
        {document}
      </div>
      {status}
    </div>
  );
}
