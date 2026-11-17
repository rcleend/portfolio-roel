# The visit without a GPU: measurements

Measured 17 Nov 2026 on the frozen production build `.shots/flights/dist-base` (built 09:41, before the flight
changes committed after it). Nothing under `src/`, `e2e/`, `docs/`, `index.html` or the existing scripts was edited.

**State of this file: first complete write-up, with three things still owed** (see "Still owed" at the end). The
laptop ran down to 8 % battery during the work; the heavy software-renderer runs were stopped and stay parked until
it is on mains.

## How it was measured

- Machine: Apple M4 Pro (12 cores: 8 performance, 4 efficiency), 24 GB. Shared with other agents' jobs during every
  run; each run records what else the machine was doing (the "other jobs" column: cores kept busy by everything that
  is not the browser under test). Runs with other jobs above about 3 cores are called out.
- Browsers: Chrome for Testing 151.0.7922.34 (Playwright's) and the installed Google Chrome 157.0.8103.79, both
  headless, each in a new temporary profile. Headless Chrome for Testing gives a page 120 frames a second here (the
  built-in display's rate); headless Chrome 157 gives 60.
- **Playwright adds `--enable-unsafe-swiftshader` to every Chromium it launches on macOS** (playwright-core 1.62.1,
  `chromium.ts › _innerDefaultArgs`). That is why `PERF_CHROME_ARGS="--disable-gpu" node scripts/perf/flights.mjs` and
  the e2e suite get software WebGL where a visitor's browser gets none. The drivers here take the flag out unless it
  is asked for by name.
- **Chrome's Energy Saver caps every page at 30 frames a second on battery at 20 % or less.** Proven: a blank page
  in headless Chrome for Testing got 30 fps (33.3 ms) with the laptop at 14 %, and 121 fps (8.3 ms) with
  `{"performance_tuning":{"battery_saver_mode":{"state":0}}}` in the profile's `Local State`;
  `--disable-features=BatterySaverModeAvailable` does not lift it. Three reference runs and one flat run taken under
  the cap are discarded below (named where they would have appeared). `nogpuLib.mjs › launch` now always switches it
  off; `node scripts/perf/nogpuRate.mjs` prints the bare frame rate in four seconds.
- Frame intervals are on the page's clock (`requestAnimationFrame` timestamps, `scripts/perf/flightProbe.js`): a
  "room" frame is a display frame in which WebGL drew, a "display" frame any frame the page was given. Under software
  WebGL the two are the same frames. That these are also the frames presented was **not** checked with a trace; what
  supports it is that the GPU process holds 8 to 9.5 cores busy in every stretch (it is the limit, not the page).
- The game's speed is its own clock: fixed steps a second from `__arcade.state().frame` (60 is full speed; it catches
  up to five steps a frame, so it keeps full speed down to 12 frames a second and slows below that).

New files (all under `scripts/perf/`): `nogpuLib.mjs` (serving, launching, statistics, the machine sampler),
`nogpuProbe.mjs` (which WebGL a set of flags gives, and which host), `nogpu.mjs` (the whole visit),
`nogpuFlat.mjs` (the visit when WebGL is refused or the room fails), `nogpuRadio.mjs` and `nogpuWait.mjs` (two
focused checks), `nogpuRate.mjs` (the bare frame rate), `nogpuReport.mjs` (tables from the JSON). Raw results:
`.shots/flights/nogpu/raw/`. Screenshots: `.shots/flights/nogpu/shots/` (`*-view.jpg` are 1280 px copies).
`.shots/flights/nogpu/probes/` holds the committed `flightProbe.js` and `glProfiler.js` as they were when the work
began, because the working tree's were being edited.

## Case a: hardware acceleration switched off

### What a visitor actually gets (verified by running, both browsers)

`node scripts/perf/nogpuProbe.mjs --dist .shots/flights/dist-base --browser cft|chrome --args "…"`; results in
`raw/probe.jsonl`. Identical in Chrome for Testing 151 and Google Chrome 157:

| Launched with | WebGL 2 / WebGL 1 | chrome://gpu says | Host the site shows | Room quality |
| --- | --- | --- | --- | --- |
| nothing (the reference) | Metal (`ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, Unspecified Version)`) | webgl enabled | room, ready 0.6 s | high × 1 |
| `--disable-gpu` | **refused** (`GL_VENDOR = Disabled`) | webgl `disabled_off`, compositing and 2D canvas `disabled_software` | **flat**, game running at 0.9 s | — |
| the settings switch itself (`hardware_acceleration_mode.enabled = false` in Local State, no flag) | **refused** | the same | **flat** | — |
| `--disable-gpu --disable-software-rasterizer` | refused | the same | flat | — |
| `--disable-3d-apis` | refused | webgl "enabled" (the API is off, not the GPU) | flat | — |
| `--disable-gpu --enable-unsafe-swiftshader` | **SwiftShader** (`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)`) | webgl `unavailable_software`, compositing `disabled_software` | room, ready 5 s | low × 1 |
| `--use-gl=angle --use-angle=swiftshader` (with or without the unsafe flag) | SwiftShader, and the compositor on it too | webgl "enabled" | room, ready 10 s | low × 1 |
| `--enable-unsafe-swiftshader` alone | Metal | webgl enabled | room | high × 1 |

So: **a visitor who switches hardware acceleration off in Chrome 151 or 157 on a Mac gets no WebGL at all and lands
on the flat television (case b). Software WebGL is not what they get.** It runs only with
`--enable-unsafe-swiftshader` (or the enterprise policy of the same name), or when SwiftShader is asked for as the GL
driver, which is a test configuration. Chromium's "Intent to Remove: SwiftShader Fallback" says the automatic fallback
was deprecated from Chrome 130 with removal planned for desktop 137, and that the devices affected are "primarily
older Windows devices"; a console line in the runs above still reads "Automatic fallback to software WebGL has been
deprecated". **Not verified here:** Chrome on Windows or Linux (whether anything else stands in there), Firefox, and
older Chromes still in use, any of which may hand the page a software renderer. `softwareGpu.ts` also matches
`llvmpipe`, `softpipe` and `basic render` (WARP), none of which could be produced on this Mac.

A context asked for with `failIfMajorPerformanceCaveat: true` is refused under
`--disable-gpu --enable-unsafe-swiftshader` (both browsers), and granted under `--use-angle=swiftshader`. The app
never asks with it (`chooseHost.ts › detectWebGL`, `RoomStage.ts`: `powerPreference: 'high-performance'` only).

### Software WebGL where it does run: the whole visit

`node scripts/perf/nogpu.mjs --dist .shots/flights/dist-base --label … --args "--disable-gpu --enable-unsafe-swiftshader" [--device phone] --probes .shots/flights/nogpu/probes --shots … --out …`,
Chrome for Testing 151, no CPU throttling. Desktop is 1440 × 900 at device scale 2, phone 390 × 844 at 3 (the
viewport and its pixels only: the CPU is the M4's). The visitor stays on the title until the whole room is lit, plays
a level, then tours room, TV, room, computer, room, radio, room.

Load (ms unless marked s). The reference is the same driver on Metal.

| run | renderer | tier × scale, drawing buffer | first paint | first contentful paint | game running | room ready (s) | opening view bake (s) | whole room lit (s) | other jobs (cores, median/max) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| desktop, run 2 | SwiftShader | low × 1, 1200×750 (pixel ratio 0.833) | 48 | 132 | 608 | 5.22 | 3.47 | 174.7 | 1.6 / 3.1 |
| desktop, load only 1 | SwiftShader | low × 1, 1200×750 | 48 | 128 | 628 | 5.12 | 3.36 | 189.8 | — |
| desktop, load only 2 | SwiftShader | low × 1, 1200×750 | 56 | 140 | 623 | 5.16 | 3.42 | 175.8 | — |
| desktop, run 1 (machine busy at the start) | SwiftShader | low × 1, 1200×750 | 104 | 236 | 1724 | 37.2 | 31.7 | 216.9 | not sampled |
| phone | SwiftShader | low × 1, 585×1266 (pixel ratio 1.5) | 56 | 132 | 601 | 4.91 | 3.43 | **292.9** | 1.8 / 3.6 |
| desktop, Metal | Metal | high × 1, 2190×1369 | 88 | 196 | 504 | 0.60 | 0.11 | 1.38 | — |

- **Tier and scale: `low` × 1 from the first frame to the last, in every software run**, desktop and phone, with
  `navigator.webdriver` false (so the governor was free to act, and did not): the docs' "starts on the lowest tier
  and stays there" holds. Pixel ratio 0.833 on the desktop (the 0.9 MP cap), 1.5 on the phone (0.74 MP).
- **The bake.** `generatedStats`: 156 views, the opening view lit in 3.4 to 3.5 s (0.11 s on Metal), main-thread
  time 35 to 80 ms in all. The rest of the room takes **170 to 190 s on the desktop and 288 s at the phone's size
  while the visitor stays at the TV**, against 0.9 s on Metal. Cause, read from `gen/bake/pace.ts` at the build's
  commit: behind the room's frames the bake gives way whenever a frame is later than 20 ms, down to an eighth of a
  unit with up to 100 ms of rest between units, and under SwiftShader every frame is late.
- **One freeze of 0.7 s in the game as it starts**, in every software run: a single main-thread task of 685 to
  759 ms between the bake's marks `wired` (≈ 650 ms) and `baker` (≈ 1400 ms), that is, making the bake (41 ms on
  Metal). The game began at 0.6 s, so it stands still from about 0.65 to 1.4 s; its clock ran at 50.6 to 53.3 steps
  a second over the 4.5 s of loading because of it. Apart from that the game on the still gets 105 to 110 frames a
  second while the room loads (median 7.9 ms, 99 % within 20 ms).
- **Leaving the TV as soon as the room is handed out** (`--early-leave`, and `flights.mjs` with
  `PERF_CHROME_ARGS="--disable-gpu"`): the camera sets off only when the whole room is lit, and that took **27 s,
  66 s, 92 s (machine busy) and 222 s in four runs; in a fifth it had not left 177 s after the click** when the
  watch ended (`nogpuWait.mjs`: still at the TV, `generated: 'opening'`). In this build nothing on the page says the
  click was taken: the view stays `tv`, the game is not paused and goes on at 60 steps a second, no `aria-busy`, the
  way-out pill unchanged (`raw/early-swiftshader-desktop-1.log`, last lines). Read from the source at the build's
  commit: the hold that gives the bake the GPU lasts `HURRY_HOLD_MS` = 1.5 s, after which the TV's frames come back
  and the hurried bake queues behind each 40 ms frame. (The commits made after the build pause the game at the
  click; not measured here.)

Stretches of the visit (room frames; before the room is in, the display's):

| run | stretch | s | fps | median ms | p95 ms | worst ms | > 20 ms % | > 33 ms % | > 50 ms % | game steps/s | main thread ms/frame | GPU process cores | other jobs cores |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SwiftShader desktop | loading: game running → room ready | 4.6 | 105.4 | 7.9 | 8.8 | 752.5 | 0.8 | 0.8 | 0.6 | 50.6 | 0 | — | 2.09 |
| SwiftShader desktop | warming: room ready → whole room lit | 169.5 | 22.4 | 44 | 54.1 | 104.1 | 100 | 99.7 | 14.8 | 60 | 0.6 | — | 1.73 |
| SwiftShader desktop | tv: title on the still | 3.1 | 22.4 | 45.1 | 55.6 | 63 | 100 | 100 | 14.7 | 59.9 | 0.6 | 8.27 | 1.33 |
| SwiftShader desktop | tv: level | 6.1 | 21.9 | 45.8 | 54.2 | 67.7 | 100 | 100 | 19.7 | 59.8 | 3.2 | 7.89 | 1.28 |
| SwiftShader desktop | room | 5.1 | 19 | 53 | 62.4 | 110.8 | 100 | 100 | 66.3 | — | 0.3 | 8.69 | 1.12 |
| SwiftShader desktop | pc | 5.1 | 17.1 | 58.3 | 73.9 | 117.4 | 96.5 | 96.5 | 92.9 | — | 0.2 | 7.13 | 1.22 |
| SwiftShader desktop | radio | 5.1 | 20.2 | 50.1 | 58 | 80 | 100 | 100 | 51.5 | — | 0.2 | 9.53 | 0.87 |
| SwiftShader phone | loading: game running → room ready | 4.3 | 110.2 | 7.8 | 9 | 536.4 | 0.8 | 0.6 | 0.2 | 53.3 | 0 | — | 2.17 |
| SwiftShader phone | warming: room ready → whole room lit | 288 | 23.6 | 41.7 | 50.1 | 141.6 | 100 | 98.2 | 6.4 | 59.9 | 0.6 | — | 1.83 |
| SwiftShader phone | tv: title on the still | 3 | 26.3 | 40.4 | 44.9 | 55 | 100 | 67.1 | 2.5 | 60.2 | 0.6 | 8.79 | 0.86 |
| SwiftShader phone | tv: level | 6.1 | 24.5 | 41 | 49.4 | 72.4 | 100 | 85.1 | 3.4 | 60 | 1.7 | 8.26 | 0.83 |
| SwiftShader phone | room | 5.1 | 23.7 | 41.2 | 49.7 | 66 | 100 | 95 | 4.2 | — | 0.2 | 8.76 | 2.04 |
| SwiftShader phone | pc | 5.1 | 23.1 | 40.7 | 49.2 | 97.7 | 100 | 95.7 | 3.4 | — | 0.2 | 8.35 | 2.01 |
| SwiftShader phone | radio | 5 | 21.4 | 48.6 | 52.2 | 76.4 | 100 | 100 | 11.2 | — | 0.2 | 8.95 | 1.65 |
| Metal desktop | tv: title on the still | 3 | 60 | 16.7 | 17.2 | 17.7 | 0 | 0 | 0 | 59.6 | 0.2 | 0.2 | — |
| Metal desktop | tv: level | 6 | 60 | 16.7 | 17.4 | 17.6 | 0 | 0 | 0 | 60 | 0.4 | 0.19 | — |
| Metal desktop | room | 5 | 84.8 | 13.2 | 16.7 | 17.6 | 0 | 0 | 0 | — | 0.3 | 0.18 | — |
| Metal desktop | pc | 5 | 65.6 | 15.2 | 17.1 | 23 | 0.9 | 0 | 0 | — | 0.1 | 0.11 | — |
| Metal desktop | radio | 5 | 64.5 | 15.8 | 17.3 | 20.1 | 0.3 | 0 | 0 | — | 0.1 | 0.07 | — |

(The first desktop software run, with the machine busy only at its start, gave the same once loaded: level 22.8 fps,
room 18.8, pc 18.0, radio 19.6; `raw/visit-swiftshader-desktop.log`.)

Flights (the frames the camera moved in; the first is the first pull-back, made after the whole room was lit):

| run | flight | frames | fps | median ms | worst ms | > 20 ms % | > 33 ms % | > 50 ms % |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SwiftShader desktop | tv→room #1 | 19 | 16.9 | 45.8 | 193.9 | 100 | 100 | 36.8 |
| SwiftShader desktop | room→tv | 22 | 19.5 | 50.1 | 66.8 | 100 | 100 | 50 |
| SwiftShader desktop | tv→room #2 | 23 | 20.3 | 50 | 81.4 | 100 | 100 | 47.8 |
| SwiftShader desktop | room→pc | 18 | 16.4 | 62.1 | 86.9 | 100 | 100 | 77.8 |
| SwiftShader desktop | pc→room | 23 | 20.3 | 46.3 | 90 | 100 | 100 | 34.8 |
| SwiftShader desktop | room→radio | 21 | 19 | 50.6 | 90.6 | 100 | 100 | 66.7 |
| SwiftShader desktop | radio→room | 23 | 20.9 | 47.9 | 72.9 | 100 | 100 | 26.1 |
| SwiftShader phone | tv→room #1 | 22 | 19.9 | 41.2 | 189.4 | 100 | 86.4 | 22.7 |
| SwiftShader phone | room→tv | 27 | 24.3 | 41.1 | 50.6 | 100 | 92.6 | 3.7 |
| SwiftShader phone | tv→room #2 | 28 | 24.9 | 41 | 49.3 | 100 | 82.1 | 0 |
| SwiftShader phone | room→pc | 22 | 19.5 | 49.2 | 129.3 | 100 | 100 | 13.6 |
| SwiftShader phone | pc→room | 25 | 22.4 | 42.6 | 52.1 | 100 | 100 | 8 |
| SwiftShader phone | room→radio | 25 | 22.4 | 41.9 | 56.8 | 100 | 100 | 8 |
| SwiftShader phone | radio→room | 24 | 21.9 | 46.4 | 73.7 | 100 | 100 | 8.3 |
| Metal desktop | tv→room #1 | 126 | 114.6 | 8.3 | 57.4 | 0.8 | 0.8 | 0.8 |
| Metal desktop | the other six | 144–150 | 130–137 | 7.5–7.9 | 9–13.9 | 0 | 0 | 0 |

A 1.1 s flight is 18 to 28 frames on the software renderer; the first pull-back has one frame of 190 ms in it on
both sizes. `flights.mjs` itself, leaving at once (`raw/flights-desktop-swiftshader.log`): 15 to 23 frames a flight,
worst 61 to 204 ms, every frame over 20 ms.

Memory (MB; resident size from `ps`, which on Metal does not count what lives on the GPU):

| run | where | JS heap used / total | renderer | GPU process | all processes |
| --- | --- | --- | --- | --- | --- |
| SwiftShader desktop | tv, whole room lit | 12.4 / 14.9 | 321 | 251 | 887 |
| SwiftShader desktop | tv, level | 15 / 21 | 446 | 264 | 1120 |
| SwiftShader desktop | room | 17.1 / 27 | 469 | 280 | 1159 |
| SwiftShader desktop | pc | 17.9 / 22.5 | 497 | 309 | 1217 |
| SwiftShader desktop | radio | 19.1 / 23.1 | 485 | 292 | 1188 |
| SwiftShader phone | tv, level | 15.8 / 21.8 | 401 | 263 | 1067 |
| SwiftShader phone | pc | 17.6 / 21.4 | 491 | 304 | 1201 |
| Metal desktop | tv, level | 13.2 / 28.3 | 550 | 261 | 1277 |
| Metal desktop | room | 20.3 / 32.8 | 357 | 200 | 967 |
| flat, `--disable-gpu` | level | 8.8 / 15.7 | 425 | 154 | 1040 |

The JS heap is 12 to 21 MB everywhere. The software renderer does not cost more memory than Metal by this measure;
what it costs is CPU: **the GPU process keeps 7 to 9.5 of the 12 cores busy for as long as the page is open, in
every view, at rest too** (the room draws sixty frames a second whether or not something moves, and here never
finishes one in time), the computer view with the résumé over it included.

### What the views look like (looked at, all of them)

| File (`.shots/flights/nogpu/shots/`) | Shows |
| --- | --- |
| `swiftshader-desktop-tv-still-title-view.jpg` | the startup still with the title playing on it, room lit behind |
| `swiftshader-desktop-tv-level-view.jpg` / `metal-high-desktop-tv-level-view.jpg` | the TV view with a level: lit, lamp, plant, LED all there; softer than Metal (pixel ratio 0.83 against 1.52) |
| `swiftshader-desktop-room-view.jpg` / `metal-high-desktop-room-view.jpg` | the room: fully lit, every prop and poster there; stair-stepped edges (no multisampling) |
| `swiftshader-desktop-pc-view.jpg` | the computer: the résumé document, sharp (it is the page's own text over the room) |
| `swiftshader-desktop-radio-view.jpg` / `metal-high-desktop-radio-view.jpg` | the radio 8.5 s after landing: **the five discs bare silver**, where Metal has their prints |
| `swiftshader-desktop-radio-wait-{5,15,30,60}s-view.jpg` | the radio over a minute: prints up by 30 s (`radioTexturePixels` 18 432 → 455 337 at +20.6 s) |
| `sheet-swiftshader-phone.jpg` | the four views at the phone's size: all lit and complete, discs bare again |
| `sheet-room-desk-crops.jpg` | the desk in four runs: **the monitor shows a two-band placeholder (blue over green) on SwiftShader**, the wallpaper picture on Metal at the same `low` tier |
| `swiftshader-wait-ready+{0.5,2,6,12,25}s-view.jpg`, `swiftshader-wait-end-view.jpg` | the page while an early leaver waits: boot (a black picture) then the title, and still the title 177 s later |

Nothing is black or unlit in any view. What differs from the hardware picture beyond resolution and aliasing:

1. The radio's disc prints arrive about 20 s after landing there (one run followed that long; bare at 8.5 s in the
   two tours).
2. The monitor's wallpaper is still the placeholder 1.5 s and 7 s after landing in the room (two runs). Whether it
   ever arrives was not followed; `stats.backgroundPending` stayed true for the whole minute of the radio run.
   Both look like work that waits for an idle moment the software renderer never leaves (inferred, not traced).

## Case b: WebGL refused altogether

`node scripts/perf/nogpuFlat.mjs --dist .shots/flights/dist-base --label … --args "--disable-gpu" --shots … --out …`.
Chrome for Testing 151, desktop, Energy Saver off (`raw/flat-cft-disable-gpu.log`):

- **Load:** first paint 52 ms, first contentful paint 156 ms, the flat host mounted at 132 ms, the still told to go
  at 107 ms, the tube's CSS power-on from 132 to 905 ms, **game running at 905 ms**. `detectWebGL` is false, so the
  host is `flat` from the first render.
- **What it shows while loading** (`shots/flat-cft-disable-gpu-load-sheet-early.jpg`, frames of a screencast at 33,
  52, 121 … 514 ms; all 135 frames in `shots/flat-cft-disable-gpu-load/`): the first picture (52 ms) is the **room's**
  startup still, the dark 3D-looking set on its cabinet; from about 150 to 500 ms it cross-fades into the flat
  television, a larger set of another shape, the two showing through each other for the 400 ms of the fade; then the
  power-on line (300 ms), the bloom (514 ms), the picture. No broken room, no black frame and no canvas, but one TV
  is swapped for another in front of the visitor.
- **Frames:** 121 frames a second on boot and title (median 8.2 ms, worst 10.6) and in a level on autopilot (median
  8.2 ms, worst 13.6, none over 20 ms, 977 frames); the game's clock 60.0 to 60.4 steps a second. CPU: renderer
  0.05 to 0.19 of a core, GPU process (the software compositor) 0.24.
- **Nothing waits on a room:** 31 requests, 440 kB over the wire. No room file is asked for (`room-…js`, the bake's
  worker, the scene, the guide, the radio, the computer): none. The only failure is `/_vercel/insights/script.js`
  404, which is the local server lacking Vercel's analytics script. At the end: no animation running, the still
  `visibility: hidden`, no `aria-busy`, no room canvas, no "would not load" message.
- **What can be reached** (`shots/flat-cft-disable-gpu-{title,level,after-four-tabs,skip-link,resume}-view.jpg`):
  - With a keyboard: Tab from the screen goes to the sound toggle, then into the résumé, which shows itself as focus
    enters it ("Back to the game", then its links). Shift+Tab goes to "Skip to résumé"; Enter shows the résumé
    (`#resume`); "Back to the game" returns focus to the screen. The résumé's links: e-mail, LinkedIn, GitHub, the
    paper's DOI, `/CREDITS.txt`. **The game is not paused while the résumé covers it** (`paused: false` with a level
    running).
  - **With a mouse or a finger alone, the only things on the page are the screen and the sound toggle.** There is
    no visible way to the résumé (it exists only behind the skip link and Tab), and the hint under the set does not
    mention it. On a phone, with no Tab key, that leaves the URL `#resume`.
  - **The music is not reachable at all**: there is no radio in the flat host (as `FlatHost.tsx` says), no player,
    no track is requested.
  - The room's social links (X, LinkedIn, GitHub, e-mail) are the guide's and are not in the flat host; LinkedIn,
    GitHub and e-mail are in the résumé, X nowhere. The game's own link-outs (the next-level teaser's call to
    action in level select and stage clear) work as in the room (read from the source, not clicked).

