# Roel Leenders — arcade portfolio

Roel's portfolio as a 16-bit, Neo Geo-style arcade game running on a CRT in a 3D attic room.
Every screen renders at a native 320 × 240 and is presented by a host: the three.js room, or a flat CSS television when WebGL is unavailable.
The same content is always available as a plain HTML résumé for screen readers, crawlers and visitors who would rather read.

## Run it

Requires Node 24 and pnpm 10.

```sh
pnpm install
pnpm dev            # http://localhost:5173
pnpm check          # type-check, lint (Biome), unit tests (Vitest) incl. the architecture boundary test
pnpm e2e            # Playwright smoke tests (Chromium)
pnpm build          # production bundle in dist/
pnpm report:bundle  # a production build with its manifest: gzip sizes against bundle-budgets.json
```

## Screenshots

`pnpm shot` drives the game through the development harness and writes PNGs to `.shots/`:

```sh
pnpm shot --scene title --frames 150                        # one frame, ×3 nearest-neighbour
pnpm shot --scene boot --frames 0:480:30 --scale 1          # contact sheet, one cell every 30 frames
pnpm shot --scene specimen --params '{"page":1}' --frames 30 # fonts, sprites and UI kit specimen
pnpm shot --host flat --page                                 # full page, including the TV bezel
```

The audio lab, `/audio-lab.html` on the dev server, plays every track and effect and measures offline renders; `pnpm exec tsx scripts/audio-report.ts` prints the same level table in the terminal.
The playground, `/playground` on the dev server, shows every registered title lockup and backdrop live and side by side, with a shared transport and a focus mode for any combination.
The room lab, `/room-lab.html`, shows the attic with a test card on the TV (and, with `?mockpc=1`, on the computer); the PC lab, `/pc-lab.html`, shows the computer's screen on a stand-in monitor (docs/ROOM.md, docs/PC.md).

In development (or with `?debug` in production) the URL accepts `host`, `scene`, `params`, `seed` and `frames`, and `window.__arcade` lets you `goTo`, `step`, `press` and inspect `state()` from the console.

## Where things live

- `docs/ARCHITECTURE.md` — module layout, contracts and the development harness. Start here.
- `docs/ART-DIRECTION.md` — the visual and motion spec.
- `docs/ROOM.md` — the three.js room and its contract; `docs/PC.md` — the computer's screen and résumé reader.
- `docs/ROOM-ART-DIRECTION.md` — the 3D asset style and reference study; `tools/room/README.md` — the Blender rebuild pipeline.
- `src/content` — the portfolio itself, as typed data.
- `src/engine` — a small, generic 16-bit engine; `src/game` — the portfolio game; `src/app` — the React shell and hosts.
