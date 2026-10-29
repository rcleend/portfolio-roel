/**
 * The transport's glyphs in the room UI's line style (docs/ART-DIRECTION.md › The room's UI): 24 px, white, rounded
 * joins, the shapes filled and the strokes round-ended. Original drawings of the usual transport symbols.
 */
const GLYPHS = {
  previous: 'M18 6.5v11l-8-5.5zM6.5 6.5v11',
  play: 'M8 5.8v12.4l10-6.2z',
  pause: 'M7 6h3.2v12H7zM13.8 6H17v12h-3.2z',
  stop: 'M6.8 6.8h10.4v10.4H6.8z',
  next: 'M6 6.5v11l8-5.5zM17.5 6.5v11',
  back: 'M14.5 5.5 8 12l6.5 6.5',
} as const;

export type Glyph = keyof typeof GLYPHS;

export function GlyphIcon({ glyph }: { readonly glyph: Glyph }) {
  return (
    <svg className={`radio-glyph radio-glyph--${glyph}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={GLYPHS[glyph]} />
    </svg>
  );
}
