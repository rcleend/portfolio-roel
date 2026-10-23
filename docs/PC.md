# The computer's screen (`src/app/pc`)

Clicking the desk or the computer in the room flies the camera straight in front of the monitor.
The room owns the monitor as a device: the glass, the light it spills, the camera, and one DOM element laid exactly over the picture while the camera rests there.
The app owns what that screen shows: an original take on an early-2000s desktop, a startup sequence in which the pointer double-clicks the résumé, and a maximised "Document Reader 7.0" with the résumé typeset as A4 pages.
Clicking the reader's close button or pressing Escape closes the window, holds the desktop for a beat and returns to the room; clicking outside the computer leaves at once.

Everything here is real DOM: text a screen reader can browse, native scrolling, real links.
Nothing is downloaded on first load beyond about 0.8 kB of glue.

## Contract with the room

`display.ts` holds a structural copy of the room's `PcMonitor` (until the two branches merge; then it re-exports the room's types):

| Member | Meaning |
| --- | --- |
| `screen` | Content slot positioned exactly over the picture (container CSS px), clipped with rounded corners, the room's glass-finish canvas on top. Visibility-hidden unless `live`. |
| `placement`, `onPlacementChange` | The picture's rectangle when the camera rests at the PC, for the current viewport; `left`/`top` snapped to device pixels. |
| `live`, `onLiveChange` | True from the landing frame until the camera is asked to leave. The room fades the slot in over 160 ms as it turns true, and hides it synchronously as it turns false. |
| `setStill(painter)` | What the glass shows whenever the live screen does not. The room calls the painter lazily: on the first leave from the TV, and before flights to or from the PC after `invalidateStill()`. |
| `invalidateStill()` | The still's content changed (the clock's minute). |
| `setLight(color)` | The light the monitor spills while the live screen differs from the still (the white page); one WebGL frame; cleared by the room on conceal. |

A `StillPainter` gets a context whose origin is the picture's top-left, clipped to it, and `{ width, height, placement }` (canvas px of the picture, and the live screen's CSS size).
It composes transforms only (`save`/`scale`/`translate`/`restore`) and never reads pixels.

`PcSlot` (`PcSlot.tsx`) is the only module the room host imports:

```tsx
<PcSlot display={room?.pc ?? null} view={view} powered={powered} onLeave={() => room.showRoom()} onFocusStage={focusStage} />
```

It renders portals only and is a sibling of the stage, outside `role="application"`, so React events from the screen never reach the stage's handlers.
The room host owns Escape on the stage element; the screen handles Escape only from its own roots (the screen's content root and the pop-out's dialog).

## Chunks and loading

| Chunk | Contents | Loaded |
| --- | --- | --- |
| main bundle | `PcSlot.tsx`, `whenIdle.ts`, `display.ts` types | first load |
| `pcStill-*` (`still/pcStill.ts`) | desktop layout, tokens, icon art, wallpaper, chrome painter | `whenIdle` once the room is ready and the TV is powered (also with Save-Data: it keeps the monitor from showing a dead tube) |
| `PcExperience-*` (`PcExperience.tsx` + CSS) | live desktop, storyboard, cursors, splash, reader, pages, pop-out | `whenIdle` the first time the view becomes `room` (skipped with Save-Data); at once when the view becomes `pc`, hidden by the 1.1 s flight |

`whenIdle` is `requestIdleCallback` with a 2 s timeout (a 200 ms timeout where it does not exist).
Once loaded, `PcExperience` stays mounted in `display.screen` (hidden by the room while not live) so the desktop is ready for every landing; the reader mounts only for each visit.
If it arrives after the screen is already live, it fades its own root in over 160 ms and starts the storyboard on mount.
If the chunk fails to load, the screen shows a small message box, "The document could not be opened.", with a link to the semantic résumé (`#resume`); the next visit tries again.

## Presentation (`presentation.ts`, `desktop/desktopScale.ts`)