The other flat runs (`raw/flat-*.log`; Energy Saver off; all end with no animation running, the still hidden, no
`aria-busy`, no canvas; all 31 requests, 440 kB, no room file; the same keyboard path and the same two controls
for a mouse):

| run | browser, flags, size | game running (ms) | boot and title | level | worst frame in the level (ms) | game steps/s | cores (renderer + GPU process) | JS heap used (MB) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `flat-cft-disable-gpu` | 151, `--disable-gpu`, desktop | 905 | 121.3 fps | 121.5 fps | 13.6 | 60.0 | 0.19 + 0.24 | 8.8 |
| `flat-chrome157-disable-gpu` | 157, `--disable-gpu`, desktop | 915 | 60 fps | 58.3 fps | 166.7 (one frame; the rest ≤ 16.8) | 59.2 | 0.27 + 0.33 | 8.1 |
| `flat-cft-disable-3d-apis` | 151, `--disable-3d-apis`, desktop | 1383 (first paint 208: a slow start of that browser) | 121.5 fps | 130.9 fps | 13.9 | 60 | 0.24 + 0.19 | 8.0 |
| `flat-chrome157-disable-3d-apis` | 157, `--disable-3d-apis`, desktop | 911 | 60 fps | 60 fps | 16.8 | 60 | 0.16 + 0.12 | 9.7 |
| `flat-cft-disable-gpu-phone` | 151, `--disable-gpu`, 390×844 at 3 | 919 | 122 fps | 121.8 fps | 13.6 | 60 | 0.18 + 0.04 | 8.8 |
| `flat-cft-disable-gpu-slow` | 151, `--disable-gpu`, Slow 4G and CPU ÷ 4 | 4274 | 114.8 fps | 99.7 fps | 41.5 | 60 | 0.96 + 0.23 | — |

