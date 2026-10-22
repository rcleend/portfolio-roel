/**
 * Where the title scene puts what it owns, in screen pixels. Lockups place
 * themselves, but must settle on screen and above the prompt.
 */
export const TITLE_LAYOUT = {
  /** The game's native resolution (docs/ARCHITECTURE.md › Rendering model). */
  screen: { width: 320, height: 240 },
  /** Where the opening hit lands: centred, a little high, behind the lockup. */
  impact: { x: 160, y: 100 },
  promptY: 166,
  copyrightY: 216,
} as const;