- **Desktop scale** `s` (no hysteresis, so the painter and the DOM always agree): `placement.width >= 600 ? clamp(floor(placement.width / 900 × 4) / 4, 1, 1.5) : placement.width / 800`.
  The layout is `placement / s` CSS px and the content root is `scale(s)` from its top left: in the glass the chrome never shrinks below its 11 px design size; on phones the whole 800-wide desktop is shown scaled down, like a screen seen from a step back.
- **Mode**, with ±16 px hysteresis on both thresholds: `in-glass` while the picture is at least 600 × 440 CSS px, otherwise `pop-out`.
- **Default zoom** in the glass: Fit Width (`(paneClientWidth − 24) / 794`, at most 1.5) while that keeps the 14 px body at 12 px or more (a fit of 0.86), otherwise Reflow at 16 px. The pop-out always reflows.
  A zoom the visitor chooses is remembered for the page load.

| Viewport | Picture | Desktop | Opens at |
| --- | --- | --- | --- |
| 2560 × 1440 | 1399 × 1099 | ×1.5 | Fit Width, body 23 px |
| 1920 × 1080 | 1049 × 824 | ×1 | Fit Width, body 17 px |
| 1440 × 900 | 874 × 687 | ×1 | Fit Width, body 14.3 px |
| 1366 × 768 | 746 × 586 | ×1 | Fit Width, body 12 px |
| 1280 × 720, 768 × 1024 | 700 × 550, 632 × 497 | ×1 | Reflow, 16 px |
| phones | ≤ 379 × 298 | ×0.4 | pop-out, Reflow, 16 px |

## The desktop: one painter, two renderers (`desktop/`)

The still on the glass and the live DOM desktop must be indistinguishable at the hand-off, so they share every input:

- `desktopLayout(width, height)` is the only source of positions: the 30 px taskbar, the 100 × 30 start button (its orb mark and "start" text), the task button strip from x 106 (160 × 24), the 84 px tray with the clock centred, and a column of 74 × 78 icon cells at x 8 from y 10 (32 × 32 art, a 70 px label box of up to two 13 px lines), as many as fit above the taskbar, the CV first.
- `lunaTokens.ts` holds the gradients as stop arrays and the font strings; the painter builds canvas gradients from them and the DOM applies them inline (`cssGradient`).
- `icons.ts` holds original vector art as SVG path data with fills (`art.ts`): `new Path2D(d)` in the painter, `<path d>` in the DOM (`ArtSvg`). The "PDF" on the CV is drawn, not typed.
- `text.ts`: `wrapLabel` breaks a label into lines with the same measurements in both renderers (the DOM measures with a canvas too), and `baselineInLineBox` puts canvas text on the CSS half-leading baseline (`top + (L − (A + D)) / 2 + A` from the font's bounding-box metrics). Label shadows are an offset copy of the text, because canvas shadow offsets ignore the transform.
- `wallpaper.ts` paints "rolling hills" from seed 2001 (`Rng`): a three-stop sky, four cumulus clusters of 26 radial puffs (flattened, brighter tops, cool undersides), a cooler far hill on the right and a broad near hill cresting left of centre with seeded grass and a warm crest light; deliberately not the famous photograph's composition.
  It is painted once into a cached canvas of at most 1 MP (0.6 MP with `deviceMemory ≤ 2`) and repainted in place only when a request needs more than 1.3× its width. The DOM desktop appends that very canvas as its background, so one bitmap serves the glass and the live screen.
- `clock.ts`: the visitor's locale (`hour: 'numeric', minute: '2-digit'`); the DOM clock re-arms a timeout to each minute boundary and calls `display.invalidateStill()` on every tick.

The DOM desktop is `aria-hidden` and its icons are inert: only the scripted double-click opens the CV.

## Startup storyboard (`session/`)

`storyboard.ts` is the sequence as data, `session.ts` a pure reducer (`away`, `desktop`, `launching`, `splash`, `opening`, `reader`, `closing`), and `useStoryboard.ts` runs the cues with `setTimeout` from t = 0, the moment `display.live` turns true.
Motion is WAAPI on `transform` and `opacity` only, and no logic ever waits for an animation.
The content root carries `data-pc-state` and `data-pc-mode`.

First visit in a page load (readable at 1.85 s; reader ready measured at 1.88 s at 6× CPU):

| t (ms) | Cue |
| ---: | --- |
| 0 | `desktop`; the real pointer hides while the scripted one is on stage |
| 160 | scripted cursor fades in (80 ms) at 62 %, 58 % of the desktop |
| 240–760 | glides to the CV icon along a slight upward arc (three keyframes, `cubic-bezier(.3, 0, .2, 1)`) |
| 820 | click 1: the icon and its label take the selection blue; the cursor dips to 0.92 for 60 ms |
| 960 | click 2: busy cursor, `launching`; the reader starts mounting out of sight in a background render; "Opening the résumé…" in a polite live region |
| 1040 | `splash` fades and scales in (120 ms): "Initializing…" |
| 1240, 1440 | "Reading preferences…", "Opening Roel Leenders CV.pdf…" |
| max(1640, ready) | `opening`: the window appears maximised at once with an empty grey pane, its taskbar button pressed; the light goes to (0.8, 0.8, 0.8) |
| +60 → +210 | the page fades in |
| +210 | `reader`: focus moves to the document; the scripted cursor fades out (100 ms) |

- **Warm visits**: 160 cursor already on the icon, 240 click 1, 380 click 2, max(460, ready) the window opens at the remembered zoom and scroll, 460–580 the page fades in, 580 `reader`.
- **Reduced motion**: no scripted cursor, glides, fades or zooms (`document.getAnimations()` stays empty). The first visit shows the splash standing still ("Opening Roel Leenders CV.pdf…") and opens at max(400, ready); warm visits open as soon as the reader is ready.
- **Pop-out**: identical inside the glass up to `opening`; at +150 the full-viewport reader grows out of the in-glass window with a FLIP (280 ms, `cubic-bezier(.2, .8, .2, 1)`, transform only) over a scrim fading to `rgb(0 0 0 / 0.6)`, `reader` at +430. Reduced motion cuts.
- **Skip**: a pointer press inside the screen or the pop-out, or any key but Tab, Shift, Escape or a lone modifier, cancels every animation and jumps to the reader (through the splash while it is still mounting). The page becoming hidden skips too.
- **Interrupted**: `live` turning false cancels every timer and animation, unmounts the reader, remembers zoom and scroll, and hands focus back to the stage if it was inside the screen.
- **Closing** (close button or Escape): the window and its taskbar button vanish at once (in the pop-out after shrinking back into the glass, 200 ms), the light is cleared, and 200 ms later `onLeave()`. A repeated close is ignored.

## The reader (`reader/`)

"Roel Leenders CV.pdf - Document Reader", maximised above the taskbar; heights in layout px: title bar 26, menu bar 20, toolbar 32, status bar 22, a 22 px navigation strip.

- **Title bar**: the blue gradient with 8 px rounded top corners, the reader's mark (a white folded sheet on a red square), bold 13 px Trebuchet title with ellipsis; minimise and restore are decoration; close is a real `<button aria-label="Close the résumé">` whose hit area is 44 CSS px at any scale.
- **Menus** (File … Help) and the navigation strip's Bookmarks and Pages tabs are decoration.
- **Toolbar**: Save a Copy, Hand and Select are decoration; Print (`window.print()`, which prints the semantic résumé; every PC layer is `display: none` in print), Email (`mailto:`), Zoom out, the zoom field (50–200 %, Fit Width, Reflow), Zoom in, Fit Width and Reflow form one `role="toolbar"` with a roving tabindex.
- **Document pane**: `role="document"`, `aria-label="Roel Leenders' résumé"`, focusable for native keyboard scrolling; grey, with the pages centred 12 px apart. A4 pages are laid out once at 794 × 1123 and scaled with a transform inside a box sized to them, so zooming never re-lays out or re-paginates. Reflow re-typesets the same page groups at the pane's width, 16 CSS px, at most 68 ch per line.
- **Status bar**: 8.27 × 11.69 in, first / previous / "n of N" / next / last (the page from an IntersectionObserver band across the pane's middle, no scroll listeners), decorative layout buttons.
- **Dialog**: `role="dialog"`, `aria-modal`, labelled by the title; Tab cycles close → toolbar → document → its links → page buttons → close.
- **Cursors** (`cursors.ts`): an original arrow and busy arrow as SVG data URIs over the screen; `text` over page text and `pointer` over links.
- **Splash** (first visit, or while a skip waits): 360 × 220 layout px, a diagonal red gradient with a lighter arc, the folded-sheet mark, "Document Reader 7.0", the status line and "A lookalike by Roel Leenders".

## The résumé as a PDF (`pages/`, `app/resume/outline.ts`, `app/resume/format.ts`)

`resumeOutline()` turns `@/content` into ordered blocks (header, summary, section headings, one block per job, education entry and publication); the semantic `Resume.tsx` and the PDF share its formatters (`format.ts`).
The PDF leaves out what belongs to the arcade (the next-level teaser, metric badges, asset credits).
`PageMeasure` typesets every block once in a hidden A4-wide column with the page's own styles and `paginate` fills pages greedily with whole blocks, a heading always moving with the block it heads; pages use `min-height`, so another platform's fonts grow a page rather than clip it.
Today: page 1 holds the header, summary and all four jobs; page 2 education and publications.
Body Georgia 14 px / 1.5, headings Arial; every text colour keeps a contrast of at least 8.6:1 on the page.

## Pop-out (`popout/`)

On small pictures the reader is portaled to `document.body`: fixed over the whole viewport (`100dvh`), z-index 30 (above the sound toggle, below the accessible résumé), padded by the safe-area insets, with a 44 px title bar and close button, a 36 px strip showing "Reflow" and "Page n of N", and the document in Reflow with 16 px gutters.
`flipTransform(first, last)` gives the transform that makes the full-viewport reader appear at the in-glass window.

## Dev lab

`/pc-lab.html` on the dev server (development only) shows the screen on `FakeDisplay`, a stand-in for `room.pc`: a CSS monitor, a 5:4 picture at 61 % of the viewport's width, the still painted by the screen's own painter at texture resolution underneath, the room's 160 ms fade on landing.

| Param | Effect |
| --- | --- |
| `w`, `h` | the picture's size in CSS px (874 × 687 is the 1440 × 900 room, 321 × 252 a 390 × 844 phone) |
| `tier` | the still's texture width (default: 512, 768 or 1024 by the picture's device width, like the room) |
| `live=1` | land as soon as the screen has loaded |
| `clean`, `glass=0` | hide the panel, the glass sheen |

Reduced motion follows `prefers-reduced-motion` (Playwright's `emulateMedia`), the mode the picture size.
Clicking outside the monitor leaves, like the room. `window.__pcLab` lands, leaves and records everything the screen asked of the monitor (`setLight`, `invalidateStill`, leaves and focus hand-backs) for `e2e/pc-screen.spec.ts`.

## Budgets and measurements

`pnpm build && pnpm report:bundle` (`scripts/bundle-report.mjs`) gzips the build's chunks from Vite's manifest and checks `bundle-budgets.json`; until the room host imports `PcSlot`, it weighs the PC's chunks in a probe build with `PcSlot` as an extra entry.

| Metric | Budget | Measured |
| --- | ---: | ---: |
| Entry JS / CSS | baseline + 1.0 / + 0.5 kB | unchanged on this branch |
| `PcSlot` glue (growth of the entry) | 0.8 kB | 0.78 kB |
| `pcStill` closure | 5 kB | 4.97 kB |
| `PcExperience` closure, JS + CSS | 25 kB, no three.js | 18.8 kB |

Measured in the production lab (Chromium, M-series Mac):

| | 1× CPU | 6× CPU |
| --- | ---: | ---: |
| Reader mount, first visit (`performance.measure('pc-reader-mount')`) | 15 ms | 90 ms, no task over 50 ms |
| Reader mount, warm | 4 ms | 22 ms |
| Readable after landing, first / warm | 1.87 s / 0.59 s | 1.88 s / 0.61 s |
| First still paint with the wallpaper (GPU canvas, main thread) | 9 ms | 24 ms, of which 12 ms the first use of the fonts |
| Still repaint (the clock's minute) | < 1 ms | 2 ms |
| Hand-off, still vs live desktop (lab, 1440 × 900 at DPR 1 and 2, 390 × 844 at DPR 3) | mean \|Δ\| 0.2–0.95 / 255 | |

## Lookalike rules (PR checklist)

- [ ] Original work only: no Microsoft or Adobe image, icon, logo, wallpaper (no Bliss), cursor or font copied, traced, extracted or bundled; no community recreation (XP.css and similar) copied.
- [ ] On screen only "start" and "Document Reader 7.0" as product-like names; never "Windows", "Adobe", "Acrobat" or "Reader" on its own.
- [ ] The start mark is a white-rimmed orb with a yellow sun over a green hill, never a four-colour flag or pinwheel; the reader's mark is a white folded sheet, never a stylised "A" or swirl.
- [ ] System font stacks only; no font files.
- [ ] The splash says "A lookalike by Roel Leenders".

## Modules

```
pc/
  PcSlot.tsx            the room host's entry: lazy loading, portals, the load-failure message (main bundle)
  whenIdle.ts           requestIdleCallback with a timeout, and a fallback
  display.ts            the room's monitor contract (structural copy until the merge)
  presentation.ts     ★ desktop scale (re-exported), in-glass vs pop-out with hysteresis, default zoom
  cursors.ts            the screen's arrow and busy arrow as art and as CSS cursors
  PcExperience.tsx      the screen: placement, mode, session, reader mounting, documents, focus
  still/pcStill.ts      the still painter (its own chunk)
  desktop/
    desktopLayout.ts  ★ every position on the desktop
    desktopScale.ts     the desktop's scale for a picture size
    lunaTokens.ts       gradients as stop arrays, fonts, colours
    art.ts              vector art as data, and its paint helpers
    icons.ts            the four desktop icons and the start mark
    text.ts           ★ label wrapping and the CSS baseline for canvas text
    wallpaper.ts      ★ the procedural wallpaper and its shared cached canvas
    clock.ts          ★ the clock's format and the time to the next minute
    paintChrome.ts      icons, labels, taskbar, start, tray and clock onto a canvas
    Desktop.tsx         the live desktop (DOM twin of the painter); ArtSvg.tsx, cssGradient.ts, useClock.ts
  session/
    storyboard.ts     ★ the startup as cue data
    session.ts        ★ the visit's reducer and its views (mounted, window shown, busy…)
    useStoryboard.ts    runs the cues, the motion, the light, focus and the way out
    ScriptedCursor.tsx  the scripted pointer and its director
    keys.ts           ★ which keys skip the startup
    memory.ts         ★ what the computer remembers for the page load
  reader/
    ReaderWindow.tsx    the maximised window and its chrome; Toolbar.tsx, StatusBar.tsx, Splash.tsx
    DocumentPane.tsx    the scrolling document, zoom by transform, page in view
    zoom.ts           ★ zoom settings, steps, Fit Width
    roving.ts         ★ the toolbar's roving tabindex
    focus.ts            the dialog's Tab trap
    readerMetrics.ts    chrome heights and the pane's width
    glyphs.ts, marks.ts the reader's toolbar glyphs and marks
  pages/
    ResumePages.tsx     A4 and Reflow typesetting of the outline (completeness-tested against @/content)
    PageMeasure.tsx     measures blocks once and paginates
    paginate.ts       ★ greedy pagination with keep-with-next
  popout/
    PopOut.tsx          the full-viewport reader
    flip.ts           ★ FLIP rectangle → transform
  lab/                  FakeDisplay + main.tsx (served by pc-lab.html)
```

★: unit-tested next to the code. End to end: `e2e/pc-screen.spec.ts` on the lab, with Playwright's clock driving the storyboard.