(Headless Chrome 157 gives a page 60 frames a second, 151 gives 120: the flat host holds whichever it is given.)

**On a slow connection the fallback shows an empty page for a second and a half**
(`shots/flat-cft-disable-gpu-slow-load-sheet.jpg`; Slow 4G, CPU four times slower): first paint at 436 ms is the
room's still; the app takes it away at 1788 ms, as soon as it has run (`TvStill` is told `shown: false` on the first
render because the host is flat); the flat host is mounted only at 3482 ms, when the game's assets are in (`Arcade`
is rendered once `created`). Between about 2.1 s and 3.5 s the screencast has one frame and it is a bare dark page:
no still, no television. On the fast local load the gap is 25 ms and hides inside the still's 400 ms fade.

**The flat host costs the same with a GPU as without** (`raw/flat-hw-forced.log`, `?host=flat` on Metal): 121 fps,
worst frame 9.5 ms, 0.16 + 0.12 of a core, the same 31 requests and 440 kB.

**A room that fails after it was chosen** (the host is `room` because `detectWebGL` said yes, then the room cannot
be made). Both fall back and end clean (no animation, no still, no canvas, no message), game at 60 steps a second:

| run | what fails | host sequence (ms) | game running (ms) | requests, over the wire | wasted |
| --- | --- | --- | --- | --- | --- |
| `flat-hw-room-chunk-blocked` | the request for `room-….js` | room@151 → flat@166 | 938 | 32, 440 kB | the failed request |
| `flat-hw-webgl1-only` | `getContext('webgl2')` gives null, WebGL 1 works: three.js throws "Error creating WebGL context" | room@141 → flat@165 | 955 | 32, **628 kB** | `room-….js`, 192 kB, fetched and run for nothing |
| `flat-hw-webgl1-only-slow` | the same on Slow 4G with the CPU four times slower | room@3457 → flat@4750 | 3802 (on the still) | 35, 634 kB | the room's chunk and the guide's (192 + 6 kB) |

