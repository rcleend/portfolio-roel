# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Start with `docs/ARCHITECTURE.md` (module boundaries, enforced by `src/architecture.test.ts`); the room's contract is `docs/ROOM.md`, the visual spec `docs/ART-DIRECTION.md` (its "The room's UI" section covers everything outside the TV and computer screens).
- `pnpm check` before committing; give each checkout its own e2e server with `E2E_PORT=<port> pnpm e2e` (the `@frames` tests run alone after the rest).
- Bundle budgets are tight and itemised in `bundle-budgets.json` (`pnpm report:bundle`); a new lazy chunk needs a row in `scripts/bundle-report.mjs` and a budget. A lazy chunk under `src/room` must import types only and get three.js classes through a kit from the room chunk (`posterKit.ts`, `spotlightKit.ts`), or Rolldown splits three.js onto the critical path.
- e2e pins shader program counts (`e2e/programs.ts`); anything that compiles a program must be counted there.
- Screens are light, not bloom: the TV lights the room as an area light (`src/room/tv/screenLight.ts`, drawn by the finish's existing shaders) and a display glares only at its brightest pixels (docs/ROOM.md › The TV's light); a screen-space veil of the picture over the set reads as fake (`e2e/tv-light.spec.ts` guards it).
- The stage's cursor is a named `RoomCursor` (`idle`/`enter`/`leave`/`press`/`play`) drawn through `--room-cursor-*` custom properties that `app/cursors/cursors.css` themes (docs/ROOM.md › Cursors); tests read `canvas.dataset.cursor`, not `style.cursor`.
- The page opens on a pre-rendered still of the TV view (`index.html` › `.tv-still`, docs/ROOM.md › Startup); anything that changes the TV, its set or its framing must re-render it with `node scripts/capture-tv-stills.mjs` and update the lengths in index.html.
- The build slims every emitted PNG (`scripts/pngSlim.ts`); committed art stays byte-for-byte what its generators write, so never hand-optimise PNGs in the repo.
- A first visit starts muted (`defaultSession().muted`); an e2e test that needs sound seeds `localStorage['reo-leo:session']` with `{ version: 1, muted: false }` (see `e2e/radio-flow.spec.ts` › `open`). Radio tracks are held to 5 MB each, 16 MB in all, by `src/content/radio/validate.ts` (`pnpm verify:radio`).
- A canvas painted once (a `CanvasTexture`'s source) must paint again on its `contextrestored`: a GPU process reset (laptop sleep, display change) hands it back blank and the restored WebGL context uploads that (`src/room/radio/device/Lcd.ts`; e2e crashes the GPU with CDP `Browser.crashGpuProcess` in its own browser).
- Reduced motion in this project means no transitions or animations at all (things appear and go), and entrance animations use `backwards` fill so finished ones leave `document.getAnimations()` empty (several e2e tests wait for it).

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