`detectWebGL` answers yes to a browser with WebGL 1 only, and the room needs WebGL 2, so that visitor always pays
for the room's chunk before getting the flat television. On the slow connection it shows
(`shots/flat-hw-webgl1-only-slow-load-sheet.jpg`): the game powers on and plays its boot on the room's still from
3.8 s; at 4.75 s the room gives up, the still cross-fades into the flat television, and **that television runs its
own power-on (line, bloom) over the game that has been running for a second**, until 5.5 s. The visitor sees the TV
turn on twice and loses the middle of the boot. (The WebGL-1-only browser was stood in for by making the page's
`getContext('webgl2')` return null on a hardware Chrome; no real such browser was run.)

`raw/room-hw-reference.log` (the room host's own request list, for comparison) failed with the browser closing
under it and was not repeated.

## Case c: the GPU process lost mid-visit

Owed: `E2E_PORT=4391 pnpm exec playwright test e2e/gpu-reset.spec.ts` had not been run when this was written.

## The judgement asked for

**Does the software renderer hold a usable frame rate in the 3D room on the lowest tier? No.** On twelve M4 cores
with eight to nine of them working, the room gives 17 to 22 frames a second at 1440 × 900 (median frame 46 to 58 ms,
every frame over 33 ms, a fifth to nine tenths over 50 ms depending on the view) and 21 to 26 at the phone's size;
flights are 18 to 28 frames. The game inside it keeps full speed and its input, shown at those 20-odd frames. The
room is not whole for three to five minutes, and a visitor who clicks "Explore the room" in that time waits half a
minute to several minutes with nothing on the page saying so (this build). A machine that has no GPU rarely has
twelve fast cores; how it goes on four was to be measured and is owed.

The options, with what was measured for each:

| Option | What the visitor gets | Numbers |
| --- | --- | --- |
| Leave it: the room on the software renderer at `low` × 1 | the whole site, slowly | 17–26 fps, 7–9.5 cores busy for the whole visit, whole room after 3–5 min, 0.7 s freeze in the game at start |
| Fewer pixels on the software renderer | the same picture, blockier | **owed** (runs parked). What is in hand: 0.74 MP (phone) against 0.90 MP (desktop) is 41 ms against 46–53 ms a frame, so 18 % fewer pixels bought 10–20 %; the frame is not all fill |
| The flat television for software renderers too | the game at full rate; no room, no radio, résumé behind the keyboard only | 121 fps (worst frame 13.6 ms), 0.3–0.45 of a core, game running at 0.9 s, 440 kB, nothing else fetched |
| Telling them apart | — | `failIfMajorPerformanceCaveat: true` is refused exactly where the renderer is SwiftShader behind `--disable-gpu`, and the renderer's name is readable on the probe context (`softwareGpu.ts` already reads it later, once the room's chunk is in) |

And two things that hold whichever is chosen: in current Chrome on a Mac the no-GPU visitor is on the flat
television already, so what that host lacks (a way to the résumé for a mouse or a finger, the music, the swap of one
TV for another at load) is what that visitor meets; and the software path is what `flights.mjs`, `profile.mjs`
with `PERF_GL=swiftshader` and every e2e run under Playwright exercise, because Playwright passes the flag.

## Verified by running, and inferred

Verified by running: everything in the tables; the launch matrix in both browsers; tier and scale; the bake's
times; the 0.7 s task and where it falls between the bake's marks; the early-leave waits and the page's state during
one; every screenshot described; the flat host's load, frames, requests and keyboard path; the Energy Saver cap and
its cure; Playwright's default flag (read in its source and seen in the browser's command line).

Inferred from reading code or documents: why the rest of the bake takes minutes (`pace.ts`) and why the early
leaver's wait is long (`HURRY_HOLD_MS`); that the late disc prints and the monitor's placeholder are idle work
starved by frames that are always late; what Chrome does on other platforms (Chromium's intent thread, not run);
that the game's teaser links work in the flat host.

Not checked: that the page-clock frames are the frames presented under software WebGL (no trace taken); Windows,
Linux, Firefox, Safari; a real machine without a GPU.

## Still owed

1. **Frame time against pixels** on the software renderer (`nogpu.mjs --quick` at 1440×900 with device scale 1 and
   0.5, at 720×450, and with every process on the efficiency cores via `--ecores` as a stand-in for a four-core
   machine). Each run holds 8–9 cores for minutes: parked until the laptop is on mains.
2. **Chrome 157 on software WebGL** (its one run, and the Metal `low` and phone references, were taken under the
   Energy Saver cap and are discarded: `raw/early-swiftshader-desktop-chrome157.*`, `raw/visit-metal-low-desktop.*`,
   `raw/visit-metal-phone.*`; their screenshots are valid, their frame numbers are not).
3. **The rest of case b and case c**: the flat host in Chrome 157 and at the phone's size, `--disable-3d-apis`, a
   room that fails after it was chosen (its chunk blocked; WebGL 1 without WebGL 2), the forced flat host on a
   hardware GPU for comparison, and the gpu-reset e2e test.
